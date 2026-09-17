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
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { pendingActivity, type RrpActivityLog } from '../activity.ts'
import {
  WORLD_STATE_KEY,
  type WorldState,
  type WorldStateCharacter,
  type WorldStateItem,
  type WorldStateView,
} from '../world-state.ts'
import type { RrpClientContext } from './context-types.ts'

/** Implementation identity; also the key the body registers under. */
const TAB_ID = 'dsh-rrp/world-state'
/** Type discriminator openTab names. */
const TAB_KIND = 'dsh-rrp-worldstate'
/** Host route that accepts a corrected WorldState. */
const CORRECTION_PATH = '/dsh-rrp/world-state'
/** Host route serving the host-side activity ledger. */
const ACTIVITY_PATH = '/dsh-rrp/activity'
/** The ledger is transient player-facing bookkeeping; a slow poll is enough. */
const ACTIVITY_POLL_MS = 2000

type Translate = (key: string) => string

/** Props the slot framework merges: our inject face plus session standards. */
interface WorldStatePanelProps {
  t?: Translate
  useProjection?: (key: string) => unknown
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
interface Draft {
  characters: CharacterRow[]
  inventory: ItemRow[]
  flags: FlagRow[]
  scene: { location: string; time: string; weather: string }
}

/** Project the read-only slice into an array-based draft for stable editing. */
function draftOf(view: WorldStateView | undefined): Draft {
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
  }
}

/** True when the whole slice carries no information at all. */
function isEmptyDraft(draft: Draft): boolean {
  return draft.characters.length === 0
    && draft.inventory.length === 0
    && draft.flags.length === 0
    && draft.scene.location.length === 0
    && draft.scene.time.length === 0
    && draft.scene.weather.length === 0
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
  return { characters, inventory, flags, scene }
}

const S: Record<string, CSSProperties> = {
  root: { height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)' },
  header: {
    flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 10px',
    borderBottom: '1px solid var(--dsw-alias-border-l1)',
  },
  title: { fontSize: 14, fontWeight: 600 },
  spacer: { flex: 1 },
  scroll: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 14px 20px' },
  hint: { margin: '0 0 10px', fontSize: 11.5, lineHeight: 1.6, color: 'var(--dsw-alias-label-tertiary)' },
  empty: {
    display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', marginBottom: 12,
    borderRadius: 10, background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px dashed var(--dsw-alias-border-l2)', fontSize: 12,
    color: 'var(--dsw-alias-label-tertiary)',
  },
  activity: {
    display: 'flex', flexDirection: 'column', gap: 4, padding: '9px 11px', marginBottom: 14,
    borderRadius: 10, background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
  },
  activityHead: { fontSize: 11, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', letterSpacing: '0.02em' },
  activityEmpty: { fontSize: 11, color: 'var(--dsw-alias-label-dimmed)' },
  activityRow: { display: 'flex', gap: 6, fontSize: 11, lineHeight: 1.5, alignItems: 'baseline' },
  activityWho: { flex: '0 0 auto', fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' },
  activityWhat: { flex: 1, minWidth: 0, color: 'var(--dsw-alias-label-tertiary)', wordBreak: 'break-word' },
  activityWhen: { flex: '0 0 auto', color: 'var(--dsw-alias-label-dimmed)' },
  running: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--dsw-alias-label-secondary)' },
  section: { display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 8px' },
  sectionTitle: { fontSize: 12.5, fontWeight: 600 },
  card: {
    display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 11px', marginBottom: 8,
    borderRadius: 10, background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
  },
  cardHead: { display: 'flex', alignItems: 'center', gap: 8 },
  cardLabel: { fontSize: 11, fontWeight: 600, color: 'var(--dsw-alias-label-tertiary)', flex: 1 },
  field: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  fieldLabel: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' },
  grid2: { display: 'flex', gap: 8 },
  half: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  footer: {
    flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
    borderTop: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-base)',
  },
  status: { flex: 1, minWidth: 0, fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary)', lineHeight: 1.4 },
}

/** Local wall-clock label for a ledger entry. */
function clockOf(at: string): string {
  const date = new Date(at)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** One labelled text field. */
function Field(props: { label: string; value: string; placeholder?: string; onChange: (next: string) => void }): ReactNode {
  return (
    <label style={S.field}>
      <span style={S.fieldLabel}>{props.label}</span>
      <Input
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  )
}

/** A section heading with a count and an add action. */
function SectionHead(props: { title: string; count: number; addLabel: string; onAdd: () => void }): ReactNode {
  return (
    <div style={S.section}>
      <span style={S.sectionTitle}>{props.title}</span>
      <Pill>{String(props.count)}</Pill>
      <span style={S.spacer} />
      <Button variant="ghost" size="sm" icon={<IconPlusOutline16 size={16} />} onClick={props.onAdd}>
        {props.addLabel}
      </Button>
    </div>
  )
}

/** The remove control shared by every editable card. */
function RemoveButton(props: { label: string; onClick: () => void }): ReactNode {
  return (
    <Tooltip label={props.label}>
      <Button variant="ghost" size="sm" icon={<IconTrashOutline16 size={16} />} aria-label={props.label} onClick={props.onClick} />
    </Tooltip>
  )
}

function WorldStatePanel(props: WorldStatePanelProps): ReactNode {
  const t: Translate = typeof props.t === 'function' ? props.t : (key) => key
  const view = typeof props.useProjection === 'function'
    ? (props.useProjection(WORLD_STATE_KEY) as WorldStateView | undefined)
    : undefined
  const sessionId = props.sessionId
  const [activity, setActivity] = useState<RrpActivityLog | undefined>(undefined)
  const recentActivity = (activity?.entries ?? []).slice(-4).reverse()
  const inferenceRunning = activity === undefined ? undefined : pendingActivity(activity, 'world-state')

  const [draft, setDraft] = useState<Draft>(() => draftOf(view))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  // Follow the authoritative projection until the player starts editing.
  useEffect(() => {
    if (!dirty) setDraft(draftOf(view))
  }, [view, dirty])

  // The activity ledger is host-side and transient: poll it while mounted so
  // the "最近变更" line and the running indicator stay current.
  useEffect(() => {
    if (sessionId === undefined) {
      setActivity(undefined)
      return
    }
    let cancelled = false
    const load = (): void => {
      void fetch(ACTIVITY_PATH + '?sessionId=' + encodeURIComponent(sessionId))
        .then((response) => (response.ok ? response.json() as Promise<RrpActivityLog> : undefined))
        .then((log) => {
          if (!cancelled && log !== undefined) setActivity(log)
        })
        .catch(() => {
          /* the ledger is best-effort */
        })
    }
    load()
    const timer = setInterval(load, ACTIVITY_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [sessionId])

  const mutate = (change: (next: Draft) => void): void => {
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
        {dirty ? <Pill active>{t('unsaved')}</Pill> : null}
      </div>

      <div style={S.scroll}>
        <p style={S.hint}>{t('editHint')}</p>

        {isEmptyDraft(draft) ? <div style={S.empty}>{t('world.missing')}</div> : null}

        <div style={S.activity}>
          <div style={S.activityHead}>{t('activity.title')}</div>
          {inferenceRunning !== undefined ? (
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
                {entry.detail !== undefined && entry.detail.length > 0 ? ' · ' + entry.detail : ''}
              </span>
              <span style={S.activityWhen}>{clockOf(entry.at)}</span>
            </div>
          ))}
        </div>

        <div style={S.section}><span style={S.sectionTitle}>{t('section.scene')}</span></div>
        <div style={S.card}>
          <Field label={t('scene.location')} value={draft.scene.location} onChange={(v) => mutate((d) => { d.scene.location = v })} />
          <div style={S.grid2}>
            <div style={S.half}>
              <Field label={t('scene.time')} value={draft.scene.time} onChange={(v) => mutate((d) => { d.scene.time = v })} />
            </div>
            <div style={S.half}>
              <Field label={t('scene.weather')} value={draft.scene.weather} onChange={(v) => mutate((d) => { d.scene.weather = v })} />
            </div>
          </div>
        </div>

        <SectionHead
          title={t('section.characters')}
          count={draft.characters.length}
          addLabel={t('add')}
          onAdd={() => mutate((d) => { d.characters.push({ name: '', affinity: '', mood: '', appearance: '', condition: '' }) })}
        />
        {draft.characters.map((row, index) => (
          <div key={index} style={S.card}>
            <div style={S.cardHead}>
              <span style={S.cardLabel}>{t('section.characters') + ' ' + String(index + 1)}</span>
              <RemoveButton label={t('remove')} onClick={() => mutate((d) => { d.characters.splice(index, 1) })} />
            </div>
            <Field label={t('name')} value={row.name} onChange={(v) => mutate((d) => { d.characters[index].name = v })} />
            <div style={S.grid2}>
              <div style={S.half}>
                <Field label={t('field.affinity')} value={row.affinity} onChange={(v) => mutate((d) => { d.characters[index].affinity = v })} />
              </div>
              <div style={S.half}>
                <Field label={t('field.mood')} value={row.mood} onChange={(v) => mutate((d) => { d.characters[index].mood = v })} />
              </div>
            </div>
            <Field label={t('field.appearance')} value={row.appearance} onChange={(v) => mutate((d) => { d.characters[index].appearance = v })} />
            <Field label={t('field.condition')} value={row.condition} onChange={(v) => mutate((d) => { d.characters[index].condition = v })} />
          </div>
        ))}

        <SectionHead
          title={t('section.inventory')}
          count={draft.inventory.length}
          addLabel={t('add')}
          onAdd={() => mutate((d) => { d.inventory.push({ name: '', quantity: '', note: '' }) })}
        />
        {draft.inventory.map((row, index) => (
          <div key={index} style={S.card}>
            <div style={S.cardHead}>
              <span style={S.cardLabel}>{t('section.inventory') + ' ' + String(index + 1)}</span>
              <RemoveButton label={t('remove')} onClick={() => mutate((d) => { d.inventory.splice(index, 1) })} />
            </div>
            <Field label={t('name')} value={row.name} onChange={(v) => mutate((d) => { d.inventory[index].name = v })} />
            <div style={S.grid2}>
              <div style={S.half}>
                <Field label={t('field.quantity')} value={row.quantity} onChange={(v) => mutate((d) => { d.inventory[index].quantity = v })} />
              </div>
              <div style={S.half}>
                <Field label={t('field.note')} value={row.note} onChange={(v) => mutate((d) => { d.inventory[index].note = v })} />
              </div>
            </div>
          </div>
        ))}

        <SectionHead
          title={t('section.flags')}
          count={draft.flags.length}
          addLabel={t('add')}
          onAdd={() => mutate((d) => { d.flags.push({ key: '', value: '' }) })}
        />
        {draft.flags.map((row, index) => (
          <div key={index} style={S.card}>
            <div style={S.cardHead}>
              <span style={S.cardLabel}>{t('section.flags') + ' ' + String(index + 1)}</span>
              <RemoveButton label={t('remove')} onClick={() => mutate((d) => { d.flags.splice(index, 1) })} />
            </div>
            <Field label={t('flag.key')} value={row.key} onChange={(v) => mutate((d) => { d.flags[index].key = v })} />
            <Field label={t('flag.value')} value={row.value} onChange={(v) => mutate((d) => { d.flags[index].value = v })} />
          </div>
        ))}
      </div>

      <div style={S.footer}>
        <span style={S.status}>{status}</span>
        <Button
          variant="primary"
          icon={saving ? <IconLoadingOutline16 size={16} /> : undefined}
          disabled={sessionId === undefined || saving}
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
      { name: 'sidebar.right.pane.tab', key: TAB_ID, locale: 'rrp', inject: () => ({ t }) },
      WorldStatePanel,
    )
    return () => {
      disposeBody()
      disposeType()
    }
  }, 'dsh-rrp: WorldState tab')
}
