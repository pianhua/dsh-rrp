/**
 * dsh-rrp — the WorldState right-sidebar tab.
 *
 * Reaches the Sidebar only through its public two-stage path: the type into
 * `ctx.sidebarRightTabs`, the body into the keyed `sidebar.right.pane.tab`
 * seat under the definition's id. A session-scoped slot body receives
 * `useProjection`, the framework's key-addressed projection read face.
 */
import { createElement, type ReactNode } from 'react'
import { WORLD_STATE_KEY, type WorldStateView } from '../world-state.ts'
import type { RrpClientContext } from './context-types.ts'

/** Implementation identity; also the key the body registers under. */
const TAB_ID = 'dsh-rrp/world-state'
/** Type discriminator `openTab` names. */
const TAB_KIND = 'dsh-rrp-worldstate'

const SECTIONS = [
  { key: 'characters', labelKey: 'section.characters' },
  { key: 'inventory', labelKey: 'section.inventory' },
  { key: 'scene', labelKey: 'section.scene' },
  { key: 'flags', labelKey: 'section.flags' },
] as const

type Translate = (key: string) => string

/** Props the slot framework merges: our inject face plus session standards. */
interface WorldStatePanelProps {
  t?: Translate
  useProjection?: (key: string) => unknown
}

function WorldStatePanel(props: WorldStatePanelProps): ReactNode {
  const t: Translate = typeof props.t === 'function' ? props.t : (key) => key
  const view = typeof props.useProjection === 'function'
    ? (props.useProjection(WORLD_STATE_KEY) as WorldStateView | undefined)
    : undefined

  const children: ReactNode[] = [createElement('h3', { key: 'title' }, t('title'))]
  if (view === undefined || view === null) {
    children.push(createElement('p', { key: 'empty', className: 'dsh-rrp-empty' }, t('empty')))
  }
  for (const section of SECTIONS) {
    children.push(
      createElement(
        'section',
        { key: section.key, className: 'dsh-rrp-section' },
        createElement('h4', null, t(section.labelKey)),
        createElement('pre', { className: 'dsh-rrp-json' }, JSON.stringify(view?.[section.key] ?? {}, null, 2)),
      ),
    )
  }
  return createElement('div', { className: 'dsh-rrp-world' }, ...children)
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
