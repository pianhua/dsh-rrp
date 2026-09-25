import { Button, Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { WorldlineNode } from '../../worldline-tree.ts'
import { visibleTurnWindow, type WorldlineBranch } from '../worldline-utils.ts'

const ROW_HEIGHT = 148

export interface WorldlineTurnRailProps {
  branch?: WorldlineBranch
  currentSessionId?: string
  t: (key: string) => string
  onFork: (branch: WorldlineBranch, node: WorldlineNode) => void
}

export function WorldlineTurnRail(props: WorldlineTurnRailProps): ReactNode {
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportSize, setViewportSize] = useState(4)
  const [selectedKey, setSelectedKey] = useState<string | undefined>()
  const nodes = useMemo(
    () => [...(props.branch?.nodes ?? [])].sort((a, b) => a.turn - b.turn),
    [props.branch],
  )
  const window = visibleTurnWindow(nodes.length, Math.floor(scrollTop / ROW_HEIGHT), viewportSize)
  if (props.branch === undefined) {
    return <div style={S.empty}>{props.t('worldline.selectBranch')}</div>
  }
  if (props.branch.cold || nodes.length === 0) {
    return (
      <main style={S.root}>
        <header style={S.header}>
          <strong>{props.branch.title}</strong>
        </header>
        <div style={S.empty}>{props.t('worldline.coldHint')}</div>
      </main>
    )
  }
  return (
    <main style={S.root}>
      <header style={S.header}>
        <strong>{props.branch.title}</strong>
        {props.branch.seedKnown === false ? (
          <Pill>{props.t('worldline.unknownPosition')}</Pill>
        ) : null}
        <span style={S.spacer} />
        <span style={S.count}>
          {props.t('worldline.turnCount').replace('{n}', String(nodes.length))}
        </span>
      </header>
      <div
        style={S.scroll}
        onScroll={(event) => {
          const target = event.currentTarget
          setScrollTop(target.scrollTop)
          setViewportSize(Math.max(1, Math.ceil(target.clientHeight / ROW_HEIGHT)))
        }}
      >
        <div style={{ height: nodes.length * ROW_HEIGHT, position: 'relative' }}>
          <div style={{ position: 'absolute', top: window.start * ROW_HEIGHT, left: 0, right: 0 }}>
            {nodes.slice(window.start, window.end).map((node) => {
              const selected = node.key === selectedKey
              const current = node.sessionId === props.currentSessionId && node.isHead === true
              return (
                <article
                  key={node.key}
                  style={{
                    ...S.card,
                    ...(selected ? S.selected : {}),
                    ...(current ? S.current : {}),
                  }}
                  onClick={() => setSelectedKey(node.key)}
                  title={node.proseExcerpt}
                >
                  <div style={S.cardHead}>
                    <span style={S.turn}>
                      {props.t('worldline.turnShort').replace('{n}', String(node.turn))}
                    </span>
                    {current ? <Pill>{props.t('worldline.currentTurn')}</Pill> : null}
                    <span style={S.spacer} />
                    {node.badge?.location ? (
                      <span style={S.badge}>{node.badge.location}</span>
                    ) : null}
                    {node.badge?.time ? <span style={S.badge}>{node.badge.time}</span> : null}
                  </div>
                  <div style={S.player}>{node.playerExcerpt}</div>
                  <div style={S.prose}>{node.proseExcerpt}</div>
                  {node.badge?.affinity?.length || node.badge?.summary ? (
                    <div style={S.badges}>
                      {(node.badge.affinity ?? []).slice(0, 3).map((affinity) => (
                        <Pill key={affinity.name}>
                          {affinity.name} {String(affinity.value)}
                        </Pill>
                      ))}
                      {node.badge.summary ? (
                        <span style={S.summary}>{node.badge.summary}</span>
                      ) : null}
                    </div>
                  ) : null}
                  {node.meta ? (
                    <div style={S.meta}>
                      {node.meta.actor ? props.t('worldline.actor.' + node.meta.actor) : null}
                      {node.meta.origin ? props.t('worldline.origin.' + node.meta.origin) : null}
                      {node.meta.changeCount === undefined
                        ? null
                        : props
                            .t('worldline.changes')
                            .replace('{n}', String(node.meta.changeCount))}
                    </div>
                  ) : null}
                  {selected ? (
                    <div style={S.detail}>
                      <div>{node.playerExcerpt}</div>
                      <div>{node.proseExcerpt}</div>
                      <span style={S.detailHint}>{props.t('worldline.fullTextHint')}</span>
                    </div>
                  ) : null}
                  {selected && node.seq >= 0 ? (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={(event) => {
                        event.stopPropagation()
                        props.onFork(props.branch!, node)
                      }}
                    >
                      {props.t('worldline.forkFromHere')}
                    </Button>
                  ) : null}
                </article>
              )
            })}
          </div>
        </div>
      </div>
    </main>
  )
}

const S: Record<string, CSSProperties> = {
  root: { flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px',
    borderBottom: '1px solid var(--dsw-alias-border-l1)',
  },
  spacer: { flex: 1 },
  count: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' },
  scroll: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px' },
  card: {
    minHeight: ROW_HEIGHT - 16,
    marginBottom: 10,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    borderRadius: 8,
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
    cursor: 'pointer',
  },
  selected: { borderColor: 'var(--dsw-alias-brand-primary)' },
  current: { boxShadow: '0 0 0 1px var(--dsw-alias-brand-primary)' },
  cardHead: { display: 'flex', alignItems: 'center', gap: 6 },
  turn: { fontFamily: 'var(--dsw-font-mono, monospace)', fontWeight: 700, fontSize: 12 },
  player: {
    fontSize: 12,
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  prose: {
    fontSize: 11.5,
    lineHeight: 1.45,
    color: 'var(--dsw-alias-label-secondary)',
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
  },
  badges: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  badge: { fontSize: 10.5, color: 'var(--dsw-alias-label-tertiary)' },
  summary: {
    fontSize: 10.5,
    color: 'var(--dsw-alias-label-tertiary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  meta: { display: 'flex', gap: 8, fontSize: 10.5, color: 'var(--dsw-alias-label-tertiary)' },
  detail: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: 8,
    borderRadius: 6,
    background: 'var(--dsw-alias-bg-base)',
    fontSize: 11,
    lineHeight: 1.45,
  },
  detailHint: { color: 'var(--dsw-alias-label-tertiary)' },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    color: 'var(--dsw-alias-label-tertiary)',
    fontSize: 12,
  },
}
