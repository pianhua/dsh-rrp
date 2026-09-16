/**
 * dsh-rrp — the WorldState right-sidebar tab.
 *
 * Registers through the native right-sidebar path (ctx.sidebarRightTabs +
 * the keyed sidebar.right.pane.tab seat) and presents a structured, inline
 * editor: one card per character/item, one row per flag, three scene fields.
 * The player corrects the state in place (D6, no locks); saving posts the
 * whole edited state to the host route, and the panel re-reads the
 * authoritative projection.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
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
  root: { padding: '4px 8px 16px', display: 'flex', flexDirection: 'column' },
  heading: { fontWeight: 600, fontSize: 13, margin: '12px 0 6px', display: 'flex', alignItems: 'center', gap: 8 },
  title: { fontWeight: 600, fontSize: 14, margin: '4px 0', display: 'flex', alignItems: 'center', gap: 8 },
  hint: { margin: '0 0 4px', fontSize: 11, lineHeight: 1.5, opacity: 0.65 },
  card: {
    border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))',
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  field: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 },
  label: { flex: '0 0 48px', opacity: 0.7 },
  input: { flex: 1, minWidth: 0 },
  rowActions: { display: 'flex', justifyContent: 'flex-end' },
  actions: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 },
  status: { fontSize: 11, opacity: 0.75 },
  smallButton: { fontSize: 11, padding: '2px 8px' },
}

function Field(props: { label: string; value: string; onChange: (next: string) => void }): ReactNode {
  return (
    <label style={S.field}>
      <span style={S.label}>{props.label}</span>
      <input style={S.input} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  )
}

function WorldStatePanel(props: WorldStatePanelProps): ReactNode {
  const t: Translate = typeof props.t === 'function' ? props.t : (key) => key
  const view = typeof props.useProjection === 'function'
    ? (props.useProjection(WORLD_STATE_KEY) as WorldStateView | undefined)
    : undefined
  const sessionId = props.sessionId

  const [draft, setDraft] = useState<Draft>(() => draftOf(view))
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState('')

  // Follow the authoritative projection until the player starts editing.
  useEffect(() => {
    if (!dirty) setDraft(draftOf(view))
  }, [view, dirty])

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
  }

  return (
    <div className="dsh-rrp-world" style={S.root}>
      <div style={S.title}>
        <span>{t('title')}</span>
        {dirty ? <span style={S.status}>{t('unsaved')}</span> : null}
      </div>
      <p style={S.hint}>{t('editHint')}</p>

      <h4 style={S.heading}>{t('section.scene')}</h4>
      <Field label={t('scene.location')} value={draft.scene.location} onChange={(v) => mutate((d) => { d.scene.location = v })} />
      <Field label={t('scene.time')} value={draft.scene.time} onChange={(v) => mutate((d) => { d.scene.time = v })} />
      <Field label={t('scene.weather')} value={draft.scene.weather} onChange={(v) => mutate((d) => { d.scene.weather = v })} />

      <h4 style={S.heading}>
        <span>{t('section.characters')}</span>
        <button type="button" style={S.smallButton} onClick={() => mutate((d) => { d.characters.push({ name: '', affinity: '', mood: '', appearance: '', condition: '' }) })}>{t('add')}</button>
      </h4>
      {draft.characters.map((row, index) => (
        <div key={index} style={S.card}>
          <Field label={t('name')} value={row.name} onChange={(v) => mutate((d) => { d.characters[index].name = v })} />
          <Field label={t('field.affinity')} value={row.affinity} onChange={(v) => mutate((d) => { d.characters[index].affinity = v })} />
          <Field label={t('field.mood')} value={row.mood} onChange={(v) => mutate((d) => { d.characters[index].mood = v })} />
          <Field label={t('field.appearance')} value={row.appearance} onChange={(v) => mutate((d) => { d.characters[index].appearance = v })} />
          <Field label={t('field.condition')} value={row.condition} onChange={(v) => mutate((d) => { d.characters[index].condition = v })} />
          <div style={S.rowActions}>
            <button type="button" style={S.smallButton} onClick={() => mutate((d) => { d.characters.splice(index, 1) })}>{t('remove')}</button>
          </div>
        </div>
      ))}

      <h4 style={S.heading}>
        <span>{t('section.inventory')}</span>
        <button type="button" style={S.smallButton} onClick={() => mutate((d) => { d.inventory.push({ name: '', quantity: '', note: '' }) })}>{t('add')}</button>
      </h4>
      {draft.inventory.map((row, index) => (
        <div key={index} style={S.card}>
          <Field label={t('name')} value={row.name} onChange={(v) => mutate((d) => { d.inventory[index].name = v })} />
          <Field label={t('field.quantity')} value={row.quantity} onChange={(v) => mutate((d) => { d.inventory[index].quantity = v })} />
          <Field label={t('field.note')} value={row.note} onChange={(v) => mutate((d) => { d.inventory[index].note = v })} />
          <div style={S.rowActions}>
            <button type="button" style={S.smallButton} onClick={() => mutate((d) => { d.inventory.splice(index, 1) })}>{t('remove')}</button>
          </div>
        </div>
      ))}

      <h4 style={S.heading}>
        <span>{t('section.flags')}</span>
        <button type="button" style={S.smallButton} onClick={() => mutate((d) => { d.flags.push({ key: '', value: '' }) })}>{t('add')}</button>
      </h4>
      {draft.flags.map((row, index) => (
        <div key={index} style={S.card}>
          <Field label={t('flag.key')} value={row.key} onChange={(v) => mutate((d) => { d.flags[index].key = v })} />
          <Field label={t('flag.value')} value={row.value} onChange={(v) => mutate((d) => { d.flags[index].value = v })} />
          <div style={S.rowActions}>
            <button type="button" style={S.smallButton} onClick={() => mutate((d) => { d.flags.splice(index, 1) })}>{t('remove')}</button>
          </div>
        </div>
      ))}

      <div style={S.actions}>
        <button type="button" onClick={save} disabled={sessionId === undefined}>{t('save')}</button>
        <span style={S.status}>{status}</span>
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
