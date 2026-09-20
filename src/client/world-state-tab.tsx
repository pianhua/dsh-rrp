/**
 * dsh-rrp — the WorldState right-sidebar tab.
 *
 * Registers through the native right-sidebar path (ctx.sidebarRightTabs +
 * the keyed sidebar.right.pane.tab seat) and presents a structured, inline
 * editor: one card per character/item, one row per flag, three scene fields.
 * The player corrects the state in place (D6, no locks); saving posts the
 * whole edited state to the host route, and the panel re-reads the
 * authoritative projection.
 *
 * The chrome is built from the host's own atoms
 * (\`@deepseek-ai/dsh-client-ui-primitives\`) and \`--dsw-alias-*\` tokens so it
 * matches whatever light/dark theme the user runs.
 */
import {
  Button,
  IconLoadingOutline16,
  IconPlusOutline16,
  IconTrashOutline16,
  Input,
  Pill,
  StateDot,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { pendingActivity, type RrpActivityLog } from '../activity.ts'
import { CARD_KEY, type CardContext } from '../card-types.ts'
import { SUMMARY_KEY, type MacroSummary } from '../macro-summary.ts'
import { promptBudgetReport, type BudgetReport, type BudgetSection } from '../prompt-budget.ts'
import type { RrpUseSessions, RrpJobView } from './context-types.ts'
import {
  WORLD_STATE_KEY,
  getDynamicKeys,
  isValidFieldId,
  isCoreKey,
  createDynamicField,
  type WorldState,
  type WorldStateCharacter,
  type WorldStateItem,
  type WorldStateRelation,
  type WorldStateView,
  type DynamicFieldValue,
} from '../world-state.ts'
import type { RrpClientContext } from './context-types.ts'

/** Implementation identity; also the key the body registers under. */
const TAB_ID = 'dsh-rrp/world-state'
/** Type discriminator openTab names. */
const TAB_KIND = 'dsh-rrp-worldstate'
import { RRP_ROUTES, routeUrl, type LoreGetResponse } from '../route-contract.ts'

/** Paths come from the shared route contract (#22). */
const CORRECTION_PATH = RRP_ROUTES.worldState
const ACTIVITY_PATH = RRP_ROUTES.activity
const LORE_PATH = RRP_ROUTES.lore
/** Fallback poll interval, used only when the host jobs mirror is unavailable. */
const ACTIVITY_POLL_MS = 2000

type Translate = (key: string) => string

/** Props the slot framework merges: our inject face plus session standards. */
interface WorldStatePanelProps {
  t?: Translate
  useProjection?: (key: string) => unknown
  useSessions?: RrpUseSessions
  sessionId?: string
}

interface CharacterRow {
  name: string
  affinity: string
  mood: string
  appearance: string
  condition: string
}
interface ItemRow {
  name: string
  quantity: string
  note: string
}
interface FlagRow {
  key: string
  value: string
}
interface DynamicFieldRow {
  id: string
  type: 'number' | 'string' | 'boolean'
  value: string  // Always string in UI, parsed on save
  min?: string
  max?: string
}
interface Draft {
  characters: CharacterRow[]
  inventory: ItemRow[]
  flags: FlagRow[]
  scene: { location: string; time: string; weather: string }
  relations: WorldStateRelation[]
  dynamicFields: DynamicFieldRow[]
}

/** The three row lists that need generated React keys (see WorldStatePanel). */
type RowListName = 'characters' | 'inventory' | 'flags'

/** Project the read-only slice into an array-based draft for stable editing. */
function draftOf(view: WorldStateView | undefined): Draft {
  // Extract dynamic fields
  const dynamicKeys = view ? getDynamicKeys(view) : []
  const dynamicFields: DynamicFieldRow[] = dynamicKeys.map(id => {
    const field = view![id] as DynamicFieldValue
    return {
      id,
      type: field.type,
      value: String(field.value),
      min: field.min !== undefined ? String(field.min) : undefined,
      max: field.max !== undefined ? String(field.max) : undefined,
    }
  })
  
  return {
    characters: Object.entries(view?.characters ?? {}).map(([name, value]) => ({
      name,
      affinity: value.affinity === undefined ? '' : String(value.affinity),
      mood: value.mood ?? '',
      appearance: value.appearance ?? '',
      condition: value.condition ?? '',
    })),
    inventory: Object.entries(view?.inventory ?? {}).map(([name, value]) => ({
      name,
      quantity: value.quantity === undefined ? '' : String(value.quantity),
      note: value.note ?? '',
    })),
    flags: Object.entries(view?.flags ?? {}).map(([key, value]) => ({ key, value: String(value) })),
    scene: {
      location: view?.scene?.location ?? '',
      time: view?.scene?.time ?? '',
      weather: view?.scene?.weather ?? '',
    },
    // Relations are read-only in the panel (maintained by the Chronicler);
    // copy them so draft edits can never alias projection objects.
    relations: (view?.relations ?? []).map((rel) => ({ ...rel })),
    dynamicFields,
  }
}

/** True when the whole slice carries no information at all. */
function isEmptyDraft(draft: Draft): boolean {
  return draft.characters.length === 0
    && draft.inventory.length === 0
    && draft.flags.length === 0
    && draft.relations.length === 0
    && draft.scene.location.length === 0
    && draft.scene.time.length === 0
    && draft.scene.weather.length === 0
    && draft.dynamicFields.length === 0
}

/** Parse a free-text flag value into string | number | boolean. */
function parseFlagValue(raw: string): string | number | boolean {
  const text = raw.trim()
  if (text === 'true') return true
  if (text === 'false') return false
  if (text.length > 0 && !Number.isNaN(Number(text))) return Number(text)
  return raw
}

/** Rebuild the whole-value WorldState from the editable draft. */
function stateOfDraft(draft: Draft): WorldState {
  const characters: Record<string, WorldStateCharacter> = {}
  for (const row of draft.characters) {
    const name = row.name.trim()
    if (name.length === 0) continue
    const entry: WorldStateCharacter = {}
    const affinity = row.affinity.trim()
    if (affinity.length > 0 && !Number.isNaN(Number(affinity))) entry.affinity = Number(affinity)
    if (row.mood.trim().length > 0) entry.mood = row.mood.trim()
    if (row.appearance.trim().length > 0) entry.appearance = row.appearance.trim()
    if (row.condition.trim().length > 0) entry.condition = row.condition.trim()
    characters[name] = entry
  }
  const inventory: Record<string, WorldStateItem> = {}
  for (const row of draft.inventory) {
    const name = row.name.trim()
    if (name.length === 0) continue
    const entry: WorldStateItem = {}
    const quantity = row.quantity.trim()
    if (quantity.length > 0 && !Number.isNaN(Number(quantity))) entry.quantity = Number(quantity)
    if (row.note.trim().length > 0) entry.note = row.note.trim()
    inventory[name] = entry
  }
  const flags: WorldState['flags'] = {}
  for (const row of draft.flags) {
    const key = row.key.trim()
    if (key.length === 0) continue
    flags[key] = parseFlagValue(row.value)
  }
  const scene: WorldState['scene'] = {}
  if (draft.scene.location.trim().length > 0) scene.location = draft.scene.location.trim()
  if (draft.scene.time.trim().length > 0) scene.time = draft.scene.time.trim()
  if (draft.scene.weather.trim().length > 0) scene.weather = draft.scene.weather.trim()
  
  // Build base state (relations pass through untouched: read-only here)
  const state: WorldState = { characters, inventory, flags, scene, relations: draft.relations.map((rel) => ({ ...rel })) }
  
  // Add dynamic fields
  for (const row of draft.dynamicFields) {
    const id = row.id.trim()
    if (id.length === 0 || !isValidFieldId(id)) continue
    
    let value: number | string | boolean
    const valueStr = row.value.trim()
    
    if (row.type === 'number') {
      value = Number(valueStr)
      if (Number.isNaN(value)) value = 0
    } else if (row.type === 'boolean') {
      value = valueStr === 'true' || valueStr === '1'
    } else {
      value = valueStr
    }
    
    const constraints: { min?: number; max?: number } = {}
    if (row.min !== undefined && row.min.trim().length > 0) {
      const min = Number(row.min)
      if (!Number.isNaN(min)) constraints.min = min
    }
    if (row.max !== undefined && row.max.trim().length > 0) {
      const max = Number(row.max)
      if (!Number.isNaN(max)) constraints.max = max
    }
    
    state[id] = createDynamicField(row.type, value, constraints)
  }
  
  return state
}

const S: Record<string, CSSProperties> = {
  root: { height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)' },
  header: {
    flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px',
    borderBottom: '1px solid var(--dsw-alias-border-l1)',
  },
  title: { fontSize: 14, fontWeight: 600 },
  presetTag: {
    fontSize: 10.5, fontWeight: 500, padding: '2px 7px', borderRadius: 4,
    background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-secondary)',
    fontFamily: 'var(--dsw-font-mono, monospace)', letterSpacing: '0.01em',
    maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
  },
  spacer: { flex: 1 },
  scroll: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px' },
  hint: { margin: '0 0 12px', fontSize: 11.5, lineHeight: 1.6, color: 'var(--dsw-alias-label-tertiary)' },
  budget: {
    display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', marginBottom: 12,
    borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
  },
  budgetHead: { display: 'flex', alignItems: 'center', gap: 8 },
  budgetTitle: {
    flex: 1, fontSize: 11, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)',
    letterSpacing: '0.03em', textTransform: 'uppercase' as const,
  },
  budgetText: { fontSize: 11, fontWeight: 600, fontFamily: 'var(--dsw-font-mono, monospace)' },
  budgetBar: {
    display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden',
    background: 'var(--dsw-alias-bg-layer-2)',
  },
  empty: {
    display: 'flex', flexDirection: 'column', gap: 6, padding: '12px', marginBottom: 12,
    borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px dashed var(--dsw-alias-border-l2)', fontSize: 12,
    color: 'var(--dsw-alias-label-tertiary)',
  },
  activity: {
    display: 'flex', flexDirection: 'column', gap: 6, padding: '12px', marginBottom: 16,
    borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
  },
  activityHead: { fontSize: 11, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', letterSpacing: '0.03em', textTransform: 'uppercase' as const, marginBottom: 4 },
  activityEmpty: { fontSize: 11, color: 'var(--dsw-alias-label-dimmed)' },
  activityRow: { display: 'flex', gap: 6, fontSize: 11, lineHeight: 1.5, alignItems: 'baseline' },
  activityWho: { flex: '0 0 auto', fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' },
  activityWhat: { flex: 1, minWidth: 0, color: 'var(--dsw-alias-label-tertiary)', wordBreak: 'break-word' },
  activityWhen: { flex: '0 0 auto', color: 'var(--dsw-alias-label-dimmed)' },
  running: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--dsw-alias-label-secondary)' },
  section: { display: 'flex', alignItems: 'center', gap: 8, margin: '20px 0 10px' },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
  card: {
    display: 'flex', flexDirection: 'column', gap: 10, padding: '12px', marginBottom: 12,
    borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
    transition: 'border-color 0.15s ease',
  },
  cardHead: { display: 'flex', alignItems: 'center', gap: 8 },
  cardLabel: { fontSize: 11.5, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', opacity: 0.85, flex: 1 },
  field: { display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 },
  fieldLabel: { fontSize: 11, fontWeight: 500, color: 'var(--dsw-alias-label-tertiary)', opacity: 0.75 },
  grid2: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  half: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 },
  footer: {
    flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
    borderTop: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-base)',
  },
  status: { flex: 1, minWidth: 0, fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary)', lineHeight: 1.4 },
  collapsible: { marginBottom: 20 },
  collapseHeader: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', cursor: 'pointer',
    userSelect: 'none' as const, borderRadius: 6,
    transition: 'background 0.15s ease',
  },
  collapseArrow: { 
    fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', 
    transition: 'transform 0.2s ease',
  },
  collapseArrowExpanded: { transform: 'rotate(90deg)' },
  collapseTitle: { fontSize: 13.5, fontWeight: 600, color: 'var(--dsw-alias-label-primary)', letterSpacing: '-0.01em' },
  collapseContent: { paddingLeft: 0, marginTop: 4 },
  dynamicFieldCard: {
    display: 'flex', flexDirection: 'column' as const, gap: 10, padding: '12px', marginBottom: 12,
    borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
    transition: 'border-color 0.15s ease',
  },
  dynamicFieldHeader: { display: 'flex', alignItems: 'center', gap: 8 },
  dynamicFieldId: { fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--dsw-font-mono, monospace)', flex: 1, color: 'var(--dsw-alias-label-primary)' },
  dynamicFieldType: { fontSize: 10, fontWeight: 500, padding: '3px 7px', borderRadius: 4, background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-secondary)', letterSpacing: '0.02em' },
  addFieldForm: {
    padding: '14px', marginBottom: 12, borderRadius: 8,
    background: 'var(--dsw-alias-bg-layer-1)', border: '1px dashed var(--dsw-alias-border-l2)',
  },
  relationRow: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 8,
    borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)', fontSize: 12,
  },
  relationName: { fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
  relationLabel: { flex: 1, minWidth: 0, textAlign: 'center' as const, color: 'var(--dsw-alias-label-tertiary)' },
  relationEmpty: { fontSize: 11, color: 'var(--dsw-alias-label-dimmed)', padding: '2px 0 8px' },
  formRow: { display: 'flex', gap: 10, marginBottom: 10 },
  formField: { flex: 1, minWidth: 0 },
  formActions: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 },
}

/** Local wall-clock label for a ledger entry. */
function clockOf(at: string): string {
  const date = new Date(at)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** One labelled text field. */
function Field(props: {
  label: string
  value: string
  placeholder?: string
  disabled?: boolean
  onChange: (next: string) => void
}): ReactNode {
  return (
    <label style={S.field}>
      <span style={S.fieldLabel}>{props.label}</span>
      <Input
        value={props.value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  )
}

/** A section heading with a count and an add action. */
function SectionHead(props: {
  title: string
  count: number
  addLabel: string
  disabled?: boolean
  onAdd: () => void
}): ReactNode {
  return (
    <div style={S.section}>
      <span style={S.sectionTitle}>{props.title}</span>
      <Pill>{String(props.count)}</Pill>
      <span style={S.spacer} />
      <Button
        variant="ghost"
        size="sm"
        icon={<IconPlusOutline16 size={16} />}
        disabled={props.disabled}
        onClick={props.onAdd}
      >
        {props.addLabel}
      </Button>
    </div>
  )
}

/** The remove control shared by every editable card. */
function RemoveButton(props: {
  label: string
  disabled?: boolean
  onClick: () => void
}): ReactNode {
  return (
    <Tooltip label={props.label}>
      <Button
        variant="ghost"
        size="sm"
        icon={<IconTrashOutline16 size={16} />}
        aria-label={props.label}
        disabled={props.disabled}
        onClick={props.onClick}
      />
    </Tooltip>
  )
}

function WorldStatePanel(props: WorldStatePanelProps): ReactNode {
  const t: Translate = typeof props.t === 'function' ? props.t : (key) => key
  const view = typeof props.useProjection === 'function'
    ? (props.useProjection(WORLD_STATE_KEY) as WorldStateView | undefined)
    : undefined
  // The session's own preset (rp-<card>), distinct from the DSH global default
  // in Settings. Read-only: this panel never changes it.
  const sessionPreset = typeof props.useProjection === 'function'
    ? (props.useProjection('agentPreset') as string | undefined)
    : undefined
  // The two other injection channels the Author actually sees (A3 gauge):
  // the active card setting and the macro chronicle. Both ride projections.
  const cardContext = typeof props.useProjection === 'function'
    ? (props.useProjection(CARD_KEY) as CardContext | null | undefined)
    : undefined
  const macroSummary = typeof props.useProjection === 'function'
    ? (props.useProjection(SUMMARY_KEY) as MacroSummary | undefined)
    : undefined
  // Conditional-injection payload size (issue #16): served by the lore route.
  // Fetch failure degrades silently — the gauge simply omits the segment.
  const [injectedChars, setInjectedChars] = useState<number | undefined>(undefined)
  const budgetReport = promptBudgetReport({
    card: cardContext ?? null,
    summary: macroSummary ?? undefined,
    state: view,
    injectedChars,
  })
  const showBudget = cardContext != null || macroSummary != null || view != null
  const sessionId = props.sessionId
  // The host pushes job state per session (`jobsBySession` mirror): the
  // Chronicler's in-flight state needs no ledger round-trips where available.
  const chroniclerJobs = typeof props.useSessions === 'function' && sessionId !== undefined
    ? props.useSessions((state) => state.jobsBySession[sessionId]) as readonly RrpJobView[] | undefined
    : undefined
  const jobsInferring = chroniclerJobs === undefined
    ? undefined
    : chroniclerJobs.some((job) => job.kind === 'chronicler' && (job.status === 'running' || job.status === 'stopping'))
  const [activity, setActivity] = useState<RrpActivityLog | undefined>(undefined)
  const recentActivity = (activity?.entries ?? []).slice(-4).reverse()
  const ledgerInferring = activity === undefined ? undefined : pendingActivity(activity, 'world-state') !== undefined
  const isInferring = jobsInferring ?? ledgerInferring ?? false

  const [draft, setDraft] = useState<Draft>(() => draftOf(view))
  const [dirty, setDirty] = useState(false)
  const [showAddField, setShowAddField] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  // Stable React keys for the three editable row lists. Rows carry no id of
  // their own and `mutate` deep-clones the draft, so identity cannot key them;
  // a parallel key array kept in the same operations as push/splice survives
  // both. React docs: index keys mis-associate state on mid-list deletion.
  const rowKeySeq = useRef(0)
  const nextRowKey = (): string => {
    rowKeySeq.current += 1
    return 'row-' + String(rowKeySeq.current)
  }
  const fitRowKeys = (keys: readonly string[], length: number): string[] => {
    if (keys.length === length) return [...keys]
    if (keys.length > length) return keys.slice(0, length)
    return [...keys, ...Array.from({ length: length - keys.length }, nextRowKey)]
  }
  const [rowKeys, setRowKeys] = useState<Record<RowListName, string[]>>(() => {
    const initial = draftOf(view)
    return {
      characters: fitRowKeys([], initial.characters.length),
      inventory: fitRowKeys([], initial.inventory.length),
      flags: fitRowKeys([], initial.flags.length),
    }
  })
  const adoptDraft = (next: Draft): void => {
    setDraft(next)
    setRowKeys((previous) => ({
      characters: fitRowKeys(previous.characters, next.characters.length),
      inventory: fitRowKeys(previous.inventory, next.inventory.length),
      flags: fitRowKeys(previous.flags, next.flags.length),
    }))
  }
  const addRowKey = (list: RowListName): void => {
    if (isInferring) return
    setRowKeys((previous) => ({ ...previous, [list]: [...previous[list], nextRowKey()] }))
  }
  const removeRowKey = (list: RowListName, index: number): void => {
    if (isInferring) return
    setRowKeys((previous) => ({ ...previous, [list]: previous[list].filter((_, at) => at !== index) }))
  }

  // Follow the authoritative projection until the player starts editing.
  useEffect(() => {
    if (!dirty) adoptDraft(draftOf(view))
  }, [view, dirty])

  // D6: When Chronicler finishes, reload the projection — but never clobber
  // unsaved player edits: keep the draft and let the player decide to save.
  const [wasInferring, setWasInferring] = useState(false)
  useEffect(() => {
    if (isInferring) {
      setWasInferring(true)
    } else if (wasInferring) {
      setWasInferring(false)
      if (dirty) {
        setStatus(t('chronicler.completed') + ' · ' + t('unsaved.kept'))
      } else {
        // Chronicler just finished, reload from projection
        adoptDraft(draftOf(view))
        setStatus(t('chronicler.completed'))
      }
    }
  }, [isInferring, wasInferring, view, t, dirty])

  // The activity ledger is host-side and transient. Push-first: load once,
  // refresh once when the Chronicler settles. The 2s timer survives ONLY as a
  // fallback for hosts where the jobs mirror is not injected into this seat.
  const loadActivity = (): void => {
    if (sessionId === undefined) return
    void fetch(routeUrl(ACTIVITY_PATH, sessionId))
      .then((response) => (response.ok ? response.json() as Promise<RrpActivityLog> : undefined))
      .then((log) => {
        if (log !== undefined) setActivity(log)
      })
      .catch(() => {
        /* the ledger is best-effort */
      })
    void fetch(routeUrl(LORE_PATH, sessionId))
      .then((response) => (response.ok ? response.json() as Promise<Pick<LoreGetResponse, 'injectedChars'>> : undefined))
      .then((body) => {
        if (body !== undefined && typeof body.injectedChars === 'number') setInjectedChars(body.injectedChars)
      })
      .catch(() => {
        /* the injection gauge degrades silently */
      })
  }
  useEffect(() => {
    if (sessionId === undefined) {
      setActivity(undefined)
      return
    }
    loadActivity()
    if (typeof props.useSessions === 'function') return
    const timer = setInterval(loadActivity, ACTIVITY_POLL_MS)
    return () => {
      clearInterval(timer)
    }
  }, [sessionId, props.useSessions])

  // Chronicler settled → one one-shot ledger refresh.
  const wasJobsInferring = useRef(false)
  useEffect(() => {
    if (jobsInferring === true) {
      wasJobsInferring.current = true
      return
    }
    if (wasJobsInferring.current) {
      wasJobsInferring.current = false
      loadActivity()
    }
  }, [jobsInferring])

  const mutate = (change: (next: Draft) => void): void => {
    if (isInferring) return
    setDraft((previous) => {
      const next = structuredClone(previous)
      change(next)
      return next
    })
    setDirty(true)
    setStatus('')
  }

  const save = (): void => {
    if (sessionId === undefined) {
      setStatus(t('noSession'))
      return
    }
    setSaving(true)
    setStatus(t('saving'))
    void fetch(CORRECTION_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, state: stateOfDraft(draft) }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.text()) || String(response.status))
        setDirty(false)
        setStatus(t('saved'))
      })
      .catch((error: unknown) => {
        setStatus(t('saveFailed') + ': ' + String((error as { message?: string })?.message ?? error))
      })
      .finally(() => setSaving(false))
  }

  return (
    <div className="dsh-rrp-world" style={S.root}>
      <div style={S.header}>
        <span style={S.title}>{t('title')}</span>
        {sessionPreset !== undefined && sessionPreset.length > 0 ? (
          <Tooltip label={t('preset.hint')}>
            <span style={S.presetTag}>{sessionPreset}</span>
          </Tooltip>
        ) : null}
        <span style={S.spacer} />
        {dirty ? <Pill active>{t('unsaved')}</Pill> : null}
      </div>

      <div style={S.scroll}>
        {showBudget ? <BudgetGauge t={t} report={budgetReport} /> : null}
        <p style={S.hint}>{t('editHint')}</p>

        {isEmptyDraft(draft) ? <div style={S.empty}>{t('world.missing')}</div> : null}

        <div style={S.activity}>
          <div style={S.activityHead}>{t('activity.title')}</div>
          {isInferring ? (
            <div style={S.running}>
              <StateDot state="ongoing" />
              <span>{t('activity.running')}</span>
            </div>
          ) : null}
          {recentActivity.length === 0 ? <div style={S.activityEmpty}>{t('activity.none')}</div> : null}
          {recentActivity.map((entry, index) => (
            <div key={entry.id + ':' + entry.phase + ':' + index} style={S.activityRow}>
              <span style={S.activityWho}>{t('actor.' + entry.actor)}</span>
              <span style={S.activityWhat}>
                {t('phase.' + entry.phase)}
                {entry.detailKey !== undefined
                  ? ' · ' + t(entry.detailKey).replaceAll('{name}', entry.detailName ?? '')
                  : entry.detail !== undefined && entry.detail.length > 0
                    ? ' · ' + entry.detail
                    : ''}
              </span>
              <span style={S.activityWhen}>{clockOf(entry.at)}</span>
            </div>
          ))}
        </div>

        <CollapsibleSection title={t('section.coreState')} defaultExpanded={true}>
        <div style={S.section}><span style={S.sectionTitle}>{t('section.scene')}</span></div>
        <div style={S.card}>
          <Field disabled={isInferring} label={t('scene.location')} value={draft.scene.location} onChange={(v) => mutate((d) => { d.scene.location = v })} />
          <div style={S.grid2}>
            <div style={S.half}>
              <Field disabled={isInferring} label={t('scene.time')} value={draft.scene.time} onChange={(v) => mutate((d) => { d.scene.time = v })} />
            </div>
            <div style={S.half}>
              <Field disabled={isInferring} label={t('scene.weather')} value={draft.scene.weather} onChange={(v) => mutate((d) => { d.scene.weather = v })} />
            </div>
          </div>
        </div>

        <SectionHead
          title={t('section.characters')}
          count={draft.characters.length}
          addLabel={t('add')}
          disabled={isInferring}
          onAdd={() => {
            mutate((d) => { d.characters.push({ name: '', affinity: '', mood: '', appearance: '', condition: '' }) })
            addRowKey('characters')
          }}
        />
        {draft.characters.map((row, index) => (
          <div key={rowKeys.characters[index]} style={S.card}>
            <div style={S.cardHead}>
              <span style={S.cardLabel}>{t('section.characters') + ' ' + String(index + 1)}</span>
              <RemoveButton disabled={isInferring} label={t('remove')} onClick={() => {
                mutate((d) => { d.characters.splice(index, 1) })
                removeRowKey('characters', index)
              }} />
            </div>
            <Field disabled={isInferring} label={t('name')} value={row.name} onChange={(v) => mutate((d) => { d.characters[index].name = v })} />
            <div style={S.grid2}>
              <div style={S.half}>
                <Field disabled={isInferring} label={t('field.affinity')} value={row.affinity} onChange={(v) => mutate((d) => { d.characters[index].affinity = v })} />
              </div>
              <div style={S.half}>
                <Field disabled={isInferring} label={t('field.mood')} value={row.mood} onChange={(v) => mutate((d) => { d.characters[index].mood = v })} />
              </div>
            </div>
            <Field disabled={isInferring} label={t('field.appearance')} value={row.appearance} onChange={(v) => mutate((d) => { d.characters[index].appearance = v })} />
            <Field disabled={isInferring} label={t('field.condition')} value={row.condition} onChange={(v) => mutate((d) => { d.characters[index].condition = v })} />
          </div>
        ))}

        <div style={S.section}>
          <span style={S.sectionTitle}>{t('section.relations')}</span>
          <Pill>{String(draft.relations.length)}</Pill>
        </div>
        {draft.relations.length === 0 ? (
          <div style={S.relationEmpty}>{t('relations.none')}</div>
        ) : draft.relations.map((rel, index) => (
          <div key={'relation-' + String(index)} style={S.relationRow}>
            <span style={S.relationName}>{rel.a}</span>
            <span style={S.relationLabel}>· {rel.label} ·</span>
            <span style={S.relationName}>{rel.b}</span>
          </div>
        ))}

        <SectionHead
          title={t('section.inventory')}
          count={draft.inventory.length}
          addLabel={t('add')}
          disabled={isInferring}
          onAdd={() => {
            mutate((d) => { d.inventory.push({ name: '', quantity: '', note: '' }) })
            addRowKey('inventory')
          }}
        />
        {draft.inventory.map((row, index) => (
          <div key={rowKeys.inventory[index]} style={S.card}>
            <div style={S.cardHead}>
              <span style={S.cardLabel}>{t('section.inventory') + ' ' + String(index + 1)}</span>
              <RemoveButton disabled={isInferring} label={t('remove')} onClick={() => {
                mutate((d) => { d.inventory.splice(index, 1) })
                removeRowKey('inventory', index)
              }} />
            </div>
            <Field disabled={isInferring} label={t('name')} value={row.name} onChange={(v) => mutate((d) => { d.inventory[index].name = v })} />
            <div style={S.grid2}>
              <div style={S.half}>
                <Field disabled={isInferring} label={t('field.quantity')} value={row.quantity} onChange={(v) => mutate((d) => { d.inventory[index].quantity = v })} />
              </div>
              <div style={S.half}>
                <Field disabled={isInferring} label={t('field.note')} value={row.note} onChange={(v) => mutate((d) => { d.inventory[index].note = v })} />
              </div>
            </div>
          </div>
        ))}

        <SectionHead
          title={t('section.flags')}
          count={draft.flags.length}
          addLabel={t('add')}
          disabled={isInferring}
          onAdd={() => {
            mutate((d) => { d.flags.push({ key: '', value: '' }) })
            addRowKey('flags')
          }}
        />
        {draft.flags.map((row, index) => (
          <div key={rowKeys.flags[index]} style={S.card}>
            <div style={S.cardHead}>
              <span style={S.cardLabel}>{t('section.flags') + ' ' + String(index + 1)}</span>
              <RemoveButton disabled={isInferring} label={t('remove')} onClick={() => {
                mutate((d) => { d.flags.splice(index, 1) })
                removeRowKey('flags', index)
              }} />
            </div>
            <Field disabled={isInferring} label={t('flag.key')} value={row.key} onChange={(v) => mutate((d) => { d.flags[index].key = v })} />
            <Field disabled={isInferring} label={t('flag.value')} value={row.value} onChange={(v) => mutate((d) => { d.flags[index].value = v })} />
          </div>
        ))}
        </CollapsibleSection>

        {/* Dynamic Fields Section */}
        <CollapsibleSection title={t('section.dynamicFields')} defaultExpanded={true}>
          {showAddField ? (
            <AddFieldForm
              t={t}
              existingIds={draft.dynamicFields.map((field) => field.id)}
              disabled={isInferring}
              onAdd={(newField) => {
                mutate((d) => { d.dynamicFields.push(newField) })
                setShowAddField(false)
              }}
              onCancel={() => setShowAddField(false)}
            />
          ) : (
            <Button 
              variant="ghost" 
              size="sm" 
              icon={<IconPlusOutline16 size={16} />}
              disabled={isInferring}
              onClick={() => setShowAddField(true)}
              style={{ marginBottom: 12 }}
            >
              {t('add')}
            </Button>
          )}
          
          {draft.dynamicFields.length === 0 && !showAddField && (
            <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', padding: '8px 0' }}>
              {t('dynamicFields.none')}
            </div>
          )}
          
          {draft.dynamicFields.map((field, index) => (
            <DynamicFieldEditor
              key={field.id}
              t={t}
              field={field}
              disabled={isInferring}
              onChange={(updated) => mutate((d) => { d.dynamicFields[index] = updated })}
              onDelete={() => mutate((d) => { d.dynamicFields.splice(index, 1) })}
            />
          ))}
        </CollapsibleSection>
      </div>

      <div style={S.footer}>
        <span style={S.status}>
          {isInferring
            ? t('chronicler.running')
            : status}
        </span>
        <Button
          variant="primary"
          icon={saving ? <IconLoadingOutline16 size={16} /> : undefined}
          disabled={sessionId === undefined || saving || isInferring}
          onClick={save}
        >
          {saving ? t('saving') : t('save')}
        </Button>
      </div>
    </div>
  )
}

/** Register the tab type and its body; both dispose with this fiber. */
export function registerWorldStateTab(ctx: RrpClientContext): void {
  const t = ctx.locale.bind('rrp') as Translate
  ctx.effect(() => {
    const disposeType = ctx.sidebarRightTabs.register({
      id: TAB_ID,
      kind: TAB_KIND,
      title: () => t('title'),
      guide: [{ order: 50, title: () => t('title'), description: () => t('guide.description') }],
    })
    const disposeBody = ctx.slots.register(
      { name: 'sidebar.right.pane.tab', key: TAB_ID, locale: 'rrp', inject: (sessionId: unknown) => ({ t, sessionId }) },
      WorldStatePanel,
    )
    return () => {
      disposeBody()
      disposeType()
    }
  }, 'dsh-rrp: WorldState tab')
}


/** Compact A3 gauge: stacked per-channel color bar + token/share reading. */
function BudgetGauge(props: { t: Translate; report: BudgetReport }): ReactNode {
  const { t, report } = props
  const totalChars = report.sections.reduce((sum, section) => sum + section.chars, 0)
  const segmentColor: Record<BudgetSection['id'], string> = {
    card: 'var(--dsw-alias-brand-primary)',
    summary: 'var(--dsw-alias-label-secondary)',
    state: 'var(--dsw-alias-label-tertiary)',
    triggers: 'var(--dsw-alias-label-danger)',
  }
  const textColor = report.level === 'danger'
    ? 'var(--dsw-alias-status-error)'
    : report.level === 'warn'
      ? 'var(--dsw-alias-label-danger)'
      : 'var(--dsw-alias-label-secondary)'
  return (
    <div style={S.budget}>
      <div style={S.budgetHead}>
        <span style={S.budgetTitle}>{t('budget.title')}</span>
        <span style={{ ...S.budgetText, color: textColor }}>
          {'≈ ' + report.totalTokens.toLocaleString() + ' tokens · ' + report.pct + '%'}
        </span>
      </div>
      <Tooltip label={t('budget.hint')}>
        <div style={S.budgetBar}>
          {report.sections.map((section) => (
            <div
              key={section.id}
              title={t('budget.' + section.id)}
              style={{
                width: totalChars > 0 ? String((section.chars / totalChars) * 100) + '%' : '0%',
                background: segmentColor[section.id],
              }}
            />
          ))}
        </div>
      </Tooltip>
    </div>
  )
}

/** Collapsible section component */
function CollapsibleSection(props: { 
  title: string; 
  defaultExpanded?: boolean; 
  children: ReactNode 
}): ReactNode {
  const [expanded, setExpanded] = useState(props.defaultExpanded ?? true)
  
  return (
    <div style={S.collapsible}>
      <div 
        style={S.collapseHeader} 
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ ...S.collapseArrow, ...(expanded ? S.collapseArrowExpanded : {}) }}>
          ▶
        </span>
        <span style={S.collapseTitle}>{props.title}</span>
      </div>
      {expanded && <div style={S.collapseContent}>{props.children}</div>}
    </div>
  )
}

/** Dynamic field editor */
function DynamicFieldEditor(props: {
  t: Translate
  field: DynamicFieldRow
  disabled?: boolean
  onChange: (updated: DynamicFieldRow) => void
  onDelete: () => void
}): ReactNode {
  const { t, field, disabled, onChange, onDelete } = props
  
  return (
    <div style={S.dynamicFieldCard}>
      <div style={S.dynamicFieldHeader}>
        <span style={S.dynamicFieldId}>{field.id}</span>
        <span style={S.dynamicFieldType}>{field.type}</span>
        <Tooltip label={t('dynamicFields.remove')}>
          <Button 
            variant="ghost" 
            size="sm" 
            icon={<IconTrashOutline16 size={14} />} 
            disabled={disabled}
            onClick={onDelete}
          />
        </Tooltip>
      </div>
      
      {field.type === 'number' && (
        <div style={S.grid2}>
          <div style={S.half}>
            <label style={S.field}>
              <span style={S.fieldLabel}>{t('dynamicFields.value')}</span>
              <Input 
                type="number"
                value={field.value} 
                disabled={disabled}
                onChange={(e) => onChange({ ...field, value: e.target.value })}
              />
            </label>
          </div>
          <div style={S.half}>
            <div style={S.grid2}>
              <label style={S.field}>
                <span style={S.fieldLabel}>{t('dynamicFields.min')}</span>
                <Input 
                  type="number"
                  value={field.min ?? ''} 
                  placeholder={t('dynamicFields.unbounded')}
                  disabled={disabled}
                  onChange={(e) => onChange({ ...field, min: e.target.value })}
                />
              </label>
              <label style={S.field}>
                <span style={S.fieldLabel}>{t('dynamicFields.max')}</span>
                <Input 
                  type="number"
                  value={field.max ?? ''} 
                  placeholder={t('dynamicFields.unbounded')}
                  disabled={disabled}
                  onChange={(e) => onChange({ ...field, max: e.target.value })}
                />
              </label>
            </div>
          </div>
        </div>
      )}
      
      {field.type === 'string' && (
        <label style={S.field}>
          <span style={S.fieldLabel}>{t('dynamicFields.value')}</span>
          <Input 
            value={field.value} 
            disabled={disabled}
            onChange={(e) => onChange({ ...field, value: e.target.value })}
          />
        </label>
      )}
      
      {field.type === 'boolean' && (
        <label style={S.field}>
          <span style={S.fieldLabel}>{t('dynamicFields.value')}</span>
          <Input 
            value={field.value} 
            placeholder="true / false"
            disabled={disabled}
            onChange={(e) => onChange({ ...field, value: e.target.value })}
          />
        </label>
      )}
    </div>
  )
}

/** Add new field form */
function AddFieldForm(props: {
  t: Translate
  /** Ids already present in the draft; duplicates are refused (React key + overwrite). */
  existingIds: readonly string[]
  disabled?: boolean
  onAdd: (field: DynamicFieldRow) => void
  onCancel: () => void
}): ReactNode {
  const { t, existingIds, disabled } = props
  const [id, setId] = useState('')
  const [type, setType] = useState<'number' | 'string' | 'boolean'>('number')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  
  const handleAdd = () => {
    if (disabled) return
    const trimmedId = id.trim()
    if (!trimmedId) {
      setError(t('dynamicFields.idRequired'))
      return
    }
    if (isCoreKey(trimmedId)) {
      setError(t('dynamicFields.idReserved'))
      return
    }
    if (!isValidFieldId(trimmedId)) {
      setError(t('dynamicFields.idInvalid'))
      return
    }
    if (existingIds.includes(trimmedId)) {
      setError(t('dynamicFields.idDuplicate'))
      return
    }
    
    props.onAdd({
      id: trimmedId,
      type,
      value: value || (type === 'number' ? '0' : type === 'boolean' ? 'false' : ''),
      min: undefined,
      max: undefined,
    })
    
    setId('')
    setValue('')
    setError('')
  }
  
  return (
    <div style={S.addFieldForm}>
      {error && <div style={{ fontSize: 11, color: 'var(--dsw-alias-status-error)', marginBottom: 8 }}>{error}</div>}
      <div style={S.formRow}>
        <label style={{ ...S.field, ...S.formField }}>
          <span style={S.fieldLabel}>{t('dynamicFields.id')}</span>
          <Input 
            value={id} 
            placeholder="magic_power" 
            disabled={disabled}
            onChange={(e) => setId(e.target.value)}
          />
        </label>
        <label style={{ ...S.field, flex: '0 0 120px' }}>
          <span style={S.fieldLabel}>{t('dynamicFields.type')}</span>
          <select 
            value={type} 
            disabled={disabled}
            onChange={(e) => setType(e.target.value as any)}
            style={{
              width: '100%', height: 32, padding: '0 8px', borderRadius: 6,
              border: '1px solid var(--dsw-alias-border-l1)',
              background: 'var(--dsw-alias-bg-base)',
              color: 'var(--dsw-alias-label-primary)',
            }}
          >
            <option value="number">number</option>
            <option value="string">string</option>
            <option value="boolean">boolean</option>
          </select>
        </label>
        <label style={{ ...S.field, ...S.formField }}>
          <span style={S.fieldLabel}>{t('dynamicFields.initial')}</span>
          <Input 
            value={value} 
            placeholder={type === 'number' ? '0' : type === 'boolean' ? 'true/false' : ''}
            disabled={disabled}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
      </div>
      <div style={S.formActions}>
        <Button variant="ghost" size="sm" disabled={disabled} onClick={props.onCancel}>{t('dynamicFields.cancel')}</Button>
        <Button variant="primary" size="sm" disabled={disabled} onClick={handleAdd}>{t('add')}</Button>
      </div>
    </div>
  )
}
