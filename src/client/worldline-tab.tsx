/**
 * dsh-rrp — the worldline save map (issue #28), a native `conversation.view`
 * tab next to 对话/轨迹.
 *
 * The tree is folded CLIENT-side from the host's own lineage (sessions.list
 * parentId/displayTitle) plus per-session turn facts from our route — the
 * plugin never scans logs and never stores lineage. Nodes are turns (every
 * turn is an autosave); a save-slot shows what happened and what the world
 * looked like; the three verbs are the host's own: open (读档), fork at the
 * player message's seq (重roll), and the soft-hide ledger (收起).
 */
import { Button, IconLoadingOutline16, IconRefreshOutline16, IconSparkle16, Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { RRP_ROUTES, type WorldlineTreeResponse } from '../route-contract.ts'
import type { WorldlineNode, WorldlineTree } from '../worldline-tree.ts'
import type { RrpClientContext } from './context-types.ts'

type Translate = (key: string) => string

/** Everything the panel needs from the host wiring, built once at registration. */
export interface WorldlineApi {
  /** Fold the whole map: host lineage + per-session facts minus hidden lines. */
  loadTrees(): Promise<WorldlineTree[]>
  /** Jump the workspace view to a session (读档). */
  open(sessionId: string): void
  /** Fork from one turn's player-message seq and open the child (重roll). */
  reroll(sessionId: string, atSeq: number, cardName: string): Promise<void>
  /** Soft-archive a line and its subtree (收起); returns when persisted. */
  hide(sessionId: string): Promise<void>
  /** Subscribe to roster churn (a new fork appearing refreshes the map). */
  subscribe(listener: () => void): () => void
}

interface WorldlinePanelProps {
  t?: Translate
  sessionId?: string
  api?: WorldlineApi
}

/** One save slot. */
function Slot(props: { node: WorldlineNode; cardName: string; currentId?: string; api: WorldlineApi; t: Translate; onHid: () => void; branchLabel?: string }): ReactNode {
  const { node, cardName, currentId, api, t, onHid } = props
  const badge = node.badge
  const isCurrent = node.sessionId === currentId
  return (
    <div style={{ ...S.slot, ...(isCurrent ? S.slotCurrent : {}) }} title={node.proseExcerpt}>
      {props.branchLabel === undefined ? null : <span style={S.branchTag}>{props.branchLabel}</span>}
      <div style={S.slotPlayer}>{node.playerExcerpt}</div>
      {node.proseExcerpt.length === 0 ? null : <div style={S.slotProse}>{node.proseExcerpt}</div>}
      {badge === undefined ? null : (
        <div style={S.slotBadge}>
          {badge.location === undefined ? null : <span>{badge.location}</span>}
          {badge.time === undefined ? null : <span>· {badge.time}</span>}
          {(badge.affinity ?? []).map((entry) => <span key={entry.name}>· {entry.name} {String(entry.value)}</span>)}
          {badge.summary === undefined ? null : <span style={S.slotSummary}>· {badge.summary}</span>}
        </div>
      )}
      <div style={S.slotActions}>
        <Button size="sm" variant="ghost" onClick={() => { api.open(node.sessionId) }}>{t('worldline.load')}</Button>
        <Button size="sm" variant="ghost" onClick={() => { void api.reroll(node.sessionId, node.seq, cardName) }}>{t('worldline.reroll')}</Button>
        <Button size="sm" variant="ghost" onClick={() => { void api.hide(node.sessionId).then(onHid) }}>{t('worldline.hide')}</Button>
      </div>
    </div>
  )
}

/** Recursive tree rows: the first child continues the line, later children are branches. */
function Branch(props: { node: WorldlineNode; cardName: string; depth: number; currentId?: string; api: WorldlineApi; t: Translate; onHid: () => void; branchLabel?: string }): ReactNode {
  const { node, cardName, depth, api, onHid } = props
  const [continuation, ...branches] = node.children
  return (
    <div style={{ marginLeft: depth === 0 ? 0 : 18, borderLeft: depth === 0 ? 'none' : '1px solid var(--dsw-alias-border-l1)', paddingLeft: depth === 0 ? 0 : 10 }}>
      <Slot node={node} cardName={cardName} currentId={props.currentId} api={api} t={props.t} onHid={onHid} branchLabel={props.branchLabel} />
      {continuation === undefined ? null : <Branch node={continuation} cardName={cardName} depth={depth} currentId={props.currentId} api={api} t={props.t} onHid={onHid} />}
      {branches.map((child) => (
        <Branch key={child.key} node={child} cardName={cardName} depth={depth + 1} currentId={props.currentId} api={api} t={props.t} onHid={onHid} branchLabel={child.sessionTitle} />
      ))}
    </div>
  )
}

function WorldlinePanel(props: WorldlinePanelProps): ReactNode {
  const t: Translate = typeof props.t === 'function' ? props.t : (key) => key
  const api = props.api
  const [trees, setTrees] = useState<WorldlineTree[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback((): void => {
    if (api === undefined) return
    setBusy(true)
    void api.loadTrees()
      .then((next) => { setTrees(next); setError('') })
      .catch((cause: unknown) => { setError(String((cause as { message?: string })?.message ?? cause)) })
      .finally(() => { setBusy(false) })
  }, [api])

  useEffect(() => {
    refresh()
    return api?.subscribe(refresh) ?? (() => {})
  }, [refresh, api])

  if (api === undefined) {
    return <div style={S.root}><div style={S.empty}>{t('worldline.unavailable')}</div></div>
  }
  const total = trees.reduce((sum, tree) => sum + tree.roots.length, 0)
  return (
    <div style={S.root}>
      <header style={S.header}>
        <span style={S.brand}><IconSparkle16 size={16} />{t('worldline.title')}</span>
        {trees.map((tree) => <Pill key={tree.cardId}>{tree.cardName}</Pill>)}
        <span style={S.spacer} />
        {busy ? <IconLoadingOutline16 size={14} /> : null}
        <Button size="sm" variant="ghost" icon={<IconRefreshOutline16 size={14} />} onClick={refresh} aria-label={t('worldline.refresh')} />
      </header>
      {error.length > 0 ? <div style={S.error}>{error}</div> : null}
      <div style={S.scroll}>
        {total === 0 && !busy && error.length === 0 ? <div style={S.empty}>{t('worldline.empty')}</div> : null}
        {trees.map((tree) => (
          <section key={tree.cardId} style={S.cardGroup}>
            <div style={S.cardTitle}>{tree.cardName}</div>
            {tree.roots.map((root) => (
              <Branch key={root.key} node={root} cardName={tree.cardName} depth={0} currentId={props.sessionId} api={api} t={t} onHid={refresh} branchLabel={root.sessionTitle} />
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}

const S: Record<string, CSSProperties> = {
  root: { height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)' },
  header: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--dsw-alias-border-l1)', flex: '0 0 auto' },
  brand: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 },
  spacer: { flex: 1 },
  scroll: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 14px 24px' },
  cardGroup: { marginBottom: 18 },
  cardTitle: { fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', marginBottom: 8 },
  slot: { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: '8px 10px', margin: '6px 0', background: 'var(--dsw-alias-bg-layer-1)', maxWidth: 460 },
  slotCurrent: { borderColor: 'var(--dsw-alias-brand-primary)' },
  branchTag: { display: 'inline-block', fontSize: 10.5, color: 'var(--dsw-alias-label-tertiary)', marginBottom: 3 },
  slotPlayer: { fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  slotProse: { fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  slotBadge: { display: 'flex', flexWrap: 'wrap', gap: 4, fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginTop: 4 },
  slotSummary: { color: 'var(--dsw-alias-label-tertiary)' },
  slotActions: { display: 'flex', gap: 2, marginTop: 4 },
  error: { padding: '8px 14px', fontSize: 12, color: 'var(--dsw-alias-label-danger, #d5484f)' },
  empty: { padding: '30px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--dsw-alias-label-tertiary)' },
}

/**
 * Register the worldline tab in the host's session-view tab strip.
 * @param ctx - the client context owning the registration.
 */
export function registerWorldlineTab(ctx: RrpClientContext): void {
  const t = ctx.locale.bind('rrp') as Translate
  const sessions = ctx.sessions
  // Probe the workspace navigator lazily: the package may mount after us.
  const openSession = (sessionId: string): void => {
    const uiWorkspace = (ctx as unknown as { get?(name: string): unknown }).get?.('uiWorkspace') as
      | { openSession?: (id: string) => void }
      | undefined
    if (typeof uiWorkspace?.openSession === 'function') uiWorkspace.openSession(sessionId)
  }

  const api: WorldlineApi = {
    async loadTrees() {
      const response = await fetch(RRP_ROUTES.worldlineTree)
      // Never swallow: a missing/unready route must surface as an error banner,
      // not masquerade as "no worldlines yet" (issue #36).
      if (!response.ok) throw new Error('worldline route HTTP ' + String(response.status))
      const body = await response.json() as WorldlineTreeResponse
      // Node titles are the host roster's business: decorate from its own list.
      const byId = sessions?.list?.getSnapshot().byId ?? {}
      const title = (id: string): string => byId[id]?.displayTitle ?? id
      const fill = (nodes: WorldlineNode[]): void => {
        for (const node of nodes) {
          node.sessionTitle = title(node.sessionId)
          fill(node.children)
        }
      }
      for (const tree of body.trees) fill(tree.roots)
      return body.trees
    },
    open(sessionId) {
      openSession(sessionId)
    },
    async reroll(sessionId, atSeq, cardName) {
      if (sessions?.fork === undefined) return
      const childId = await sessions.fork({ sessionId, atSeq, increaseTitle: true })
      // Name the new line 「卡名·线N」 once the child is addressable (the
      // roster needs a beat to catch up after fork; increaseTitle is the
      // fallback title if every rename attempt lands too early).
      const list = sessions.list?.getSnapshot()
      const sameCard = list === undefined ? 0 : list.ids.filter((id) => {
        const row = list.byId[id]
        return row !== undefined && (row.parentId !== undefined || id === sessionId) && (row.displayTitle ?? '').startsWith(cardName.split('·')[0] ?? cardName)
      }).length
      const wanted = cardName + '·线' + String(sameCard + 1)
      // Open the child first: its binding is guaranteed live once current,
      // and the rename is a nicety on top of the host's unique increaseTitle.
      openSession(childId)
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 400))
        const binding = sessions.binding(childId)
        if (binding !== undefined) {
          try {
            await binding.session.rename?.(wanted)
          } catch {
            /* title only */
          }
          break
        }
      }
    },
    async hide(sessionId) {
      await fetch(RRP_ROUTES.worldlineHidden, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, hidden: true }),
      })
    },
    subscribe(listener) {
      return sessions?.list?.subscribe(listener) ?? (() => {})
    },
  }

  ctx.effect(() => {
    const dispose = ctx.slots.inject('conversation.view', () => ctx.slots.register(
      {
        name: 'conversation.view',
        id: 'dsh-rrp/worldline',
        order: 20,
        locale: 'rrp',
        label: () => t('worldline.view'),
        inject: (sessionId: unknown) => ({ t, sessionId, api }),
      },
      WorldlinePanel as never,
    ))
    return dispose
  }, 'dsh-rrp: worldline map tab')
}
