/**
 * dsh-rrp — Galgame Flowchart visual diagram (issue #28 & #37).
 * Renders an interactive SVG-linked branching tree with pan/zoom and inspector drawer.
 */
import { Button, Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import type { WorldlineNode } from '../../worldline-tree.ts'
import { WorldlineInspector } from './worldline-inspector.tsx'
import {
  layoutWorldlineForest,
  type LayoutResult,
  type PositionedNode,
} from './worldline-layout.ts'

export interface WorldlineFlowchartProps {
  roots: readonly WorldlineNode[]
  cardName: string
  currentSessionId?: string
  onLoad: (sessionId: string) => void
  onFork: (sessionId: string, seq: number) => void
  onHide: (sessionId: string) => void
  t: (key: string) => string
}

export function WorldlineFlowchart(props: WorldlineFlowchartProps): ReactNode {
  const { roots, cardName, currentSessionId, onLoad, onFork, onHide, t } = props

  // Calculate coordinates & Bezier links using our pure layout engine
  const layout: LayoutResult = useMemo(
    () => layoutWorldlineForest(roots, currentSessionId),
    [roots, currentSessionId],
  )

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [scale, setScale] = useState(1.0)
  const [pan, setPan] = useState({ x: 40, y: 30 })
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0, initialPanX: 0, initialPanY: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Find currently selected node for the Inspector
  const selectedNode = useMemo(() => {
    if (selectedKey === null) return null
    return layout.nodes.find((item) => item.node.key === selectedKey)?.node ?? null
  }, [selectedKey, layout.nodes])

  // Center to the active/current node if available
  const focusCurrent = useCallback(() => {
    const current = layout.nodes.find((item) => item.isCurrent) ?? layout.nodes[0]
    if (current === undefined || containerRef.current === null) return
    const rect = containerRef.current.getBoundingClientRect()
    const targetX = rect.width / 2 - (current.x + current.width / 2) * scale
    const targetY = rect.height / 3 - (current.y + current.height / 2) * scale
    setPan({ x: targetX, y: targetY })
    setSelectedKey(current.node.key)
  }, [layout.nodes, scale])

  // Initial focus once when tree loads
  const initializedRef = useRef(false)
  useEffect(() => {
    if (!initializedRef.current && layout.nodes.length > 0) {
      initializedRef.current = true
      focusCurrent()
    }
  }, [layout.nodes, focusCurrent])

  // Pan interaction
  const handleMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    // Only drag with left click on canvas background
    if (e.button !== 0) return
    setIsPanning(true)
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialPanX: pan.x,
      initialPanY: pan.y,
    }
  }

  const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!isPanning) return
    const dx = e.clientX - panStartRef.current.x
    const dy = e.clientY - panStartRef.current.y
    setPan({
      x: panStartRef.current.initialPanX + dx,
      y: panStartRef.current.initialPanY + dy,
    })
  }

  const handleMouseUp = () => {
    setIsPanning(false)
  }

  // Zoom interaction
  const handleWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9
    setScale((prev) => Math.min(Math.max(prev * zoomFactor, 0.35), 2.0))
  }

  return (
    <div
      ref={containerRef}
      style={S.viewport}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Top Floating Control Bar */}
      <div style={S.toolbar}>
        <div style={S.pillGroup}>
          <Pill>{cardName}</Pill>
          <span style={S.statsText}>
            {layout.nodes.length} {t('worldline.totalNodes') ?? '处存档节点'}
          </span>
        </div>
        <div style={S.zoomControls}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setScale((s) => Math.max(s * 0.85, 0.35))}
            aria-label="缩小"
          >
            -
          </Button>
          <span style={S.scaleLabel}>{Math.round(scale * 100)}%</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setScale((s) => Math.min(s * 1.15, 2.0))}
            aria-label="放大"
          >
            +
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setScale(1.0)
              focusCurrent()
            }}
          >
            {t('worldline.focus') ?? '居中'}
          </Button>
        </div>
      </div>

      {/* Scalable Diagram Layer */}
      <div
        style={{
          ...S.diagram,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          cursor: isPanning ? 'grabbing' : 'grab',
        }}
      >
        {/* SVG Bezier Connectors Layer */}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: layout.width,
            height: layout.height,
            pointerEvents: 'none',
            overflow: 'visible',
          }}
        >
          <defs>
            <linearGradient id="linkCurrentGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#2dd4bf" />
              <stop offset="100%" stopColor="#0ea5e9" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="glow" />
              <feComposite in="SourceGraphic" in2="glow" operator="over" />
            </filter>
          </defs>

          {layout.links.map((link) => (
            <path
              key={`${link.fromKey}->${link.toKey}`}
              d={link.pathData}
              fill="none"
              stroke={
                link.isCurrent
                  ? 'url(#linkCurrentGrad)'
                  : 'var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.2))'
              }
              strokeWidth={link.isCurrent ? 3 : 2}
              strokeDasharray={link.isPending || link.isStub ? '5,5' : 'none'}
              filter={link.isCurrent ? 'url(#glow)' : undefined}
              opacity={link.isStub ? 0.45 : 0.85}
            />
          ))}
        </svg>

        {/* Node Cards Layer */}
        {layout.nodes.map((pos) => {
          const isSelected = pos.node.key === selectedKey
          return (
            <NodeCard
              key={pos.node.key}
              pos={pos}
              isSelected={isSelected}
              onSelect={() => setSelectedKey(pos.node.key)}
              onQuickLoad={() => onLoad(pos.node.sessionId)}
              t={t}
            />
          )
        })}
      </div>

      {/* Worldline Inspector Drawer */}
      <WorldlineInspector
        node={selectedNode}
        cardName={cardName}
        currentSessionId={currentSessionId}
        onClose={() => setSelectedKey(null)}
        onLoad={(id) => {
          onLoad(id)
        }}
        onFork={(id, seq) => {
          onFork(id, seq)
        }}
        onHide={(id) => {
          onHide(id)
          setSelectedKey(null)
        }}
        t={t}
      />
    </div>
  )
}

function NodeCard(props: {
  pos: PositionedNode
  isSelected: boolean
  onSelect: () => void
  onQuickLoad: () => void
  t: (key: string) => string
}): ReactNode {
  const { pos, isSelected, onSelect, onQuickLoad, t } = props
  const { node, x, y, width, height, isCurrent } = pos
  const isPending = node.pending === true
  const isStub = node.loaded === false
  const badge = node.badge

  let cardStyle: CSSProperties = { ...S.nodeCard, left: x, top: y, width, height }
  if (isSelected) {
    cardStyle = { ...cardStyle, ...S.nodeSelected }
  } else if (isCurrent) {
    cardStyle = { ...cardStyle, ...S.nodeCurrent }
  } else if (isPending) {
    cardStyle = { ...cardStyle, ...S.nodePending }
  } else if (isStub) {
    cardStyle = { ...cardStyle, ...S.nodeStub }
  }

  return (
    <div
      style={cardStyle}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        if (!isStub) onQuickLoad()
      }}
      title={node.sessionTitle}
    >
      {/* Header bar */}
      <div style={S.nodeHeader}>
        <span style={S.nodeTurnText}>
          {isStub ? '冷存档' : isPending ? '待执笔' : `T${String(node.turn).padStart(2, '0')}`}
        </span>
        <span style={S.nodeBranchName}>{node.sessionTitle || '主线'}</span>
        {isCurrent ? (
          <span style={S.nodeCurrentDot} title={t('worldline.currentPoint') ?? '当前位置'} />
        ) : null}
        {node.fork ? <span style={S.nodeForkIcon}>◆</span> : null}
      </div>

      {/* Body content */}
      <div style={S.nodeBody}>
        {isStub ? (
          <div style={S.nodeStubText}>{t('worldline.stubHint')}</div>
        ) : isPending ? (
          <div style={S.nodePendingText}>✦ 新分支起点（点击读档进入）</div>
        ) : (
          <>
            {node.playerExcerpt.length > 0 ? (
              <div style={S.nodePlayerText}>“{node.playerExcerpt}”</div>
            ) : null}
            {node.proseExcerpt.length > 0 ? (
              <div style={S.nodeProseText}>{node.proseExcerpt}</div>
            ) : null}
          </>
        )}
      </div>

      {/* Badges footer */}
      {badge !== undefined ? (
        <div style={S.nodeBadgeRow}>
          {badge.location !== undefined ? (
            <span style={S.nodeBadgeItem}>📍{badge.location}</span>
          ) : null}
          {(badge.affinity ?? []).slice(0, 1).map((a) => (
            <span key={a.name} style={S.nodeBadgeItem}>
              ❤️{a.name}+{a.value}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const S: Record<string, CSSProperties> = {
  viewport: {
    position: 'relative',
    width: '100%',
    height: '100%',
    flex: 1,
    minHeight: 0,
    background:
      'radial-gradient(ellipse at 50% 20%, rgba(20, 24, 33, 0.98), var(--dsw-alias-bg-base, #0b0f17))',
    overflow: 'hidden',
    userSelect: 'none',
  },
  toolbar: {
    position: 'absolute',
    top: 14,
    left: 16,
    zIndex: 30,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: 'var(--dsw-alias-bg-layer-2, rgba(23, 28, 38, 0.85))',
    backdropFilter: 'blur(10px)',
    border: '1px solid var(--dsw-alias-border-l1)',
    padding: '6px 12px',
    borderRadius: 8,
    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
  },
  pillGroup: { display: 'flex', alignItems: 'center', gap: 8 },
  statsText: {
    fontSize: 11.5,
    color: 'var(--dsw-alias-label-tertiary)',
    fontWeight: 500,
  },
  zoomControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    borderLeft: '1px solid var(--dsw-alias-border-l1)',
    paddingLeft: 8,
  },
  scaleLabel: {
    fontSize: 11.5,
    fontFamily: 'monospace',
    color: 'var(--dsw-alias-label-secondary)',
    minWidth: 40,
    textAlign: 'center',
  },
  diagram: {
    position: 'absolute',
    top: 0,
    left: 0,
    transformOrigin: '0 0',
    transition: 'transform 0.04s ease-out',
  },
  nodeCard: {
    position: 'absolute',
    background: 'var(--dsw-alias-bg-layer-1, rgba(28, 33, 44, 0.92))',
    backdropFilter: 'blur(8px)',
    border: '1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.12))',
    borderRadius: 8,
    padding: '7px 10px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    boxShadow: '0 4px 12px rgba(0,0,0,0.22)',
    cursor: 'pointer',
    boxSizing: 'border-box',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
  },
  nodeSelected: {
    borderColor: '#38bdf8',
    boxShadow: '0 0 0 2px rgba(56, 189, 248, 0.35), 0 8px 24px rgba(0,0,0,0.4)',
    transform: 'scale(1.02)',
    zIndex: 20,
  },
  nodeCurrent: {
    borderColor: 'var(--dsw-alias-brand-primary, #2dd4bf)',
    boxShadow: '0 0 16px rgba(45, 212, 191, 0.3), 0 4px 16px rgba(0,0,0,0.3)',
    background: 'linear-gradient(135deg, rgba(45, 212, 191, 0.08), var(--dsw-alias-bg-layer-1))',
  },
  nodePending: {
    borderStyle: 'dashed',
    borderColor: 'var(--dsw-alias-brand-primary, #2dd4bf)',
    background: 'rgba(45, 212, 191, 0.04)',
  },
  nodeStub: {
    borderStyle: 'dashed',
    opacity: 0.65,
    background: 'transparent',
  },
  nodeHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
    paddingBottom: 4,
    marginBottom: 4,
  },
  nodeTurnText: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: 700,
    color: 'var(--dsw-alias-brand-primary, #2dd4bf)',
  },
  nodeBranchName: {
    flex: 1,
    fontSize: 10.5,
    color: 'var(--dsw-alias-label-tertiary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  nodeCurrentDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#2dd4bf',
    boxShadow: '0 0 8px #2dd4bf',
  },
  nodeForkIcon: {
    fontSize: 10,
    color: '#eab308',
  },
  nodeBody: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  nodePlayerText: {
    fontSize: 11.5,
    fontWeight: 600,
    color: 'var(--dsw-alias-label-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  nodeProseText: {
    fontSize: 10.5,
    color: 'var(--dsw-alias-label-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.35,
  },
  nodeStubText: {
    fontSize: 10.5,
    color: 'var(--dsw-alias-label-tertiary)',
    lineHeight: 1.3,
  },
  nodePendingText: {
    fontSize: 11,
    color: 'var(--dsw-alias-brand-primary, #2dd4bf)',
    lineHeight: 1.3,
  },
  nodeBadgeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 10,
    color: 'var(--dsw-alias-label-tertiary)',
    marginTop: 3,
  },
  nodeBadgeItem: {
    background: 'rgba(255,255,255,0.05)',
    padding: '1px 5px',
    borderRadius: 4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
}
