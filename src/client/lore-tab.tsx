/**
 * dsh-rrp — the 「设定集」 right-sidebar tab (D8).
 *
 * Player-facing control surface for knowledge lore: trigger a Scribe
 * draft, review it, confirm or discard, and delete what is already written.
 * Reads/writes the host routes; the panel never touches the session log.
 *
 * Data flow is PUSH-first (HOST_ALIGNMENT: no self-invented polling):
 *   - written skills arrive through the host-pushed `rrpSediment` projection
 *     (`useProjection`), the same wire the skill provider reads;
 *   - the Scribe's in-flight state is derived from the host-pushed jobs
 *     mirror (`useSessions` → `jobsBySession`); when it settles, one one-shot
 *     GET picks up the staged draft;
 *   - the 2s timer survives ONLY as a fallback for hosts where the jobs
 *     mirror is not injected into this seat.
 */
import {
  Button,
  IconCheckOutline16,
  IconLoadingOutline16,
  IconPlusOutline16,
  IconSparkle16,
  IconTrashOutline16,
  Input,
  Pill,
  StateDot,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { RRP_LORE_KEY, type LoreEntry } from '../lore-state.ts'
import type { RrpClientContext, RrpJobView, RrpUseProjection, RrpUseSessions } from './context-types.ts'

/** Implementation identity; also the key the body registers under. */
const TAB_ID = 'dsh-rrp/lore'
/** Type discriminator openTab names. */
const TAB_KIND = 'dsh-rrp-lore'
/** Host routes driving the controlled flow. */
const LORE_PATH = '/dsh-rrp/lore'
/** Fallback poll interval, only used when the host jobs mirror is unavailable. */
const POLL_MS = 2000

type Translate = (key: string) => string

/** One written skill (structural copy of the host's list entry). */
interface SedSkill {
  name: string
  description: string
  bytes: number
  updatedAt: string
}
/** One staged draft. */
interface SedDraft {
  name: string
  description: string
  body: string
}
/** The list response. */
interface SedList {
  skills: SedSkill[]
  pending: SedDraft | null
  drafting: boolean
  /** Card conditional-injection triggers (issue #16); absent on old hosts. */
  triggers?: Array<{ name: string; active: boolean }>
  injectedChars?: number
}

/** Props the slot framework merges. */
interface LorePanelProps {
  t?: Translate
  sessionId?: string
  useProjection?: RrpUseProjection
  useSessions?: RrpUseSessions
}

const byteLengthOf = (text: string): number => new TextEncoder().encode(text).length

/** Host-pushed projection rows → panel rows (same shape the route used to send). */
function skillRows(entries: readonly LoreEntry[]): SedSkill[] {
  return entries.map((entry) => ({
    name: entry.name,
    description: entry.description,
    bytes: byteLengthOf(entry.body),
    updatedAt: '',
  }))
}

const S: Record<string, CSSProperties> = {
  root: { height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)' },
  header: { flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 10px', borderBottom: '1px solid var(--dsw-alias-border-l1)' },
  title: { fontSize: 14, fontWeight: 600 },
  spacer: { flex: 1 },
  scroll: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 14px 20px' },
  hint: { margin: '0 0 10px', fontSize: 11.5, lineHeight: 1.6, color: 'var(--dsw-alias-label-tertiary)' },
  drain: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 },
  drainInput: { flex: 1, minWidth: 0, display: 'flex' },
  section: { display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 8px' },
  sectionTitle: { fontSize: 12.5, fontWeight: 600 },
  draft: {
    display: 'flex', flexDirection: 'column', gap: 8, padding: '11px', marginBottom: 10,
    borderRadius: 10, background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-brand-primary)',
  },
  draftHead: { display: 'flex', alignItems: 'center', gap: 8 },
  draftName: { fontSize: 13, fontWeight: 600 },
  draftDesc: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.55 },
  draftBody: {
    fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 220, overflowY: 'auto',
    padding: '8px 10px', borderRadius: 8, background: 'var(--dsw-alias-bg-base)',
    border: '1px solid var(--dsw-alias-border-l1)', color: 'var(--dsw-alias-label-secondary)',
  },
  draftActions: { display: 'flex', gap: 8, alignItems: 'center' },
  card: {
    display: 'flex', flexDirection: 'column', gap: 4, padding: '9px 11px', marginBottom: 8,
    borderRadius: 10, background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
  },
  cardHead: { display: 'flex', alignItems: 'center', gap: 8 },
  cardName: { fontSize: 12.5, fontWeight: 600, flex: 1, minWidth: 0 },
  cardDesc: { fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary)', lineHeight: 1.5 },
  cardMeta: { fontSize: 11, color: 'var(--dsw-alias-label-dimmed)' },
  empty: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', padding: '12px 4px', textAlign: 'center' },
  status: { fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary)', minWidth: 0, lineHeight: 1.4 },
}

function LorePanel(props: LorePanelProps): ReactNode {
  const t: Translate = typeof props.t === 'function' ? props.t : (key) => key
  const sessionId = props.sessionId
  // Push-first data sources (absent on hosts that do not inject them into this seat).
  const projected = typeof props.useProjection === 'function'
    ? props.useProjection(RRP_LORE_KEY) as LoreEntry[] | undefined
    : undefined
  const scribeJobs = typeof props.useSessions === 'function' && sessionId !== undefined
    ? props.useSessions((state) => state.jobsBySession[sessionId]) as readonly RrpJobView[] | undefined
    : undefined
  const scribeRunning = scribeJobs?.some((job) =>
    job.kind === 'scribe' && (job.status === 'running' || job.status === 'stopping'))

  // The staged draft is host-side bookkeeping (never eventized), so it still
  // travels over the route — but only as one-shot fetches, not a timer.
  const [fetched, setFetched] = useState<SedList | undefined>(undefined)
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const skills = projected !== undefined ? skillRows(projected) : fetched?.skills ?? []
  const pending = fetched?.pending ?? null
  const drafting = scribeRunning ?? fetched?.drafting ?? false
  const triggers = fetched?.triggers ?? []

  const refresh = (): void => {
    if (sessionId === undefined) return
    void fetch(LORE_PATH + '?sessionId=' + encodeURIComponent(sessionId))
      .then((response) => (response.ok ? response.json() as Promise<SedList> : undefined))
      .then((body) => { if (body !== undefined) setFetched(body) })
      .catch(() => { /* best-effort */ })
  }

  // Initial load; the fallback timer runs only without the jobs mirror.
  useEffect(() => {
    if (sessionId === undefined) {
      setFetched(undefined)
      return
    }
    refresh()
    if (typeof props.useSessions === 'function') return
    const timer = setInterval(refresh, POLL_MS)
    return () => { clearInterval(timer) }
  }, [sessionId, props.useSessions])

  // Scribe settled → one one-shot fetch picks up the staged draft.
  const wasScribeRunning = useRef(false)
  useEffect(() => {
    if (scribeRunning === true) {
      wasScribeRunning.current = true
      return
    }
    if (wasScribeRunning.current) {
      wasScribeRunning.current = false
      refresh()
    }
  }, [scribeRunning])

  const post = (body: Record<string, unknown>, done: string): void => {
    if (sessionId === undefined) return
    setBusy(true)
    void fetch(LORE_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, ...body }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { error?: string; drafting?: boolean }
        if (!response.ok) throw new Error(payload.error ?? String(response.status))
        if (payload.drafting === true) setFetched((current) => current === undefined ? current : { ...current, drafting: true })
        else setStatus(done)
      })
      .catch((error: unknown) => setStatus(t('lore.failed') + ': ' + String((error as { message?: string })?.message ?? error)))
      .finally(() => setBusy(false))
  }

  const remove = (name: string): void => {
    if (sessionId === undefined) return
    setBusy(true)
    void fetch(LORE_PATH + '?sessionId=' + encodeURIComponent(sessionId) + '&name=' + encodeURIComponent(name), { method: 'DELETE' })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        refresh()
        setStatus(t('lore.removed'))
      })
      .catch((error: unknown) => setStatus(t('lore.failed') + ': ' + String((error as { message?: string })?.message ?? error)))
      .finally(() => setBusy(false))
  }

  return (
    <div className="dsh-rrp-lore" style={S.root}>
      <div style={S.header}>
        <span style={S.title}>{t('lore.title')}</span>
        <Pill>{String(skills.length)}</Pill>
      </div>

      <div style={S.scroll}>
        <p style={S.hint}>{t('lore.guide')}</p>

        <div style={S.drain}>
          <span style={S.drainInput}>
            <Input
              placeholder={t('lore.topicPlaceholder')}
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
            />
          </span>
          <Button
            variant="primary"
            icon={drafting ? <IconLoadingOutline16 size={16} /> : <IconSparkle16 size={16} />}
            disabled={busy || drafting}
            onClick={() => { setStatus(''); post({ action: 'draft', topic }, t('lore.staged')) }}
          >
            {drafting ? t('lore.drafting') : t('lore.draft')}
          </Button>
        </div>

        {pending === null ? null : (
          <div style={S.draft}>
            <div style={S.draftHead}>
              <StateDot state="warning" />
              <span style={S.draftName}>{pending.name}</span>
              <span style={S.spacer} />
            </div>
            <div style={S.draftDesc}>{pending.description}</div>
            <div style={S.draftBody}>{pending.body}</div>
            <div style={S.draftActions}>
              <Button
                variant="primary"
                size="sm"
                icon={<IconCheckOutline16 size={16} />}
                disabled={busy}
                onClick={() => { setStatus(''); post({ action: 'confirm' }, t('lore.written')) }}
              >
                {t('lore.confirm')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => { setStatus(''); post({ action: 'discard' }, t('lore.discarded')) }}
              >
                {t('lore.discard')}
              </Button>
              <span style={S.status}>{t('lore.confirmHint')}</span>
            </div>
          </div>
        )}

        <div style={S.section}>
          <span style={S.sectionTitle}>{t('lore.written')}</span>
          <Pill>{String(skills.length)}</Pill>
        </div>
        {skills.length === 0 ? <div style={S.empty}>{t('lore.empty')}</div> : null}
        {skills.map((skill) => (
          <div key={skill.name} style={S.card}>
            <div style={S.cardHead}>
              <span style={S.cardName}>{skill.name}</span>
              <Pill>{skill.bytes >= 1024 ? String(Math.round(skill.bytes / 1024)) + ' KB' : String(skill.bytes) + ' B'}</Pill>
              <Tooltip label={t('lore.delete')}>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<IconTrashOutline16 size={16} />}
                  aria-label={t('lore.delete')}
                  disabled={busy}
                  onClick={() => remove(skill.name)}
                />
              </Tooltip>
            </div>
            {skill.description.length === 0 ? null : <div style={S.cardDesc}>{skill.description}</div>}
          </div>
        ))}

        <div style={{ ...S.section, marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--dsw-alias-border-l1)' }}>
          <span style={S.sectionTitle}>{t('lore.triggers')}</span>
          <Pill>{String(triggers.length)}</Pill>
        </div>
        {triggers.length === 0 ? <div style={S.empty}>{t('lore.triggersEmpty')}</div> : null}
        {triggers.map((trigger) => (
          <div key={trigger.name} style={S.card}>
            <div style={S.cardHead}>
              <StateDot state={trigger.active ? 'done' : 'warning'} />
              <span style={S.cardName}>{trigger.name}</span>
              <Pill active={trigger.active}>{trigger.active ? t('lore.triggerActive') : t('lore.triggerInactive')}</Pill>
            </div>
          </div>
        ))}

        {status.length === 0 ? null : <div style={{ ...S.status, marginTop: 10 }}>{status}</div>}
        {pending === null && !drafting && status.length === 0 ? (
          <div style={{ ...S.cardMeta, marginTop: 10 }}>{t('lore.noDraft')}</div>
        ) : null}
      </div>
    </div>
  )
}

/** Register the tab type and its body; both dispose with this fiber. */
export function registerLoreTab(ctx: RrpClientContext): void {
  const t = ctx.locale.bind('rrp') as Translate
  ctx.effect(() => {
    const disposeType = ctx.sidebarRightTabs.register({
      id: TAB_ID,
      kind: TAB_KIND,
      title: () => t('lore.title'),
      guide: [{ order: 60, title: () => t('lore.title'), description: () => t('lore.guide') }],
    })
    const disposeBody = ctx.slots.register(
      { name: 'sidebar.right.pane.tab', key: TAB_ID, locale: 'rrp', inject: (sessionId: unknown) => ({ t, sessionId }) },
      LorePanel as never,
    )
    return () => {
      disposeBody()
      disposeType()
    }
  }, 'dsh-rrp: lore tab')
}
