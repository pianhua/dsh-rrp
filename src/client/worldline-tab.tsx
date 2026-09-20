/**
 * dsh-rrp — the worldline save map (issue #28), a native `conversation.view`
 * tab next to 对话/轨迹.
 *
 * The tree is folded SERVER-side by our route (live turn facts + the host's
 * lineage, plus cold skeleton placeholders for persisted-but-unloaded lines,
 * issue #29); this tab renders what the route returns — the plugin never
 * scans logs and never stores lineage. Nodes are turns (every turn is an
 * autosave); a save-slot shows what happened and what the world looked like;
 * the three verbs are the host's own: open (读档), fork at the player
 * message's seq (重roll), and the soft-hide ledger (收起).
 */
import { Button, IconLoadingOutline16, IconRefreshOutline16, IconSparkle16, Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { RRP_ROUTES, routeUrl, type WorldlineTreeResponse } from '../route-contract.ts'
import { branchTitle } from '../save-naming.ts'
import type { WorldlineNode, WorldlineTree } from '../worldline-tree.ts'
import type { RrpClientContext } from './context-types.ts'

type Translate = (key: string) => string

/** Everything the panel needs from the host wiring, built once at registration. */
export interface WorldlineApi {
  /** Fold the whole map: host lineage + per-session facts minus hidden lines. */
  loadTrees(): Promise<WorldlineTree[]>
  /** Download the session's whole story as clean prose (issue #31-C). */
  exportNovel(sessionId: string): Promise<void>
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
  // Cold skeleton (issue #29): the line exists on disk but is not loaded.
  // Show its existence and how to materialize it; offer no verbs — reroll
  // needs the fork cut and open needs roster bindings we do not have here.
  if (node.loaded === false) {
    return (
      <div style={{ ...S.slot, ...S.slotStub }} title={node.sessionId}>
        {props.branchLabel === undefined ? null : <span style={S.branchTag}>{props.branchLabel}</span>}
        <div style={S.slotStubHint}>{t('worldline.stubHint')}</div>
      </div>
    )
  }
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
  const [exporting, setExporting] = useState(false)
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
        {props.sessionId === undefined ? null : (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || exporting}
            onClick={() => {
              setExporting(true)
              setError('')
              void api.exportNovel(props.sessionId as string)
                .catch((cause: unknown) => { setError(String((cause as { message?: string })?.message ?? cause)) })
                .finally(() => { setExporting(false) })
            }}
          >
            {exporting ? t('worldline.exporting') : t('worldline.export')}
          </Button>
        )}
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
  slotStub: { borderStyle: 'dashed', background: 'transparent' },
  slotStubHint: { fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary)' },
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
      // Node titles are the host roster's business for LIVE nodes; cold
      // skeletons (issue #29) are not in the roster — their titles were read
      // server-side and must survive untouched.
      const byId = sessions?.list?.getSnapshot().byId ?? {}
      const fill = (nodes: WorldlineNode[]): void => {
        for (const node of nodes) {
          if (node.loaded !== false) node.sessionTitle = byId[node.sessionId]?.displayTitle ?? node.sessionTitle
          fill(node.children)
        }
      }
      for (const tree of body.trees) fill(tree.roots)
      return body.trees
    },
    async exportNovel(sessionId) {
      const title = sessions?.list?.getSnapshot().byId[sessionId]?.displayTitle ?? ''
      const response = await fetch(routeUrl(RRP_ROUTES.novelExport, sessionId, { title, format: 'md' }))
      if (!response.ok) throw new Error('export HTTP ' + String(response.status))
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      try {
        const anchor = document.createElement('a')
        anchor.href = url
        // fetch()+blob ignores the route's Content-Disposition; without an
        // explicit download name the click only navigates to the blob.
        const safe = (title.length > 0 ? title : 'novel').replace(/[\\/:*?"<>|]/g, '_')
        anchor.download = safe + '.md'
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
      } finally {
        URL.revokeObjectURL(url)
      }
    },
    open(sessionId) {
      openSession(sessionId)
    },
    async reroll(sessionId, atSeq, cardName) {
      if (sessions?.fork === undefined) return
      const childId = await sessions.fork({ sessionId, atSeq, increaseTitle: true })
      // Issue #37: the branch carries its PARENT SAVE's full title
      // (「父档全名·线N」) — a flat roster inside one card drawer never hides
      // which save a branch was cut from. The count is computed late, after
      // the roster caught up with the fork, so N is right on the first try.
      openSession(childId)
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 400))
        const binding = sessions.binding(childId)
        if (binding !== undefined) {
          const list = sessions.list?.getSnapshot()
          const parent = list?.byId[sessionId]
          const parentTitle = parent?.title ?? parent?.displayTitle ?? cardName
          const siblings = list === undefined ? [] : list.ids
            .filter((id) => list.byId[id]?.parentId === sessionId)
            .map((id) => list.byId[id]?.title ?? list.byId[id]?.displayTitle ?? '')
          try {
            await binding.session.rename?.(branchTitle(parentTitle, siblings))
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
