/**
 * dsh-rrp — Galgame Timeline Inspector drawer (issue #28 & #37).
 * Displays rich turn details, state badges, and provides load / fork / hide actions.
 */
import {
  Button,
  IconRefreshOutline16,
  IconSparkle16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { CSSProperties, ReactNode } from 'react'
import type { WorldlineNode } from '../../worldline-tree.ts'

export interface WorldlineInspectorProps {
  node: WorldlineNode | null
  cardName: string
  currentSessionId?: string
  onClose: () => void
  onLoad: (sessionId: string) => void
  onFork: (sessionId: string, seq: number) => void
  onHide: (sessionId: string) => void
  t: (key: string) => string
}

export function WorldlineInspector(props: WorldlineInspectorProps): ReactNode {
  const { node, cardName, currentSessionId, onClose, onLoad, onFork, onHide, t } = props
  if (node === null) return null

  const isCurrent = node.sessionId === currentSessionId
  const isPending = node.pending === true
  const isStub = node.loaded === false
  const badge = node.badge

  return (
    <aside style={S.drawer}>
      <header style={S.header}>
        <div style={S.titleGroup}>
          <span style={S.turnBadge}>
            {isStub
              ? t('worldline.stubTitle') ?? '本地存档'
              : isPending
                ? t('worldline.pendingTitle') ?? '新分支起点'
                : `Turn ${String(node.turn).padStart(2, '0')}`}
          </span>
          {isCurrent ? (
            <span style={S.liveBadge}>
              <span style={S.liveDot} />
              {t('worldline.currentPoint') ?? '当前对局位置'}
            </span>
          ) : null}
          {node.fork ? <span style={S.forkBadge}>{t('worldline.forkPoint') ?? '◆ 分歧抉择点'}</span> : null}
        </div>
        <button type="button" onClick={onClose} style={S.closeBtn} aria-label={t('worldline.close') ?? '关闭'}>
          ✕
        </button>
      </header>

      <div style={S.sessionTitleRow}>
        <span style={S.cardTag}>{cardName}</span>
        <span style={S.sessionName}>{node.sessionTitle || node.sessionId}</span>
      </div>

      <div style={S.contentScroll}>
        {isStub ? (
          <div style={S.stubNotice}>
            <p style={S.stubNoticeText}>{t('worldline.stubHint')}</p>
          </div>
        ) : isPending ? (
          <div style={S.pendingNotice}>
            <IconSparkle16 size={18} />
            <p style={S.pendingNoticeText}>
              {t('worldline.pendingHint') ?? '此分支刚刚开辟，正在等待您输入下一步行动开启全新篇章。'}
            </p>
          </div>
        ) : (
          <>
            {node.playerExcerpt.length > 0 ? (
              <section style={S.section}>
                <div style={S.sectionTitle}>{t('worldline.playerAction') ?? '玩家抉择与行动'}</div>
                <div style={S.playerBubble}>“{node.playerExcerpt}”</div>
              </section>
            ) : null}

            {node.proseExcerpt.length > 0 ? (
              <section style={S.section}>
                <div style={S.sectionTitle}>{t('worldline.proseStory') ?? '剧情发展正文'}</div>
                <div style={S.proseBox}>{node.proseExcerpt}</div>
              </section>
            ) : null}

            {badge !== undefined ? (
              <section style={S.section}>
                <div style={S.sectionTitle}>{t('worldline.stateSnapshot') ?? '世界线状态切面'}</div>
                <div style={S.badgeGrid}>
                  {badge.location !== undefined ? (
                    <div style={S.badgeItem}>
                      <span style={S.badgeIcon}>📍</span>
                      <span style={S.badgeText}>{badge.location}</span>
                    </div>
                  ) : null}
                  {badge.time !== undefined ? (
                    <div style={S.badgeItem}>
                      <span style={S.badgeIcon}>🕒</span>
                      <span style={S.badgeText}>{badge.time}</span>
                    </div>
                  ) : null}
                  {(badge.affinity ?? []).map((aff) => (
                    <div key={aff.name} style={S.badgeItem}>
                      <span style={S.badgeIcon}>❤️</span>
                      <span style={S.badgeText}>
                        {aff.name} <strong style={S.affValue}>+{aff.value}</strong>
                      </span>
                    </div>
                  ))}
                </div>
                {badge.summary !== undefined ? (
                  <div style={S.summaryLine}>
                    <span style={S.summaryLabel}>{t('worldline.conflictSummary') ?? '剧情脉络'}:</span> {badge.summary}
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        )}
      </div>

      <footer style={S.footer}>
        {!isStub ? (
          <Button
            size="md"
            variant="primary"
            onClick={() => {
              onLoad(node.sessionId)
            }}
          >
            {isCurrent
              ? t('worldline.backToChat') ?? '切回对话正文'
              : t('worldline.loadThisBranch') ?? '读档跳转至此线'}
          </Button>
        ) : null}

        {!isStub && !isPending && node.seq >= 0 ? (
          <Button
            size="md"
            variant="ghost"
            icon={<IconRefreshOutline16 size={14} />}
            onClick={() => {
              onFork(node.sessionId, node.seq)
            }}
          >
            {t('worldline.forkNewBranch') ?? '从此开辟新分支'}
          </Button>
        ) : null}

        <Button
          size="md"
          variant="ghost"
          onClick={() => {
            onHide(node.sessionId)
          }}
        >
          {t('worldline.hide') ?? '收起分支'}
        </Button>
      </footer>
    </aside>
  )
}

const S: Record<string, CSSProperties> = {
  drawer: {
    position: 'absolute',
    top: 12,
    right: 14,
    bottom: 14,
    width: 380,
    maxWidth: 'calc(100% - 28px)',
    background: 'var(--dsw-alias-bg-layer-2)',
    backdropFilter: 'blur(16px)',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 12,
    boxShadow: '0 12px 36px rgba(0,0,0,0.38)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 40,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--dsw-alias-border-l1)',
  },
  titleGroup: { display: 'flex', alignItems: 'center', gap: 8 },
  turnBadge: {
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'monospace',
    color: 'var(--dsw-alias-brand-primary, #2dd4bf)',
    background: 'rgba(45, 212, 191, 0.12)',
    padding: '2px 8px',
    borderRadius: 6,
    border: '1px solid rgba(45, 212, 191, 0.25)',
  },
  liveBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    color: 'var(--dsw-alias-brand-primary, #2dd4bf)',
    fontWeight: 600,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--dsw-alias-brand-primary, #2dd4bf)',
    boxShadow: '0 0 8px var(--dsw-alias-brand-primary, #2dd4bf)',
  },
  forkBadge: {
    fontSize: 11,
    color: '#eab308',
    fontWeight: 600,
    background: 'rgba(234, 179, 8, 0.12)',
    padding: '2px 6px',
    borderRadius: 4,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--dsw-alias-label-tertiary)',
    padding: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px',
    background: 'var(--dsw-alias-bg-layer-1)',
    borderBottom: '1px solid var(--dsw-alias-border-l1)',
  },
  cardTag: {
    fontSize: 11,
    color: 'var(--dsw-alias-label-secondary)',
    fontWeight: 600,
  },
  sessionName: {
    fontSize: 11,
    color: 'var(--dsw-alias-label-tertiary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  contentScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  section: { display: 'flex', flexDirection: 'column', gap: 6 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--dsw-alias-label-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  playerBubble: {
    fontSize: 13,
    lineHeight: 1.5,
    fontWeight: 500,
    color: 'var(--dsw-alias-label-primary)',
    background: 'var(--dsw-alias-bg-layer-1)',
    padding: '10px 12px',
    borderRadius: 8,
    borderLeft: '3px solid var(--dsw-alias-brand-primary, #2dd4bf)',
  },
  proseBox: {
    fontSize: 12.5,
    lineHeight: 1.65,
    color: 'var(--dsw-alias-label-secondary)',
    background: 'var(--dsw-alias-bg-base)',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--dsw-alias-border-l1)',
    maxHeight: 160,
    overflowY: 'auto',
    whiteSpace: 'pre-wrap',
  },
  badgeGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  badgeItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11.5,
    padding: '4px 8px',
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
    borderRadius: 6,
  },
  badgeIcon: { fontSize: 11 },
  badgeText: { color: 'var(--dsw-alias-label-secondary)' },
  affValue: { color: '#f43f5e' },
  summaryLine: {
    fontSize: 11.5,
    lineHeight: 1.4,
    color: 'var(--dsw-alias-label-tertiary)',
    marginTop: 4,
  },
  summaryLabel: { fontWeight: 600 },
  stubNotice: {
    padding: '24px 12px',
    textAlign: 'center',
  },
  stubNoticeText: {
    fontSize: 12,
    color: 'var(--dsw-alias-label-tertiary)',
    lineHeight: 1.5,
  },
  pendingNotice: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: '28px 14px',
    textAlign: 'center',
    color: 'var(--dsw-alias-brand-primary, #2dd4bf)',
  },
  pendingNoticeText: {
    fontSize: 12.5,
    color: 'var(--dsw-alias-label-secondary)',
    lineHeight: 1.5,
  },
  footer: {
    padding: '12px 16px',
    borderTop: '1px solid var(--dsw-alias-border-l1)',
    background: 'var(--dsw-alias-bg-layer-1)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
}
