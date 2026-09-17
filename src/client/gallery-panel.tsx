/**
 * dsh-rrp — the card gallery (Stage 6 / P2).
 *
 * Registered as a native main-area panel plus a matching left-sidebar nav icon
 * (research: \`main\` is keyed and \`sidebar.panellist\` list ids address the same
 * panel). Read-only over the host's card routes; "开始" creates a session,
 * selects the RP preset, then lets the HOST write the initial state and opening.
 *
 * Visuals are built from the host's own atom library
 * (\`@deepseek-ai/dsh-client-ui-primitives\`, a platform module) plus
 * \`--dsw-alias-*\` tokens, so the panel reads as part of DSH in both light and
 * dark mode rather than as a bespoke page.
 */
import {
  Button,
  IconArchiveOutline20,
  IconLoadingOutline16,
  IconPlayOutline16,
  IconRefreshOutline16,
  IconSearchOutline16,
  IconSkillOutline16,
  IconUserOutline16,
  Input,
  Pill,
  StateDot,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { CardMeta, CardPack } from '../card-types.ts'
import { presetIdForCard } from '../preset-id.ts'
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

/** Small status line state. */
type Tone = 'idle' | 'busy' | 'ok' | 'error'
interface Status {
  tone: Tone
  text: string
}

const DOT: Record<Tone, 'done' | 'warning' | 'ongoing' | 'error' | null> = {
  idle: null,
  busy: 'ongoing',
  ok: 'done',
  error: 'error',
}

/**
 * Deterministic cover gradient for a card id.
 * The hue is derived from the id, so a card keeps the same cover everywhere.
 * @param seed - stable card id.
 * @returns a CSS background value.
 */
function coverGradient(seed: string): string {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }
  const hue = hash % 360
  return 'linear-gradient(140deg, hsl(' + String(hue) + ' 42% 62%), hsl(' + String((hue + 40) % 360) + ' 40% 42%))'
}

/** One square/rounded card cover with the card's initial. */
function Cover(props: { seed: string; label: string; size: number }): ReactNode {
  const initial = props.label.trim().slice(0, 1) || '◆'
  return (
    <span
      aria-hidden="true"
      style={{
        ...S.cover,
        width: props.size,
        height: props.size,
        borderRadius: Math.round(props.size * 0.3),
        background: coverGradient(props.seed),
        fontSize: Math.round(props.size * 0.42),
      }}
    >
      {initial}
    </span>
  )
}

/** One placeholder row shown while the list loads. */
function SkeletonRow(): ReactNode {
  return (
    <div style={S.skeletonRow}>
      <span style={{ ...S.skeleton, width: 38, height: 38, borderRadius: 11 }} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
        <span style={{ ...S.skeleton, width: '58%', height: 11 }} />
        <span style={{ ...S.skeleton, width: '82%', height: 9 }} />
      </span>
    </div>
  )
}

function GalleryPanel(props: GalleryPanelProps): ReactNode {
  const t: Translate = typeof props.t === 'function' ? props.t : (key) => key
  const [cards, setCards] = useState<CardMeta[] | null>(null)
  const [selected, setSelected] = useState<CardPack | null>(null)
  const [status, setStatus] = useState<Status>({ tone: 'idle', text: '' })
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')

  const loadList = props.loadList
  const loadCard = props.loadCard

  const select = (id: string): void => {
    if (loadCard === undefined) return
    setStatus({ tone: 'busy', text: t('gallery.loading') })
    void loadCard(id)
      .then((card) => {
        setSelected(card ?? null)
        setStatus(card === undefined ? { tone: 'error', text: t('gallery.failed') } : { tone: 'idle', text: '' })
      })
      .catch((error: unknown) => {
        setStatus({ tone: 'error', text: t('gallery.failed') + ': ' + String((error as { message?: string })?.message ?? error) })
      })
  }

  const refresh = (): void => {
    if (loadList === undefined) return
    setStatus({ tone: 'busy', text: t('gallery.loading') })
    void loadList()
      .then((list) => {
        setCards(list)
        setStatus(list.length === 0 ? { tone: 'idle', text: t('gallery.empty') } : { tone: 'idle', text: '' })
        if (list.length > 0) select(list[0]!.id)
      })
      .catch((error: unknown) => {
        setStatus({ tone: 'error', text: t('gallery.failed') + ': ' + String((error as { message?: string })?.message ?? error) })
      })
  }

  useEffect(refresh, [])

  const begin = (card: CardPack): void => {
    if (props.start === undefined) return
    setBusy(true)
    setStatus({ tone: 'busy', text: t('gallery.starting') })
    void props.start(card)
      .then((outcome) => {
        setStatus(outcome.ok
          ? { tone: 'ok', text: t('gallery.started') }
          : { tone: 'error', text: t('gallery.failed') + (outcome.message === undefined ? '' : ': ' + outcome.message) })
      })
      .catch((error: unknown) => {
        setStatus({ tone: 'error', text: t('gallery.failed') + ': ' + String((error as { message?: string })?.message ?? error) })
      })
      .finally(() => setBusy(false))
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = cards ?? []
    if (needle.length === 0) return list
    return list.filter((card) => {
      const haystack = card.name + ' ' + (card.summary ?? '') + ' ' + card.tags.join(' ')
      return haystack.toLowerCase().includes(needle)
    })
  }, [cards, query])

  const opening = selected === null
    ? undefined
    : (selected.openings.find((entry) => entry.id === selected.meta.opening) ?? selected.openings[0])

  const dot = DOT[status.tone]

  return (
    <div style={S.root}>
      <header style={S.header}>
        <span style={S.brand}>
          <span style={S.brandIcon}><IconArchiveOutline20 size={18} /></span>
          <span style={S.brandText}>{t('gallery.title')}</span>
        </span>
        {cards === null ? null : <Pill>{String(cards.length)}</Pill>}
        <span style={S.headerSpacer} />
        <span style={S.search}>
          <Input
            icon={<IconSearchOutline16 size={16} />}
            placeholder={t('gallery.search')}
            value={query}
            onChange={(event) => { setQuery(event.target.value) }}
          />
        </span>
        <Tooltip label={t('gallery.reload')}>
          <Button variant="ghost" size="sm" icon={<IconRefreshOutline16 size={16} />} onClick={refresh} aria-label={t('gallery.reload')} />
        </Tooltip>
      </header>

      <div style={S.body}>
        <nav style={S.list} aria-label={t('gallery.title')}>
          {cards === null ? <><SkeletonRow /><SkeletonRow /><SkeletonRow /></> : null}
          {cards !== null && filtered.length === 0
            ? <div style={S.listEmpty}>{cards.length === 0 ? t('gallery.empty') : t('gallery.nomatch')}</div>
            : null}
          {filtered.map((card) => {
            const active = selected?.id === card.id
            return (
              <button
                key={card.id}
                type="button"
                style={{ ...S.row, ...(active ? S.rowActive : {}) }}
                onClick={() => select(card.id)}
                aria-current={active || undefined}
              >
                <Cover seed={card.id} label={card.name} size={38} />
                <span style={S.rowText}>
                  <span style={S.rowName}>{card.name}</span>
                  <span style={S.rowSummary}>{card.summary ?? ''}</span>
                </span>
              </button>
            )
          })}
        </nav>

        <section style={S.preview}>
          {selected === null ? (
            <div style={S.placeholder}>
              <span style={S.placeholderIcon}><IconArchiveOutline20 size={30} /></span>
              <div style={S.placeholderText}>{t('gallery.pick')}</div>
            </div>
          ) : (
            <div style={S.detail}>
              <div style={S.scroll}>
                <div style={S.hero}>
                  <Cover seed={selected.id} label={selected.meta.name} size={76} />
                  <div style={S.heroText}>
                    <h2 style={S.heroTitle}>{selected.meta.name}</h2>
                    {selected.meta.summary === undefined ? null : <p style={S.heroSummary}>{selected.meta.summary}</p>}
                    {selected.meta.tags.length === 0 ? null : (
                      <div style={S.tags}>
                        {selected.meta.tags.map((tag) => <Pill key={tag}>{tag}</Pill>)}
                      </div>
                    )}
                  </div>
                </div>

                {selected.meta.player === undefined ? null : (
                  <div style={S.fact}>
                    <span style={S.factIcon}><IconUserOutline16 size={16} /></span>
                    <span style={S.factLabel}>{t('gallery.player')}</span>
                    <span style={S.factValue}>
                      {selected.meta.player.name}
                      {selected.meta.player.description === undefined ? '' : ' · ' + selected.meta.player.description}
                    </span>
                  </div>
                )}

                <div style={S.section}>
                  <span style={S.sectionIcon}><IconSkillOutline16 size={16} /></span>
                  <span style={S.sectionTitle}>{t('gallery.skills')}</span>
                  <Pill>{String(selected.skills.length)}</Pill>
                </div>
                <div style={S.skillList}>
                  {selected.skills.map((skill) => (
                    <span key={skill.id} style={S.skillChip}>
                      <span style={S.skillName}>{skill.name ?? skill.id}</span>
                      {skill.description === undefined ? null : <span style={S.skillDesc}>{skill.description}</span>}
                    </span>
                  ))}
                </div>

                {opening === undefined ? null : (
                  <>
                    <div style={S.section}>
                      <span style={S.sectionTitle}>{t('gallery.opening')}</span>
                    </div>
                    <blockquote style={S.opening}>{opening.body}</blockquote>
                  </>
                )}
              </div>

              <footer style={S.actionBar}>
                <span style={S.status}>
                  {dot === null ? null : <StateDot state={dot} />}
                  <span>{status.text}</span>
                </span>
                <Button
                  variant="primary"
                  icon={busy ? <IconLoadingOutline16 size={16} /> : <IconPlayOutline16 size={16} />}
                  disabled={busy}
                  onClick={() => begin(selected)}
                >
                  {busy ? t('gallery.starting') : t('gallery.start')}
                </Button>
              </footer>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

const S: Record<string, CSSProperties> = {
  root: { height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)' },
  header: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px',
    borderBottom: '1px solid var(--dsw-alias-border-l1)', flex: '0 0 auto',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 8 },
  brandIcon: { display: 'inline-flex', color: 'var(--dsw-alias-label-secondary)' },
  brandText: { fontSize: 14, fontWeight: 600 },
  headerSpacer: { flex: 1 },
  search: { width: 220, display: 'flex' },
  body: { flex: 1, minHeight: 0, display: 'flex' },
  list: {
    flex: '0 0 272px', display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 10px 18px',
    overflowY: 'auto', borderRight: '1px solid var(--dsw-alias-border-l1)',
  },
  listEmpty: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', padding: '16px 8px', textAlign: 'center' },
  row: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10,
    border: '1px solid transparent', background: 'transparent', cursor: 'pointer',
    textAlign: 'left', font: 'inherit', color: 'inherit', width: '100%',
  },
  rowActive: {
    background: 'var(--dsw-alias-interactive-bg-hover)',
    borderColor: 'var(--dsw-alias-border-l2)',
  },
  cover: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontWeight: 600, letterSpacing: '0.02em', flex: '0 0 auto',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
  },
  rowText: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 },
  rowName: { fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowSummary: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  skeletonRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px' },
  skeleton: { background: 'var(--dsw-alias-bg-skeleton)', borderRadius: 6, display: 'inline-block' },
  preview: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' },
  placeholder: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 12, color: 'var(--dsw-alias-label-tertiary)',
  },
  placeholderIcon: { display: 'inline-flex', opacity: 0.5 },
  placeholderText: { fontSize: 13, maxWidth: 280, textAlign: 'center', lineHeight: 1.6 },
  detail: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' },
  scroll: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '22px 24px 28px' },
  hero: { display: 'flex', gap: 16, alignItems: 'flex-start' },
  heroText: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, paddingTop: 2 },
  heroTitle: { margin: 0, fontSize: 20, fontWeight: 600, lineHeight: 1.35 },
  heroSummary: { margin: 0, fontSize: 13, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.6, maxWidth: 560 },
  tags: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  fact: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, fontSize: 13 },
  factIcon: { display: 'inline-flex', color: 'var(--dsw-alias-label-tertiary)' },
  factLabel: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, flex: '0 0 auto' },
  factValue: { color: 'var(--dsw-alias-label-primary)', minWidth: 0 },
  section: { display: 'flex', alignItems: 'center', gap: 8, margin: '22px 0 10px' },
  sectionIcon: { display: 'inline-flex', color: 'var(--dsw-alias-label-tertiary)' },
  sectionTitle: { fontSize: 13, fontWeight: 600 },
  skillList: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  skillChip: {
    display: 'inline-flex', flexDirection: 'column', gap: 2, padding: '7px 11px', borderRadius: 10,
    background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)',
    maxWidth: 240,
  },
  skillName: { fontSize: 12, fontWeight: 600 },
  skillDesc: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', lineHeight: 1.45 },
  opening: {
    margin: 0, padding: '14px 16px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.9,
    whiteSpace: 'pre-wrap', background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
    borderLeft: '3px solid var(--dsw-alias-brand-primary)',
    color: 'var(--dsw-alias-label-secondary)',
  },
  actionBar: {
    flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px',
    borderTop: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-base)',
  },
  status: { flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', minWidth: 0 },
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
    // Each card gets its own scoped preset (rp-<card-id>) so only this card's
    // world-knowledge skills are in the session's skill scope.
    const selected = await remote.agentPresets.select(sessionId, presetIdForCard(card.id))
    if (selected.ok === false) return { ok: false, message: selected.error?.message ?? 'agentPresets.select failed' }

    // The card name is the story's name; a rename is a nicety, never fatal.
    const binding = sessions.binding(sessionId)
    if (binding !== undefined) {
      try {
        await binding.session.rename?.(card.meta.name)
      } catch {
        /* title only */
      }
    }

    const opening = (card.openings.find((entry) => entry.id === card.meta.opening) ?? card.openings[0])?.body
    const response = await fetch('/dsh-rrp/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        state: card.initialState,
        opening,
        card: {
          id: card.id,
          name: card.meta.name,
          persona: card.persona,
          worldCore: card.worldCore,
          player: card.meta.player,
        },
      }),
    })
    if (!response.ok) return { ok: false, message: await response.text() }
    // Stage the session only AFTER the log is complete: the conversation view
    // then pulls the whole history (card context + facts + opening) in one go,
    // instead of racing the host's live follow stream for the opening.
    sessions.open(sessionId)
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
