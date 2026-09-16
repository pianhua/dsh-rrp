/**
 * dsh-rrp — the WorldState right-sidebar tab.
 *
 * Reaches the Sidebar only through its public two-stage path: the type into
 * `ctx.sidebarRightTabs`, the body into the keyed `sidebar.right.pane.tab`
 * seat under the definition's id. A session-scoped slot body receives
 * `useProjection` and `sessionId` as framework standard props.
 *
 * Player correction (D6): the editor posts the whole edited state to the
 * host route; the host appends it as the newest whole-value event, and the
 * projection (hence this panel) re-renders from the authoritative log.
 */
import { createElement, useEffect, useState, type ReactNode } from 'react'
import { WORLD_STATE_KEY, emptyWorldState, type WorldStateView } from '../world-state.ts'
import type { RrpClientContext } from './context-types.ts'

/** Implementation identity; also the key the body registers under. */
const TAB_ID = 'dsh-rrp/world-state'
/** Type discriminator `openTab` names. */
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

function WorldStatePanel(props: WorldStatePanelProps): ReactNode {
  const t: Translate = typeof props.t === 'function' ? props.t : (key) => key
  const view = typeof props.useProjection === 'function'
    ? (props.useProjection(WORLD_STATE_KEY) as WorldStateView | undefined)
    : undefined
  const sessionId = props.sessionId

  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState('')
  const [dirty, setDirty] = useState(false)

  // Follow the authoritative projection until the player starts editing.
  useEffect(() => {
    if (!dirty) setDraft(JSON.stringify(view ?? emptyWorldState(), null, 2))
  }, [view, dirty])

  const save = (): void => {
    if (sessionId === undefined) {
      setStatus(t('noSession'))
      return
    }
    let state: unknown
    try {
      state = JSON.parse(draft)
    } catch {
      setStatus(t('invalidJson'))
      return
    }
    setStatus(t('saving'))
    void fetch(CORRECTION_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, state }),
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

  return createElement(
    'div',
    { className: 'dsh-rrp-world' },
    createElement('h3', null, t('title')),
    createElement('p', { className: 'dsh-rrp-hint' }, t('editHint')),
    createElement('textarea', {
      className: 'dsh-rrp-editor',
      value: draft,
      spellCheck: false,
      rows: 18,
      style: { width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '12px' },
      onChange: (event: { target: { value: string } }) => {
        setDraft(event.target.value)
        setDirty(true)
        setStatus('')
      },
    }),
    createElement(
      'div',
      { className: 'dsh-rrp-actions' },
      createElement(
        'button',
        { type: 'button', onClick: save, disabled: sessionId === undefined },
        t('save'),
      ),
      createElement('span', { className: 'dsh-rrp-status' }, status),
    ),
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
