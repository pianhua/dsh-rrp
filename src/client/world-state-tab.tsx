import type { ReactNode } from 'react'
import type { RrpClientContext, RrpUseProjection, RrpUseSessions } from './context-types.ts'
import { WorldStateWorkspace } from './world-state-workspace.tsx'
import type { Translate } from './components/world-state-primitives.tsx'

const TAB_ID = 'dsh-rrp/world-state'
const TAB_KIND = 'dsh-rrp-worldstate'

interface WorldStatePanelProps {
  t?: Translate
  sessionId?: string
  useProjection?: RrpUseProjection
  useSessions?: RrpUseSessions
  compact?: boolean
}

function WorldStatePanel(props: WorldStatePanelProps): ReactNode {
  const t = props.t ?? ((key: string) => key)
  return (
    <WorldStateWorkspace
      t={t}
      sessionId={props.sessionId}
      useProjection={props.useProjection}
      useSessions={props.useSessions}
      compact={props.compact}
    />
  )
}

export function registerWorldStateTab(ctx: RrpClientContext): void {
  const t = ctx.locale.bind('rrp') as Translate
  ctx.effect(() => {
    const disposeView = ctx.slots.inject('conversation.view', () =>
      ctx.slots.register(
        {
          name: 'conversation.view',
          id: TAB_ID,
          order: 40,
          locale: 'rrp',
          label: () => t('title'),
          inject: (sessionId: unknown) => ({ t, sessionId }),
        },
        WorldStatePanel as never,
      ),
    )
    const disposeType = ctx.sidebarRightTabs.register({
      id: TAB_ID,
      kind: TAB_KIND,
      title: () => t('title'),
      guide: [{ order: 50, title: () => t('title'), description: () => t('guide.description') }],
    })
    const disposeBody = ctx.slots.register(
      {
        name: 'sidebar.right.pane.tab',
        key: TAB_ID,
        locale: 'rrp',
        inject: (sessionId: unknown) => ({ t, sessionId, compact: true }),
      },
      WorldStatePanel as never,
    )
    return () => {
      disposeBody()
      disposeType()
      disposeView()
    }
  }, 'dsh-rrp: WorldState dual entry')
}
