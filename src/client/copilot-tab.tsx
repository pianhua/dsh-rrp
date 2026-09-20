/**
 * dsh-rrp — the 「副驾驶」 right-sidebar tab (Copilot advisor).
 *
 * The player's omniscient stage-director assistant, fully out-of-band: the
 * conversation rides one SSE POST against the host route and lands in
 * plugin-private storage — the session log never sees it. State changes she
 * makes surface as action cards under her reply, with an honest undo stack
 * (a revert publish, not an erasure).
 */
import {
  Button,
  DisclosureRow,
  IconEditOutline16,
  IconLoadingOutline16,
  IconRefreshOutline16,
  IconTrashOutline16,
  Input,
  MarkdownText,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { COPILOT_SSE, RRP_ROUTES, drainSse, type CopilotTurn, type StewardProposal } from '../route-contract.ts'
import type { RrpClientContext } from './context-types.ts'

/** Implementation identity; also the key the body registers under. */
const TAB_ID = 'dsh-rrp/copilot'
/** Type discriminator openTab names. */
const TAB_KIND = 'dsh-rrp-copilot'
/** Host route driving the advisory conversation (path from the shared contract). */
const COPILOT_PATH = RRP_ROUTES.copilot
/** Host route confirming/discarding staged steward proposals. */
const PROPOSALS_PATH = RRP_ROUTES.copilotProposals

type Translate = (key: string) => string

/** Props the slot framework merges. */
interface CopilotPanelProps {
  t?: Translate
  sessionId?: string
}

const S: Record<string, CSSProperties> = {
  root: { height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)' },
  header: { flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 10px', borderBottom: '1px solid var(--dsw-alias-border-l1)' },
  title: { fontSize: 14, fontWeight: 600 },
  spacer: { flex: 1 },
  scroll: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 14px 20px' },
  hint: { margin: '0 0 12px', fontSize: 11.5, lineHeight: 1.6, color: 'var(--dsw-alias-label-tertiary)' },
  turn: { marginBottom: 14 },
  turnLabel: { fontSize: 11, marginBottom: 4, color: 'var(--dsw-alias-label-tertiary)' },
  bubblePlayer: {
    padding: '9px 11px', borderRadius: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    background: 'var(--dsw-alias-brand-primary)', color: 'var(--dsw-alias-label-primary-inverted, #fff)',
    fontSize: 13, lineHeight: 1.65,
  },
  bubbleCopilot: {
    padding: '9px 11px', borderRadius: 10, wordBreak: 'break-word',
    background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l1)',
    fontSize: 13, lineHeight: 1.65,
  },
  actions: {
    marginTop: 6, padding: '9px 11px', borderRadius: 10,
    background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-brand-primary)',
    fontSize: 12, lineHeight: 1.7,
  },
  actionsTitle: { fontWeight: 600, marginBottom: 2 },
  actionRow: { color: 'var(--dsw-alias-label-secondary)' },
  actionFailed: { color: 'var(--dsw-alias-label-danger, #d5484f)' },
  proposal: {
    marginBottom: 10, padding: '9px 11px', borderRadius: 10,
    background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l1)',
    fontSize: 12, lineHeight: 1.7,
  },
  proposalTitle: { fontWeight: 600 },
  proposalReason: { color: 'var(--dsw-alias-label-tertiary)' },
  proposalPreview: {
    margin: '6px 0', padding: '7px 9px', borderRadius: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    background: 'var(--dsw-alias-bg-base)', border: '1px solid var(--dsw-alias-border-l1)',
    fontSize: 11.5, maxHeight: 180, overflowY: 'auto',
  },
  proposalActions: { display: 'flex', gap: 8, marginTop: 6 },
  composer: { flex: '0 0 auto', display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px 12px', borderTop: '1px solid var(--dsw-alias-border-l1)' },
  composerInput: { flex: 1, minWidth: 0, display: 'flex' },
  error: { margin: '0 14px 8px', fontSize: 12, color: 'var(--dsw-alias-label-danger, #d5484f)' },
  empty: { marginTop: 30, textAlign: 'center', fontSize: 12.5, color: 'var(--dsw-alias-label-tertiary)', lineHeight: 1.8 },
  caret: { display: 'inline-block', width: 7, marginLeft: 1, animation: 'rrp-copilot-blink 1s steps(2) infinite', color: 'var(--dsw-alias-brand-primary)' },
}

/** Strip the fenced rrp-action block from displayed prose: its content is
 * already rendered as a structured action card below the bubble, so showing
 * both double-renders every action (and long card proposals flood the panel). */
function withoutActionBlock(text: string): string {
  return text.replace(/```rrp-action[\s\S]*?(?:```|$)/g, '').trimEnd()
}

/** The advisory panel body. */
function CopilotPanel(props: CopilotPanelProps) {
  const t = props.t ?? ((key: string) => key)
  const sessionId = props.sessionId
  const [turns, setTurns] = useState<CopilotTurn[]>([])
  const [undoCount, setUndoCount] = useState(0)
  const [proposals, setProposals] = useState<StewardProposal[]>([])
  const [openProposals, setOpenProposals] = useState<ReadonlySet<string>>(new Set())
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [streamed, setStreamed] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Reference-stable: a new identity mid-stream discards the render cache.
  const markdownLabels = useMemo(() => ({
    code: { copyLabel: t('copilot.copyCode'), copiedLabel: t('copilot.copiedCode') },
    footnotes: '',
  }), [t])

  const load = useCallback(async () => {
    if (sessionId === undefined) return
    try {
      const response = await fetch(COPILOT_PATH + '?sessionId=' + encodeURIComponent(sessionId))
      if (!response.ok) return
      const body = await response.json() as { turns: CopilotTurn[]; undoCount: number; proposals?: StewardProposal[] }
      setTurns(body.turns)
      setUndoCount(body.undoCount)
      setProposals(body.proposals ?? [])
    } catch {
      /* history is best-effort; sending still works */
    }
  }, [sessionId])

  useEffect(() => {
    setTurns([])
    setUndoCount(0)
    setProposals([])
    setStreamed('')
    setError('')
    void load()
  }, [load])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [turns, streamed])

  const send = async (): Promise<void> => {
    const message = input.trim()
    if (message.length === 0 || busy || sessionId === undefined) return
    setInput('')
    setBusy(true)
    setStreamed('')
    setError('')
    setNotice('')
    try {
      const response = await fetch(COPILOT_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, message }),
      })
      if (!response.ok || response.body === null) {
        setError(response.status === 409 ? t('copilot.busy') : t('copilot.failed'))
        setBusy(false)
        void load()
        return
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let streamText = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        buffer = drainSse(buffer, (event, data) => {
          if (event === COPILOT_SSE.chunk && typeof (data as { text?: unknown }).text === 'string') {
            streamText += (data as { text: string }).text
            setStreamed(streamText)
          } else if (event === COPILOT_SSE.error) {
            setError(t('copilot.failed'))
          } else if (event === COPILOT_SSE.done) {
            const payload = data as { turn?: CopilotTurn; undoCount?: number }
            if (payload.turn !== undefined) {
              setTurns((current) => [...current.filter((turn) => turn.at !== payload.turn?.at), payload.turn as CopilotTurn])
            }
            if (typeof payload.undoCount === 'number') setUndoCount(payload.undoCount)
          }
        })
      }
      void load()
    } catch {
      setError(t('copilot.failed'))
      void load()
    } finally {
      setBusy(false)
      setStreamed('')
    }
  }

  const undo = async (): Promise<void> => {
    if (sessionId === undefined || undoCount === 0) return
    setNotice('')
    setError('')
    try {
      const response = await fetch(RRP_ROUTES.copilotUndo, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      if (response.ok) {
        setNotice(t('copilot.undoDone'))
        void load()
      } else {
        setError(t('copilot.undoEmpty'))
      }
    } catch {
      setError(t('copilot.failed'))
    }
  }

  const clear = async (): Promise<void> => {
    if (sessionId === undefined || busy) return
    try {
      await fetch(COPILOT_PATH + '?sessionId=' + encodeURIComponent(sessionId), { method: 'DELETE' })
      setTurns([])
      setUndoCount(0)
      setNotice(t('copilot.cleared'))
    } catch {
      setError(t('copilot.failed'))
    }
  }

  /** 确认落盘 / 丢弃（doc-note 的「已阅丢弃」走 discard）一条暂存提案。 */
  const resolveProposal = async (proposal: StewardProposal, action: 'confirm' | 'discard'): Promise<void> => {
    if (sessionId === undefined || busy) return
    setNotice('')
    setError('')
    try {
      const response = await fetch(PROPOSALS_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, action, id: proposal.id }),
      })
      const body = await response.json() as { ok?: boolean; error?: string; summary?: string; proposals?: StewardProposal[] }
      if (!response.ok || body.ok !== true) {
        setError(body.error ?? t('copilot.failed'))
        return
      }
      setProposals(body.proposals ?? [])
      setNotice(action === 'confirm' ? (body.summary ?? t('copilot.proposal.confirmed')) : t('copilot.proposal.discarded'))
    } catch {
      setError(t('copilot.failed'))
    }
  }

  const toggleProposal = (id: string): void => {
    setOpenProposals((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** One staged steward proposal: card-edit confirms to disk, doc-note is read-and-drop. */
  const proposalCard = (proposal: StewardProposal): ReactNode => {
    const title = proposal.kind === 'card-edit'
      ? t('copilot.proposal.cardEdit') + '：' + proposal.card + '/' + proposal.file
      : t('copilot.proposal.docNote') + '：' + proposal.title
    const preview = proposal.kind === 'card-edit' ? proposal.content : proposal.body
    const open = openProposals.has(proposal.id)
    return (
      <div key={proposal.id} style={S.proposal}>
        <DisclosureRow
          icon={<IconEditOutline16 />}
          title={title}
          open={open}
          expandable={true}
          onToggle={() => toggleProposal(proposal.id)}
          collapsedContent={proposal.kind === 'card-edit' && proposal.reason !== undefined ? proposal.reason : undefined}
        >
          <div style={S.proposalPreview}>{preview}</div>
        </DisclosureRow>
        {proposal.kind === 'card-edit' && proposal.reason !== undefined && open ? (
          <div style={S.proposalReason}>{proposal.reason}</div>
        ) : null}
        <div style={S.proposalActions}>
          {proposal.kind === 'card-edit' ? (
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void resolveProposal(proposal, 'confirm')}>
              {t('copilot.proposal.confirm')}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void resolveProposal(proposal, 'discard')}>
            {proposal.kind === 'card-edit' ? t('copilot.proposal.discard') : t('copilot.proposal.readDiscard')}
          </Button>
        </div>
      </div>
    )
  }

  if (sessionId === undefined) {
    return <div style={S.root}><div style={S.empty}>{t('noSession')}</div></div>
  }

  const actionCard = (turn: CopilotTurn): ReactNode => {    if (turn.actions === undefined || turn.actions.length === 0) return null
    return (
      <div style={S.actions}>
        <div style={S.actionsTitle}>{t('copilot.applied')}</div>
        {turn.actions.map((action, index) => {
          if (action.kind === 'world-state') return <div key={index} style={S.actionRow}>{action.digest}</div>
          if (action.kind === 'lore') return <div key={index} style={S.actionRow}>{t('copilot.staged') + '：' + action.name}</div>
          if (action.kind === 'proposal') return <div key={index} style={S.actionRow}>{action.label}</div>
          return <div key={index} style={S.actionFailed}>{action.error}</div>
        })}
      </div>
    )
  }

  return (
    <div style={S.root}>
      <style>{'@keyframes rrp-copilot-blink { 50% { opacity: 0 } }'}</style>
      <div style={S.header}>
        <span style={S.title}>{t('copilot.title')}</span>
        <StateDot state={busy ? 'ongoing' : 'done'} />
        <span style={S.spacer} />
        <Button size="sm" variant="ghost" disabled={undoCount === 0 || busy} onClick={() => void undo()}>
          {t('copilot.undo')}{undoCount > 0 ? ' (' + String(undoCount) + ')' : ''}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void clear()}>
          <IconTrashOutline16 />
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void load()}>
          <IconRefreshOutline16 />
        </Button>
      </div>
      <div style={S.scroll} ref={scrollRef}>
        <p style={S.hint}>{t('copilot.guide')}</p>
        {proposals.map(proposalCard)}
        {turns.length === 0 && streamed.length === 0 ? <div style={S.empty}>{t('copilot.empty')}</div> : null}
        {turns.map((turn, index) => (
          <div key={turn.at + String(index)} style={S.turn}>
            <div style={S.turnLabel}>{turn.role === 'player' ? t('copilot.you') : t('copilot.title')}</div>
            <div style={turn.role === 'player' ? S.bubblePlayer : S.bubbleCopilot}>
              {turn.role === 'player' ? turn.text : <MarkdownText text={withoutActionBlock(turn.text)} labels={markdownLabels} variant="compact" />}
            </div>
            {actionCard(turn)}
          </div>
        ))}
        {streamed.length > 0 ? (
          <div style={S.turn}>
            <div style={S.turnLabel}>{t('copilot.title')}</div>
            <div style={S.bubbleCopilot}>
              <MarkdownText text={streamed} streaming labels={markdownLabels} variant="compact" />
              <span style={S.caret}>▌</span>
            </div>
          </div>
        ) : null}
      </div>
      {error.length > 0 ? <div style={S.error}>{error}</div> : null}
      {notice.length > 0 ? <div style={{ ...S.error, color: 'var(--dsw-alias-label-tertiary)' }}>{notice}</div> : null}
      <div style={S.composer}>
        <div style={S.composerInput}>
          <Input
            value={input}
            placeholder={t('copilot.placeholder')}
            disabled={busy}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void send()
            }}
          />
        </div>
        <Button size="sm" variant="primary" disabled={busy || input.trim().length === 0} onClick={() => void send()}>
          {busy ? <IconLoadingOutline16 /> : t('copilot.send')}
        </Button>
      </div>
    </div>
  )
}

/** Register the tab type and its body; both dispose with this fiber. */
export function registerCopilotTab(ctx: RrpClientContext): void {
  const t = ctx.locale.bind('rrp') as Translate
  ctx.effect(() => {
    const disposeType = ctx.sidebarRightTabs.register({
      id: TAB_ID,
      kind: TAB_KIND,
      title: () => t('copilot.title'),
      guide: [{ order: 70, title: () => t('copilot.title'), description: () => t('copilot.guide') }],
    })
    const disposeBody = ctx.slots.register(
      { name: 'sidebar.right.pane.tab', key: TAB_ID, locale: 'rrp', inject: (sessionId: unknown) => ({ t, sessionId }) },
      CopilotPanel as never,
    )
    return () => {
      disposeBody()
      disposeType()
    }
  }, 'dsh-rrp: copilot tab')
}
