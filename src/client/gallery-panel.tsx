/**
 * dsh-rrp — the card gallery (Stage 6 / P2).
 *
 * Registered as a native main-area panel plus a matching left-sidebar nav icon
 * (research: \`main\` is keyed and \`sidebar.panellist\` list ids address the same
 * panel). Read-only over the host's card routes; "开始" creates a session,
 * selects the RP preset, then lets the HOST write the initial state and opening.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { CardMeta, CardPack } from '../card-types.ts'
import type { RrpClientContext } from './context-types.ts'

/** Panel id: the \`main\` key and the \`sidebar.panellist\` id must match. */
export const GALLERY_PANEL_ID = 'dsh-rrp/chronicle'

type Translate = (key: string) => string

/** Start outcome the panel renders. */
interface StartOutcome {
  ok: boolean
  message?: string
}

/** Props the slot framework merges: injected data plus the locale \`t\`. */
interface GalleryPanelProps {
  t?: Translate
  loadList?: () => Promise<CardMeta[]>
  loadCard?: (id: string) => Promise<CardPack | undefined>
  start?: (card: CardPack) => Promise<StartOutcome>
}

const S: Record<string, CSSProperties> = {
  root: { display: 'flex', gap: 12, padding: 16, height: '100%', boxSizing: 'border-box', overflow: 'hidden' },
  list: { flex: '0 0 240px', display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' },
  listHead: { fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardButton: { textAlign: 'left', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, lineHeight: 1.5 },
  preview: { flex: 1, minWidth: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 },
  title: { fontWeight: 600, fontSize: 16 },
  summary: { fontSize: 12, opacity: 0.75 },
  tags: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  tag: { fontSize: 11, padding: '1px 8px', borderRadius: 999, border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))' },
  section: { fontSize: 12, fontWeight: 600, marginTop: 6, opacity: 0.8 },
  body: { fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap' },
  opening: {
    fontSize: 13, lineHeight: 1.9, whiteSpace: 'pre-wrap', padding: 10, borderRadius: 8,
    border: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.25))', maxHeight: 280, overflowY: 'auto',
  },
  actions: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 },
  status: { fontSize: 12, opacity: 0.75 },
  empty: { fontSize: 13, opacity: 0.6, padding: 12 },
}

/** Small book glyph for the left-sidebar nav entry. */
function GalleryGlyph(props: { size?: number; active?: boolean }): ReactNode {
  const size = props.size ?? 20
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15.5H6.5A2.5 2.5 0 0 0 4 21V5.5Z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
        opacity={props.active === false ? 0.7 : 1}
      />
      <path d="M8 8h7M8 12h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function GalleryPanel(props: GalleryPanelProps): ReactNode {
  const t: Translate = typeof props.t === 'function' ? props.t : (key) => key
  const [cards, setCards] = useState<CardMeta[] | null>(null)
  const [selected, setSelected] = useState<CardPack | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const loadList = props.loadList
  const loadCard = props.loadCard

  const refresh = (): void => {
    if (loadList === undefined) return
    setStatus(t('gallery.loading'))
    void loadList()
      .then((list) => {
        setCards(list)
        setStatus(list.length === 0 ? t('gallery.empty') : '')
      })
      .catch((error: unknown) => setStatus(t('gallery.failed') + ': ' + String((error as { message?: string })?.message ?? error)))
  }

  useEffect(refresh, [])

  const select = (id: string): void => {
    if (loadCard === undefined) return
    setStatus(t('gallery.loading'))
    void loadCard(id)
      .then((card) => {
        setSelected(card ?? null)
        setStatus(card === undefined ? t('gallery.failed') : '')
      })
      .catch((error: unknown) => setStatus(t('gallery.failed') + ': ' + String((error as { message?: string })?.message ?? error)))
  }

  const begin = (card: CardPack): void => {
    if (props.start === undefined) return
    setBusy(true)
    setStatus(t('gallery.starting'))
    void props.start(card)
      .then((outcome) => setStatus(outcome.ok ? t('gallery.started') : t('gallery.failed') + (outcome.message === undefined ? '' : ': ' + outcome.message)))
      .catch((error: unknown) => setStatus(t('gallery.failed') + ': ' + String((error as { message?: string })?.message ?? error)))
      .finally(() => setBusy(false))
  }

  const opening = selected === null
    ? undefined
    : (selected.openings.find((entry) => entry.id === selected.meta.opening) ?? selected.openings[0])

  return (
    <div style={S.root}>
      <div style={S.list}>
        <div style={S.listHead}>
          <span>{t('gallery.title')}</span>
          <button type="button" style={{ fontSize: 11 }} onClick={refresh}>{t('gallery.reload')}</button>
        </div>
        {(cards ?? []).map((card) => (
          <button
            key={card.id}
            type="button"
            style={{ ...S.cardButton, border: selected?.id === card.id ? '1px solid var(--dsw-alias-brand-primary, #8a5a2b)' : '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.25))' }}
            onClick={() => select(card.id)}
          >
            <div>{card.name}</div>
            <div style={{ opacity: 0.65, fontSize: 11 }}>{card.summary ?? ''}</div>
          </button>
        ))}
        {cards !== null && cards.length === 0 ? <div style={S.empty}>{t('gallery.empty')}</div> : null}
      </div>

      <div style={S.preview}>
        {selected === null ? (
          <div style={S.empty}>{t('gallery.pick')}</div>
        ) : (
          <>
            <div style={S.title}>{selected.meta.name}</div>
            {selected.meta.summary === undefined ? null : <div style={S.summary}>{selected.meta.summary}</div>}
            <div style={S.tags}>
              {selected.meta.tags.map((tag) => <span key={tag} style={S.tag}>{tag}</span>)}
            </div>
            {selected.meta.player === undefined ? null : (
              <>
                <div style={S.section}>{t('gallery.player')}</div>
                <div style={S.body}>{selected.meta.player.name}
                  {selected.meta.player.description === undefined ? '' : ' — ' + selected.meta.player.description}</div>
              </>
            )}
            <div style={S.section}>{t('gallery.skills') + ' (' + String(selected.skills.length) + ')'}</div>
            <div style={S.tags}>
              {selected.skills.map((skill) => <span key={skill.id} style={S.tag}>{skill.name ?? skill.id}</span>)}
            </div>
            {opening === undefined ? null : (
              <>
                <div style={S.section}>{t('gallery.opening')}</div>
                <div style={S.opening}>{opening.body}</div>
              </>
            )}
            <div style={S.actions}>
              <button type="button" disabled={busy} onClick={() => begin(selected)}>{t('gallery.start')}</button>
              <span style={S.status}>{status}</span>
            </div>
          </>
        )}
        {selected === null ? <span style={S.status}>{status}</span> : null}
      </div>
    </div>
  )
}

/**
 * Register the gallery panel, its left-nav entry, and the start flow.
 * @param ctx - the client context owning the registration.
 */
export function registerGallery(ctx: RrpClientContext): void {
  const t = ctx.locale.bind('rrp') as Translate

  const loadList = async (): Promise<CardMeta[]> => {
    const response = await fetch('/dsh-rrp/cards')
    if (!response.ok) throw new Error(String(response.status))
    const body = await response.json() as { cards: CardMeta[] }
    return body.cards
  }

  const loadCard = async (id: string): Promise<CardPack | undefined> => {
    const response = await fetch('/dsh-rrp/cards/one?id=' + encodeURIComponent(id))
    if (!response.ok) return undefined
    const body = await response.json() as { card: CardPack }
    return body.card
  }

  const start = async (card: CardPack): Promise<StartOutcome> => {
    const sessions = ctx.sessions
    const remote = ctx.remote
    if (sessions === undefined || remote === undefined) return { ok: false, message: t('gallery.unavailable') }
    const sessionId = await sessions.create({})
    const selected = await remote.agentPresets.select(sessionId, 'rp')
    if (selected.ok === false) return { ok: false, message: selected.error?.message ?? 'agentPresets.select failed' }
    sessions.open(sessionId)
    const opening = (card.openings.find((entry) => entry.id === card.meta.opening) ?? card.openings[0])?.body
    const response = await fetch('/dsh-rrp/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, state: card.initialState, opening }),
    })
    if (!response.ok) return { ok: false, message: await response.text() }
    ctx.layout?.selectPanel(null)
    return { ok: true }
  }

  ctx.effect(() => {
    const disposeMain = ctx.slots.inject('main', () => ctx.slots.register(
      { name: 'main', key: GALLERY_PANEL_ID, locale: 'rrp', inject: () => ({ t, loadList, loadCard, start }) },
      GalleryPanel as never,
    ))
    const disposeNav = ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
      { name: 'sidebar.panellist', id: GALLERY_PANEL_ID, order: 40, label: () => t('gallery.title') },
      GalleryGlyph as never,
    ))
    return () => {
      disposeMain()
      disposeNav()
    }
  }, 'dsh-rrp: card gallery')
}
