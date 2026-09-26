import {
  Button,
  IconLoadingOutline16,
  IconRefreshOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { WORLDLINE_DIGEST_KEY } from '../worldline-digest.ts'
import {
  RRP_ROUTES,
  routeUrl,
  type WorldlineHiddenResponse,
  type WorldlineTreeResponse,
} from '../route-contract.ts'
import type { WorldlineNode, WorldlineTree } from '../worldline-tree.ts'
import type { RrpClientContext, RrpUiWorkspaceService, RrpUseProjection } from './context-types.ts'
import { WorldlineBranchList } from './components/worldline-branch-list.tsx'
import { WorldlineForkDialog } from './components/worldline-fork-dialog.tsx'
import { WorldlineHideDialog } from './components/worldline-hide-dialog.tsx'
import { WorldlineTurnRail } from './components/worldline-turn-rail.tsx'
import {
  branchTitleForCount,
  directChildCount,
  flattenWorldlineBranches,
  type WorldlineBranch,
} from './worldline-utils.ts'

type Translate = (key: string) => string

export interface WorldlineLoadResult {
  trees: WorldlineTree[]
  hidden: string[]
}

export interface WorldlineApi {
  loadTrees(): Promise<WorldlineLoadResult>
  sessionSummaries(): Record<
    string,
    {
      displayTitle?: string
      title?: string
      cardId?: string
      cardName?: string
      updatedAt?: string | number
    }
  >
  exportNovel(sessionId: string): Promise<void>
  open(sessionId: string): void
  fork(sessionId: string, atSeq: number, title: string): Promise<void>
  hide(sessionId: string): Promise<void>
  restore(sessionId: string): Promise<void>
  rename(sessionId: string, title: string): Promise<void>
  subscribe(listener: () => void): () => void
}

interface WorldlinePanelProps {
  t?: Translate
  sessionId?: string
  api?: WorldlineApi
  useProjection?: RrpUseProjection
  openView?: (viewId: string) => void
}

function resolveFace<T>(target: unknown, name: string): T | undefined {
  try {
    const record = target as Record<string, unknown>
    if (typeof (target as { get?(name: string): unknown }).get === 'function') {
      const value = (target as { get(name: string): unknown }).get(name)
      if (value !== undefined) return value as T
    }
    return record[name] as T | undefined
  } catch {
    return undefined
  }
}

function WorldlinePanel(props: WorldlinePanelProps): ReactNode {
  const t = props.t ?? ((key: string) => key)
  const api = props.api
  const [trees, setTrees] = useState<WorldlineTree[]>([])
  const [hiddenIds, setHiddenIds] = useState<string[]>([])
  const [hiddenBranches, setHiddenBranches] = useState<WorldlineBranch[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState(props.sessionId)
  const [forkTarget, setForkTarget] = useState<{ branch: WorldlineBranch; node: WorldlineNode }>()
  const [hideTarget, setHideTarget] = useState<WorldlineBranch>()
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const digest = props.useProjection?.(WORLDLINE_DIGEST_KEY)
  const summaries = api?.sessionSummaries() ?? {}

  const refresh = useCallback(async (): Promise<void> => {
    if (api === undefined) return
    setBusy(true)
    try {
      const result = await api.loadTrees()
      setTrees(result.trees)
      setHiddenIds(result.hidden)
      setError('')
    } catch (cause) {
      console.warn('[dsh-rrp] worldline refresh failed', cause)
      setError(t('worldline.operationFailed'))
    } finally {
      setBusy(false)
    }
  }, [api, t])

  useEffect(() => {
    if (api === undefined) return
    refresh()
    return api.subscribe(() => refresh())
  }, [api, refresh])

  useEffect(() => {
    refresh()
  }, [digest, refresh])

  useEffect(() => {
    setSelectedSessionId(props.sessionId)
  }, [props.sessionId])

  const activityBySession = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(summaries).flatMap(([id, summary]) =>
          summary.updatedAt === undefined ? [] : [[id, summary.updatedAt]],
        ),
      ),
    [summaries, trees, digest],
  )
  const groups = useMemo(
    () => flattenWorldlineBranches(trees, { activityBySession }),
    [activityBySession, trees],
  )
  const allBranches = useMemo(() => groups.flatMap((group) => group.branches), [groups])
  const selectedBranch = allBranches.find((branch) => branch.sessionId === selectedSessionId)
  const branchCache = useMemo(
    () => new Map(allBranches.map((branch) => [branch.sessionId, branch])),
    [allBranches],
  )

  useEffect(() => {
    setHiddenBranches((previous) => {
      const next = new Map(previous.map((branch) => [branch.sessionId, branch]))
      for (const branch of allBranches) next.set(branch.sessionId, branch)
      for (const id of hiddenIds) {
        if (next.has(id)) continue
        const summary = summaries[id]
        if (summary === undefined) continue
        next.set(id, {
          cardId: summary.cardId ?? 'unknown',
          cardName: summary.cardName ?? t('worldline.unknownCard'),
          sessionId: id,
          title: summary.displayTitle ?? summary.title ?? id,
          nodes: [],
          descendantCount: 0,
          cold: true,
          pending: false,
          activity: undefined,
        })
      }
      return hiddenIds
        .map((id) => next.get(id))
        .filter((branch): branch is WorldlineBranch => branch !== undefined)
    })
  }, [allBranches, hiddenIds, summaries, t])

  const runAction = (action: () => Promise<void>, after?: () => void): void => {
    action()
      .then(() => {
        after?.()
        return refresh()
      })
      .catch((cause: unknown) => {
        console.warn('[dsh-rrp] worldline action failed', cause)
        setError(t('worldline.operationFailed'))
      })
  }

  const handleExport = (sessionId: string): void => {
    if (api === undefined) return
    setExporting(true)
    api
      .exportNovel(sessionId)
      .catch((cause: unknown) => {
        console.warn('[dsh-rrp] worldline export failed', cause)
        setError(t('worldline.operationFailed'))
      })
      .finally(() => setExporting(false))
  }

  if (api === undefined) {
    return <div style={S.empty}>{t('worldline.unavailable')}</div>
  }

  const open = (sessionId: string): void => {
    setSelectedSessionId(sessionId)
    api.open(sessionId)
    props.openView?.('chat')
  }
  const forkDefaultTitle =
    forkTarget === undefined
      ? ''
      : branchTitleForCount(
          forkTarget.branch.title,
          directChildCount(trees, forkTarget.branch.sessionId),
        )
  return (
    <div style={S.root}>
      <header style={S.header}>
        <strong style={S.title}>{t('worldline.title')}</strong>
        {busy ? <IconLoadingOutline16 size={14} /> : null}
        <span style={S.spacer} />
        {props.sessionId ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={exporting}
            onClick={() => handleExport(props.sessionId as string)}
          >
            {exporting ? t('worldline.exporting') : t('worldline.export')}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          icon={<IconRefreshOutline16 size={14} />}
          aria-label={t('worldline.refresh')}
          onClick={() => refresh()}
        />
      </header>
      {error ? <div style={S.error}>{error}</div> : null}
      <div style={S.body}>
        <WorldlineBranchList
          groups={groups}
          hidden={hiddenBranches}
          selectedSessionId={selectedSessionId}
          t={t}
          onSelect={(branch) => setSelectedSessionId(branch.sessionId)}
          onOpen={open}
          onRename={(sessionId, title) => runAction(() => api.rename(sessionId, title))}
          onHide={(branch) => setHideTarget(branch)}
          onRestore={(sessionId) => {
            runAction(
              () => api.restore(sessionId),
              () => {
                setHiddenBranches((previous) =>
                  previous.filter((branch) => branch.sessionId !== sessionId),
                )
              },
            )
          }}
          onExport={handleExport}
        />
        <WorldlineTurnRail
          branch={selectedBranch}
          currentSessionId={props.sessionId}
          t={t}
          onFork={(branch, node) => setForkTarget({ branch, node })}
        />
      </div>
      {forkTarget ? (
        <WorldlineForkDialog
          branch={forkTarget.branch}
          atTurn={forkTarget.node.turn}
          atSeq={forkTarget.node.seq}
          defaultTitle={forkDefaultTitle}
          t={t}
          onCancel={() => setForkTarget(undefined)}
          onConfirm={(title) => {
            const target = forkTarget
            setForkTarget(undefined)
            runAction(() => api.fork(target.branch.sessionId, target.node.seq, title))
          }}
        />
      ) : null}
      {hideTarget ? (
        <WorldlineHideDialog
          branch={hideTarget}
          t={t}
          onCancel={() => setHideTarget(undefined)}
          onConfirm={() => {
            const target = hideTarget
            setHideTarget(undefined)
            setHiddenBranches((previous) => [
              target,
              ...previous.filter((branch) => branch.sessionId !== target.sessionId),
            ])
            runAction(
              () => api.hide(target.sessionId),
              () => {
                if (selectedSessionId === target.sessionId) setSelectedSessionId(props.sessionId)
              },
            )
          }}
        />
      ) : null}
      {branchCache.size === 0 && !busy && !error ? (
        <div style={S.empty}>{t('worldline.empty')}</div>
      ) : null}
    </div>
  )
}

const S: Record<string, CSSProperties> = {
  root: {
    height: '100%',
    width: '100%',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--dsw-alias-bg-base)',
    color: 'var(--dsw-alias-label-primary)',
    overflow: 'hidden',
  },
  header: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    borderBottom: '1px solid var(--dsw-alias-border-l1)',
  },
  title: { fontSize: 14 },
  spacer: { flex: 1 },
  body: { flex: 1, minHeight: 0, display: 'flex' },
  error: { padding: '7px 14px', fontSize: 11.5, color: 'var(--dsw-alias-label-danger)' },
  empty: {
    padding: 24,
    textAlign: 'center',
    color: 'var(--dsw-alias-label-tertiary)',
    fontSize: 12,
  },
}

export function registerWorldlineTab(ctx: RrpClientContext): void {
  const t = ctx.locale.bind('rrp') as Translate
  const sessions = ctx.sessions
  const openSession = (sessionId: string): void => {
    const workspace = resolveFace<RrpUiWorkspaceService>(ctx, 'uiWorkspace')
    workspace?.openSession(sessionId)
    ctx.layout?.selectPanel(null)
  }
  const api: WorldlineApi = {
    async loadTrees() {
      const [treeResponse, hiddenResponse] = await Promise.all([
        fetch(RRP_ROUTES.worldlineTree),
        fetch(RRP_ROUTES.worldlineHidden),
      ])
      if (!treeResponse.ok) throw new Error('worldline tree ' + String(treeResponse.status))
      if (!hiddenResponse.ok) throw new Error('worldline hidden ' + String(hiddenResponse.status))
      const body = (await treeResponse.json()) as WorldlineTreeResponse
      const hidden = (await hiddenResponse.json()) as WorldlineHiddenResponse
      const byId = sessions?.list?.getSnapshot().byId ?? {}
      const fill = (nodes: WorldlineNode[]): void => {
        for (const node of nodes) {
          const summary = byId[node.sessionId]
          if (node.loaded !== false && summary !== undefined) {
            node.sessionTitle = summary.displayTitle ?? summary.title ?? node.sessionTitle
          }
          fill(node.children)
        }
      }
      for (const tree of body.trees) fill(tree.roots)
      return { trees: body.trees, hidden: hidden.hidden }
    },
    sessionSummaries() {
      return sessions?.list?.getSnapshot().byId ?? {}
    },
    async exportNovel(sessionId) {
      const title = sessions?.list?.getSnapshot().byId[sessionId]?.displayTitle ?? ''
      const response = await fetch(
        routeUrl(RRP_ROUTES.novelExport, sessionId, { title, format: 'md' }),
      )
      if (!response.ok) throw new Error('export ' + String(response.status))
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      try {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = (title.length > 0 ? title : 'novel').replace(/[\\/:*?"<>|]/g, '_') + '.md'
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
      } finally {
        URL.revokeObjectURL(url)
      }
    },
    open: openSession,
    async fork(sessionId, atSeq, title) {
      if (sessions?.fork === undefined) throw new Error('fork unavailable')
      const childId = await sessions.fork({ sessionId, atSeq, increaseTitle: true })
      openSession(childId)
      const binding = sessions.binding(childId)
      if (binding?.session.rename === undefined) throw new Error('new branch binding unavailable')
      try {
        await binding.session.rename(title)
      } catch (cause) {
        console.warn('[dsh-rrp] branch title could not be applied', cause)
      }
    },
    async hide(sessionId) {
      await setHidden(sessionId, true)
    },
    async restore(sessionId) {
      await setHidden(sessionId, false)
    },
    async rename(sessionId, title) {
      const binding = sessions?.binding(sessionId)
      if (binding?.session.rename === undefined) throw new Error('branch binding unavailable')
      await binding.session.rename(title)
    },
    subscribe(listener) {
      return sessions?.list?.subscribe(listener) ?? (() => {})
    },
  }
  async function setHidden(sessionId: string, hidden: boolean): Promise<void> {
    const response = await fetch(RRP_ROUTES.worldlineHidden, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, hidden }),
    })
    if (!response.ok) throw new Error('worldline hidden ' + String(response.status))
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
  }, 'dsh-rrp: worldline tab')
}
