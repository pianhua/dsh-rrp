/**
 * dsh-rrp — the worldline save map (issue #28 & #37), a native `conversation.view`
 * tab next to 对话/轨迹.
 *
 * Renders an interactive Galgame-style branching flowchart with SVG Bezier curves,
 * node state badges, pan & zoom controls, and a timeline inspector drawer.
 * Connects directly to host Session.fork, uiWorkspace.openSession, and layout navigation.
 */
import {
  Button,
  IconLoadingOutline16,
  IconRefreshOutline16,
  IconSparkle16,
  Pill,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { RRP_ROUTES, routeUrl, type WorldlineTreeResponse } from '../route-contract.ts'
import { branchTitle } from '../save-naming.ts'
import type { WorldlineNode, WorldlineTree } from '../worldline-tree.ts'
import type { RrpClientContext, RrpUiWorkspaceService } from './context-types.ts'
import { WorldlineFlowchart } from './components/worldline-flowchart.tsx'

type Translate = (key: string) => string

/** Everything the panel needs from the host wiring, built once at registration. */
export interface WorldlineApi {
  /** Fold the whole map: host lineage + per-session facts minus hidden lines. */
  loadTrees(): Promise<WorldlineTree[]>
  /** Download the session's whole story as clean prose (issue #31-C). */
  exportNovel(sessionId: string): Promise<void>
  /** Jump the workspace view to a session and switch to Chat view (读档). */
  open(sessionId: string): void
  /** Fork from one turn's player-message seq and open the child (重roll / 开辟新线). */
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
  openView?: (viewId: string) => void
}

function resolveFace<T>(target: unknown, name: string): T | undefined {
  try {
    const rec = target as Record<string, unknown>
    if (typeof (target as { get?(n: string): unknown }).get === 'function') {
      const fromGet = (target as { get(n: string): unknown }).get(name)
      if (fromGet !== undefined) return fromGet as T
    }
    return rec[name] as T | undefined
  } catch {
    return undefined
  }
}

function WorldlinePanel(props: WorldlinePanelProps): ReactNode {
  const t: Translate = typeof props.t === 'function' ? props.t : (key) => key
  const api = props.api
  const [trees, setTrees] = useState<WorldlineTree[]>([])
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback((): void => {
    if (api === undefined) return
    setBusy(true)
    void api
      .loadTrees()
      .then((next) => {
        setTrees(next)
        setError('')
        if (next.length > 0) {
          setActiveCardId((prev) => (prev !== null && next.some((tr) => tr.cardId === prev) ? prev : next[0]?.cardId ?? null))
        }
      })
      .catch((cause: unknown) => {
        setError(String((cause as { message?: string })?.message ?? cause))
      })
      .finally(() => {
        setBusy(false)
      })
  }, [api])

  useEffect(() => {
    refresh()
    return api?.subscribe(refresh) ?? (() => {})
  }, [refresh, api])

  if (api === undefined) {
    return (
      <div style={S.root}>
        <div style={S.empty}>{t('worldline.unavailable')}</div>
      </div>
    )
  }

  const activeTree = trees.find((tr) => tr.cardId === activeCardId) ?? trees[0]
  const totalRoots = trees.reduce((sum, tree) => sum + tree.roots.length, 0)

  return (
    <div style={S.root}>
      <header style={S.header}>
        <span style={S.brand}>
          <IconSparkle16 size={16} />
          {t('worldline.title') ?? '世界线存档图'}
        </span>

        {/* Card switcher pills when multiple cards exist */}
        {trees.length > 1 ? (
          <div style={S.cardPills}>
            {trees.map((tree) => (
              <Pill
                key={tree.cardId}
                active={tree.cardId === activeCardId}
                onClick={() => setActiveCardId(tree.cardId)}
              >
                {tree.cardName}
              </Pill>
            ))}
          </div>
        ) : null}

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
              void api
                .exportNovel(props.sessionId as string)
                .catch((cause: unknown) => {
                  setError(String((cause as { message?: string })?.message ?? cause))
                })
                .finally(() => {
                  setExporting(false)
                })
            }}
          >
            {exporting ? t('worldline.exporting') : t('worldline.export')}
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          icon={<IconRefreshOutline16 size={14} />}
          onClick={refresh}
          aria-label={t('worldline.refresh')}
        />
      </header>

      {error.length > 0 ? <div style={S.error}>{error}</div> : null}

      {totalRoots === 0 && !busy && error.length === 0 ? (
        <div style={S.empty}>{t('worldline.empty')}</div>
      ) : activeTree !== undefined ? (
        <WorldlineFlowchart
          key={activeTree.cardId}
          roots={activeTree.roots}
          cardName={activeTree.cardName}
          currentSessionId={props.sessionId}
          onLoad={(id) => {
            api.open(id)
            props.openView?.('chat')
          }}
          onFork={(id, seq) => {
            void api.reroll(id, seq, activeTree.cardName).then(refresh)
          }}
          onHide={(id) => {
            void api.hide(id).then(refresh)
          }}
          t={t}
        />
      ) : null}
    </div>
  )
}

const S: Record<string, CSSProperties> = {
  root: {
    height: '100%',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--dsw-alias-bg-base)',
    color: 'var(--dsw-alias-label-primary)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    borderBottom: '1px solid var(--dsw-alias-border-l1)',
    flex: '0 0 auto',
    zIndex: 10,
    background: 'var(--dsw-alias-bg-base)',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 },
  cardPills: { display: 'flex', alignItems: 'center', gap: 6 },
  spacer: { flex: 1 },
  error: { padding: '8px 14px', fontSize: 12, color: 'var(--dsw-alias-label-danger, #d5484f)' },
  empty: {
    padding: '40px 16px',
    textAlign: 'center',
    fontSize: 12.5,
    color: 'var(--dsw-alias-label-tertiary)',
  },
}

/**
 * Register the worldline tab in the host's session-view tab strip.
 * @param ctx - the client context owning the registration.
 */
export function registerWorldlineTab(ctx: RrpClientContext): void {
  const t = ctx.locale.bind('rrp') as Translate
  const sessions = ctx.sessions

  /**
   * Jump to a target session and return to the main Conversation view.
   * Probes ctx.uiWorkspace, falling back to ctx.sessions.open if present.
   */
  const openSession = (sessionId: string): void => {
    const uiWorkspace = resolveFace<RrpUiWorkspaceService>(ctx, 'uiWorkspace')
    if (typeof uiWorkspace?.openSession === 'function') {
      uiWorkspace.openSession(sessionId)
    } else if (typeof (sessions as unknown as { open?(id: string): void })?.open === 'function') {
      ;(sessions as unknown as { open(id: string): void }).open(sessionId)
    }
    ctx.layout?.selectPanel(null)
  }

  const api: WorldlineApi = {
    async loadTrees() {
      const response = await fetch(RRP_ROUTES.worldlineTree)
      if (!response.ok) throw new Error('worldline route HTTP ' + String(response.status))
      const body = (await response.json()) as WorldlineTreeResponse
      const byId = sessions?.list?.getSnapshot().byId ?? {}
      const fill = (nodes: WorldlineNode[]): void => {
        for (const node of nodes) {
          if (node.loaded !== false)
            node.sessionTitle = byId[node.sessionId]?.displayTitle ?? node.sessionTitle
          fill(node.children)
        }
      }
      for (const tree of body.trees) fill(tree.roots)
      return body.trees
    },
    async exportNovel(sessionId) {
      const title = sessions?.list?.getSnapshot().byId[sessionId]?.displayTitle ?? ''
      const response = await fetch(
        routeUrl(RRP_ROUTES.novelExport, sessionId, { title, format: 'md' }),
      )
      if (!response.ok) throw new Error('export HTTP ' + String(response.status))
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      try {
        const anchor = document.createElement('a')
        anchor.href = url
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
      openSession(childId)
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 400))
        const binding = sessions.binding(childId)
        if (binding !== undefined) {
          const list = sessions.list?.getSnapshot()
          const parent = list?.byId[sessionId]
          const parentTitle = parent?.title ?? parent?.displayTitle ?? cardName
          const siblings =
            list === undefined
              ? []
              : list.ids
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
    const dispose = ctx.slots.inject('conversation.view', () =>
      ctx.slots.register(
        {
          name: 'conversation.view',
          id: 'dsh-rrp/worldline',
          order: 20,
          locale: 'rrp',
          label: () => t('worldline.view'),
          inject: (sessionId: unknown) => ({ t, sessionId, api }),
        },
        WorldlinePanel as never,
      ),
    )
    return dispose
  }, 'dsh-rrp: worldline map tab')
}
