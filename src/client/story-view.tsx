/**
 * dsh-rrp — the immersive reading view (P3).
 *
 * A purely ADDITIVE conversation-view tab: it never replaces the host's Chat
 * renderer, it subscribes to the already-assembled \`chat\` target snapshot and
 * re-presents the narrative as a centered serif column. Tool/system/context
 * nodes are skipped, so play reads like a novel instead of a coding transcript.
 * If the snapshot or session is unavailable it renders a graceful placeholder.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import type { RrpClientContext } from './context-types.ts'

/** The view tab id; also the list entry id the shell activates. */
export const STORY_VIEW_ID = 'dsh-rrp/story'

type Translate = (key: string) => string

/** Identity-stable observable face (the host client-store shape). */
interface ObservableFace {
  getSnapshot(): unknown
  subscribe(listener: () => void): () => void
}
/** One assembled conversation node (only the fields this view reads). */
interface MessageNodeLike {
  kind: string
  content?: ReadonlyArray<{ type?: string; text?: string }>
  blocks?: ReadonlyArray<{ kind?: string; text?: string }>
}
/** The chat target snapshot, narrowed to what we render. */
interface ChatSnapshotLike {
  legacy?: { nodes?: readonly MessageNodeLike[] }
}
/** Conversation binding face for one session. */
interface ConversationBindingLike {
  target(name: string): ObservableFace
}
/** The uiConversation service face. */
interface UiConversationLike {
  binding(sessionId: string): ConversationBindingLike
}

/** Props the slot framework merges. */
interface StoryViewProps {
  t?: Translate
  sessionId?: string
  uiConversation?: UiConversationLike
}

/** Extract the human-readable prose of one node. */
function proseOf(node: MessageNodeLike): string {
  if (node.kind === 'assistant') {
    return (node.blocks ?? [])
      .filter((block) => block.kind === 'text')
      .map((block) => block.text ?? '')
      .join('')
      .trim()
  }
  return (node.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('')
    .trim()
}

const S: Record<string, CSSProperties> = {
  root: { height: '100%', overflowY: 'auto', padding: '24px 16px 48px', boxSizing: 'border-box' },
  column: { maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 },
  line: { fontSize: 17, lineHeight: 2.05, whiteSpace: 'pre-wrap', textAlign: 'justify' },
  action: {
    fontSize: 15, lineHeight: 1.8, whiteSpace: 'pre-wrap', opacity: 0.82,
    borderLeft: '3px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.35))',
    paddingLeft: 12, fontStyle: 'italic',
  },
  empty: { maxWidth: 720, margin: '48px auto', textAlign: 'center', opacity: 0.6, fontSize: 14 },
}

function StoryView(props: StoryViewProps): ReactNode {
  const t: Translate = typeof props.t === 'function' ? props.t : (key) => key
  const sessionId = props.sessionId
  const uiConversation = props.uiConversation

  const target = sessionId === undefined || uiConversation === undefined
    ? undefined
    : uiConversation.binding(sessionId).target('chat')

  const subscribe = useCallback(
    (listener: () => void): (() => void) => (target === undefined ? () => {} : target.subscribe(listener)),
    [target],
  )
  const getSnapshot = useCallback(
    (): unknown => (target === undefined ? undefined : target.getSnapshot()),
    [target],
  )
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot) as ChatSnapshotLike | undefined

  const bottom = useRef<HTMLDivElement | null>(null)
  const nodes = snapshot?.legacy?.nodes ?? []
  const marker = String(nodes.length)
  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: 'end' })
  }, [marker])

  const lines = nodes
    .map((node, index) => ({ node, index, text: proseOf(node) }))
    .filter((entry) => (entry.node.kind === 'user' || entry.node.kind === 'assistant') && entry.text.length > 0)

  if (lines.length === 0) return <div style={S.empty}>{t('story.empty')}</div>

  return (
    <div style={S.root}>
      <div style={S.column}>
        {lines.map((entry) => (
          entry.node.kind === 'user'
            ? <div key={entry.index} style={S.action}>{entry.text}</div>
            : <div key={entry.index} style={S.line}>{entry.text}</div>
        ))}
        <div ref={bottom} />
      </div>
    </div>
  )
}

/**
 * Register the immersive reading view tab. Additive: the host Chat tab stays.
 * @param ctx - the client context owning the registration.
 */
export function registerStoryView(ctx: RrpClientContext): void {
  const t = ctx.locale.bind('rrp') as Translate
  ctx.effect(() => {
    const dispose = ctx.slots.inject('conversation.view', () => ctx.slots.register(
      {
        name: 'conversation.view',
        id: STORY_VIEW_ID,
        order: 5,
        label: () => t('view.story'),
        locale: 'rrp',
        inject: (sessionId: unknown) => ({
          t,
          sessionId,
          uiConversation: ctx.uiConversation as UiConversationLike | undefined,
        }),
      },
      StoryView as never,
    ))
    return dispose
  }, 'dsh-rrp: story view')
}
