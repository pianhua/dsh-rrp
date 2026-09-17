/**
 * dsh-rrp — the 「典籍」 right-sidebar tab (D8).
 *
 * Player-facing control surface for knowledge sedimentation: trigger a Scribe
 * draft, review it, confirm or discard, and delete what is already written.
 * Reads/writes the host routes; the panel never touches the session log.
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
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { RrpClientContext } from './context-types.ts'

/** Implementation identity; also the key the body registers under. */
const TAB_ID = 'dsh-rrp/sediment'
/** Type discriminator openTab names. */
const TAB_KIND = 'dsh-rrp-sediment'
/** Host routes driving the controlled flow. */
const SEDIMENT_PATH = '/dsh-rrp/sediment'
/** The draft lives on the host; a slow poll picks it up when the job settles. */
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
}

/** Props the slot framework merges. */
interface SedimentPanelProps {
  t?: Translate
  sessionId?: string
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

function SedimentPanel(props: SedimentPanelProps): ReactNode {
  const t: Translate = typeof props.t === 'function' ? props.t : (key) => key
  const sessionId = props.sessionId
  const [skills, setSkills] = useState<SedSkill[]>([])
  const [pending, setPending] = useState<SedDraft | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  // Poll while mounted: the Scribe runs host-side, so the draft appears when it
  // settles; writes made elsewhere also show up.
  useEffect(() => {
    if (sessionId === undefined) {
      setSkills([]); setPending(null); setDrafting(false)
      return
    }
    let cancelled = false
    const load = (): void => {
      void fetch(SEDIMENT_PATH + '?sessionId=' + encodeURIComponent(sessionId))
        .then((response) => (response.ok ? response.json() as Promise<SedList> : undefined))
        .then((body) => {
          if (cancelled || body === undefined) return
          setSkills(body.skills ?? [])
          setPending(body.pending ?? null)
          setDrafting(body.drafting === true)
        })
        .catch(() => { /* best-effort */ })
    }
    load()
    const timer = setInterval(load, POLL_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [sessionId])

  const post = (body: Record<string, unknown>, done: string): void => {
    if (sessionId === undefined) return
    setBusy(true)
    void fetch(SEDIMENT_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, ...body }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { error?: string; drafting?: boolean }
        if (!response.ok) throw new Error(payload.error ?? String(response.status))
        if (payload.drafting === true) setDrafting(true)
        else setStatus(done)
      })
      .catch((error: unknown) => setStatus(t('sediment.failed') + ': ' + String((error as { message?: string })?.message ?? error)))
      .finally(() => setBusy(false))
  }

  const remove = (name: string): void => {
    if (sessionId === undefined) return
    setBusy(true)
    void fetch(SEDIMENT_PATH + '?sessionId=' + encodeURIComponent(sessionId) + '&name=' + encodeURIComponent(name), { method: 'DELETE' })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        setSkills((current) => current.filter((skill) => skill.name !== name))
        setStatus(t('sediment.removed'))
      })
      .catch((error: unknown) => setStatus(t('sediment.failed') + ': ' + String((error as { message?: string })?.message ?? error)))
      .finally(() => setBusy(false))
  }

  return (
    <div className="dsh-rrp-sediment" style={S.root}>
      <div style={S.header}>
        <span style={S.title}>{t('sediment.title')}</span>
        <Pill>{String(skills.length)}</Pill>
      </div>

      <div style={S.scroll}>
        <p style={S.hint}>{t('sediment.guide')}</p>

        <div style={S.drain}>
          <span style={S.drainInput}>
            <Input
              placeholder={t('sediment.topicPlaceholder')}
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
            />
          </span>
          <Button
            variant="primary"
            icon={drafting ? <IconLoadingOutline16 size={16} /> : <IconSparkle16 size={16} />}
            disabled={busy || drafting}
            onClick={() => { setStatus(''); post({ action: 'draft', topic }, t('sediment.staged')) }}
          >
            {drafting ? t('sediment.drafting') : t('sediment.draft')}
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
                onClick={() => { setStatus(''); post({ action: 'confirm' }, t('sediment.written')) }}
              >
                {t('sediment.confirm')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => { setStatus(''); post({ action: 'discard' }, t('sediment.discarded')) }}
              >
                {t('sediment.discard')}
              </Button>
              <span style={S.status}>{t('sediment.confirmHint')}</span>
            </div>
          </div>
        )}

        <div style={S.section}>
          <span style={S.sectionTitle}>{t('sediment.written')}</span>
          <Pill>{String(skills.length)}</Pill>
        </div>
        {skills.length === 0 ? <div style={S.empty}>{t('sediment.empty')}</div> : null}
        {skills.map((skill) => (
          <div key={skill.name} style={S.card}>
            <div style={S.cardHead}>
              <span style={S.cardName}>{skill.name}</span>
              <Pill>{String(Math.max(1, Math.round(skill.bytes / 1024))) + ' KB'}</Pill>
              <Tooltip label={t('sediment.delete')}>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<IconTrashOutline16 size={16} />}
                  aria-label={t('sediment.delete')}
                  disabled={busy}
                  onClick={() => remove(skill.name)}
                />
              </Tooltip>
            </div>
            {skill.description.length === 0 ? null : <div style={S.cardDesc}>{skill.description}</div>}
          </div>
        ))}

        {status.length === 0 ? null : <div style={{ ...S.status, marginTop: 10 }}>{status}</div>}
        {pending === null && !drafting && status.length === 0 ? (
          <div style={{ ...S.cardMeta, marginTop: 10 }}>{t('sediment.noDraft')}</div>
        ) : null}
      </div>
    </div>
  )
}

/** Register the tab type and its body; both dispose with this fiber. */
export function registerSedimentTab(ctx: RrpClientContext): void {
  const t = ctx.locale.bind('rrp') as Translate
  ctx.effect(() => {
    const disposeType = ctx.sidebarRightTabs.register({
      id: TAB_ID,
      kind: TAB_KIND,
      title: () => t('sediment.title'),
      guide: [{ order: 60, title: () => t('sediment.title'), description: () => t('sediment.guide') }],
    })
    const disposeBody = ctx.slots.register(
      { name: 'sidebar.right.pane.tab', key: TAB_ID, locale: 'rrp', inject: (sessionId: unknown) => ({ t, sessionId }) },
      SedimentPanel,
    )
    return () => {
      disposeBody()
      disposeType()
    }
  }, 'dsh-rrp: sediment tab')
}
