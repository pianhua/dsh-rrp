/**
 * dsh-rrp — the card gallery.
 *
 * The gallery is a native card wall: cover-first browsing in the main area,
 * with the selected card's details sliding in from the right. Starting a story
 * still goes through the host session, preset, workspace, and start routes.
 */
import {
  Button,
  IconArchiveOutlineMedium,
  IconLoadingOutlineRegular,
  IconPlayOutlineRegular,
  IconRefreshOutlineRegular,
  IconSearchOutlineRegular,
  IconSkillOutlineRegular,
  IconUserOutlineRegular,
  Input,
  Pill,
  StateDot,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  interpolateCardText,
  type CardMeta,
  type CardOpening,
  type CardPackPlayerView,
} from '../card-types.ts'
import { presetIdForCard } from '../preset-id.ts'
import {
  RRP_ROUTES,
  type CardImportResponse,
  type CardListResponse,
  type CardOneResponse,
  type RrpErrorBody,
} from '../route-contract.ts'
import { uniqueMainTitle } from '../save-naming.ts'
import type { RrpClientContext } from './context-types.ts'

/** Panel id: the `main` key and the `sidebar.panellist` id must match. */
export const GALLERY_PANEL_ID = 'dsh-rrp/chronicle'

type Translate = (key: string) => string

interface GalleryStartResult {
  ok: boolean
  message?: string
}

export interface GalleryPanelProps {
  t?: Translate
  loadList?: () => Promise<CardMeta[]>
  loadCard?: (id: string) => Promise<CardPackPlayerView | undefined>
  start?: (card: CardPackPlayerView, openingId?: string) => Promise<GalleryStartResult>
}

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

function coverGradient(seed: string): string {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }
  const hue = hash % 360
  return `linear-gradient(145deg, hsl(${String(hue)} 50% 58%), hsl(${String((hue + 42) % 360)} 42% 34%))`
}

function coverUrl(id: string, cover: string | undefined): string | undefined {
  if (cover === undefined || cover.length === 0) return undefined
  return (
    RRP_ROUTES.cardUi +
    '/' +
    encodeURIComponent(id) +
    '/' +
    cover.split('/').map(encodeURIComponent).join('/')
  )
}

function Cover(props: { id: string; label: string; cover?: string; large?: boolean }): ReactNode {
  const [failed, setFailed] = useState(false)
  const initial = props.label.trim().slice(0, 1) || '◆'
  const src = coverUrl(props.id, props.cover)
  const showImage = src !== undefined && !failed
  return (
    <span
      style={{
        ...S.cover,
        ...(props.large ? S.coverLarge : {}),
        background: coverGradient(props.id),
      }}
    >
      {showImage ? (
        <img src={src} alt={props.label} style={S.coverImage} onError={() => setFailed(true)} />
      ) : (
        <span style={S.coverPlaceholder} aria-hidden="true" data-gallery-cover-placeholder="true">
          {initial}
        </span>
      )}
    </span>
  )
}

function SkeletonCard(): ReactNode {
  return (
    <div style={S.card} aria-hidden="true">
      <span style={{ ...S.skeleton, ...S.skeletonCover }} />
      <span style={{ ...S.skeleton, width: '62%', height: 13 }} />
      <span style={{ ...S.skeleton, width: '84%', height: 10 }} />
    </div>
  )
}

/** The selected opening is always the one shown in the preview and sent to start. */
export function pickOpening(card: CardPackPlayerView, openingId: string): CardOpening | undefined {
  return (
    card.openings.find((entry) => entry.id === openingId) ??
    card.openings.find((entry) => entry.id === card.meta.opening) ??
    card.openings[0]
  )
}

export function GalleryPanel(props: GalleryPanelProps): ReactNode {
  const t: Translate = typeof props.t === 'function' ? props.t : (key) => key
  const [cards, setCards] = useState<CardMeta[] | null>(null)
  const [selected, setSelected] = useState<CardPackPlayerView | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [status, setStatus] = useState<Status>({ tone: 'idle', text: '' })
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [openingId, setOpeningId] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const selectSeq = useRef(0)
  const selectedRef = useRef<CardPackPlayerView | null>(null)
  const detailOpenRef = useRef(false)
  selectedRef.current = selected
  detailOpenRef.current = detailOpen

  const select = (id: string, openDetail = true): void => {
    if (props.loadCard === undefined) return
    const seq = ++selectSeq.current
    if (openDetail) setStatus({ tone: 'busy', text: t('gallery.loading') })
    void props
      .loadCard(id)
      .then((card) => {
        if (seq !== selectSeq.current) return
        setSelected(card ?? null)
        setOpeningId('')
        if (card !== undefined && openDetail) setDetailOpen(true)
        if (openDetail)
          setStatus(
            card === undefined
              ? { tone: 'error', text: t('gallery.failed') }
              : { tone: 'idle', text: '' },
          )
      })
      .catch((error: unknown) => {
        if (seq !== selectSeq.current) return
        setStatus({
          tone: 'error',
          text:
            t('gallery.failed') + ': ' + String((error as { message?: string })?.message ?? error),
        })
      })
  }

  const refresh = (): void => {
    if (props.loadList === undefined) return
    setStatus({ tone: 'busy', text: t('gallery.loading') })
    void props
      .loadList()
      .then((list) => {
        setCards(list)
        setStatus(
          list.length === 0
            ? { tone: 'idle', text: t('gallery.empty') }
            : { tone: 'idle', text: '' },
        )
        if (list.length === 0) {
          setSelected(null)
          setDetailOpen(false)
          return
        }
        const currentId = selectedRef.current?.meta.id
        const stillThere = currentId !== undefined && list.some((card) => card.id === currentId)
        select(stillThere ? currentId! : list[0]!.id, detailOpenRef.current)
      })
      .catch((error: unknown) => {
        setStatus({
          tone: 'error',
          text:
            t('gallery.failed') + ': ' + String((error as { message?: string })?.message ?? error),
        })
      })
  }

  useEffect(refresh, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && detailOpenRef.current) {
        setDetailOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const importFile = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file === undefined) return
    setBusy(true)
    setStatus({ tone: 'busy', text: t('gallery.importing') })
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('read failed'))
        reader.readAsDataURL(file)
      })
      const response = await fetch(RRP_ROUTES.cardImport, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: file.name.toLowerCase().endsWith('.json') ? 'json' : 'png',
          data: dataUrl.slice(dataUrl.indexOf(',') + 1),
        }),
      })
      const body = (await response.json()) as CardImportResponse | RrpErrorBody
      if (!response.ok || !('id' in body)) {
        const reason = 'error' in body ? body.error : String(response.status)
        setStatus({ tone: 'error', text: t('gallery.importFailed') + ': ' + reason })
        return
      }
      setStatus({ tone: 'ok', text: t('gallery.imported') + ': ' + body.name })
      refresh()
      select(body.id, true)
    } catch (error: unknown) {
      setStatus({
        tone: 'error',
        text:
          t('gallery.importFailed') +
          ': ' +
          String((error as { message?: string })?.message ?? error),
      })
    } finally {
      setBusy(false)
    }
  }

  const begin = (card: CardPackPlayerView): void => {
    if (props.start === undefined) return
    setBusy(true)
    setStatus({ tone: 'busy', text: t('gallery.starting') })
    void props
      .start(card, openingId)
      .then((outcome) => {
        setStatus(
          outcome.ok
            ? { tone: 'ok', text: t('gallery.started') }
            : {
                tone: 'error',
                text:
                  t('gallery.failed') +
                  (outcome.message === undefined ? '' : ': ' + outcome.message),
              },
        )
      })
      .catch((error: unknown) => {
        setStatus({
          tone: 'error',
          text:
            t('gallery.failed') + ': ' + String((error as { message?: string })?.message ?? error),
        })
      })
      .finally(() => setBusy(false))
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = cards ?? []
    if (needle.length === 0) return list
    return list.filter((card) =>
      (card.name + ' ' + (card.summary ?? '') + ' ' + card.tags.join(' '))
        .toLowerCase()
        .includes(needle),
    )
  }, [cards, query])

  const opening = selected === null ? undefined : pickOpening(selected, openingId)
  const dot = DOT[status.tone]

  return (
    <div style={S.root}>
      <header style={S.header}>
        <span style={S.brand}>
          <span style={S.brandIcon}>
            <IconArchiveOutlineMedium size={18} />
          </span>
          <span style={S.brandText}>{t('gallery.title')}</span>
          {cards === null ? null : <Pill>{String(cards.length)}</Pill>}
        </span>
        <span style={S.headerSpacer} />
        {searchOpen ? (
          <span style={S.search}>
            <Input
              autoFocus
              icon={<IconSearchOutlineRegular size={16} />}
              placeholder={t('gallery.search')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={t('gallery.search')}
            />
          </span>
        ) : (
          <Tooltip label={t('gallery.search')}>
            <Button
              variant="ghost"
              size="sm"
              icon={<IconSearchOutlineRegular size={16} />}
              onClick={() => setSearchOpen(true)}
              aria-label={t('gallery.search')}
            />
          </Tooltip>
        )}
        <Tooltip label={t('gallery.reload')}>
          <Button
            variant="ghost"
            size="sm"
            icon={<IconRefreshOutlineRegular size={16} />}
            onClick={refresh}
            aria-label={t('gallery.reload')}
          />
        </Tooltip>
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.json,image/png,application/json"
          style={{ display: 'none' }}
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => void importFile(event)}
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {t('gallery.import')}
        </Button>
      </header>

      <div style={S.body}>
        <main style={S.wall} aria-label={t('gallery.wall')}>
          {cards === null ? (
            <div style={S.grid}>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : filtered.length === 0 ? (
            <div style={S.empty}>
              <span style={S.emptyIcon}>
                <IconArchiveOutlineMedium size={30} />
              </span>
              <span>{cards.length === 0 ? t('gallery.empty') : t('gallery.nomatch')}</span>
            </div>
          ) : (
            <div style={S.grid}>
              {filtered.map((card) => {
                const active = selected?.meta.id === card.id
                return (
                  <button
                    key={card.id}
                    type="button"
                    style={{ ...S.card, ...(active ? S.cardActive : {}) }}
                    onClick={() => select(card.id)}
                    aria-current={active || undefined}
                  >
                    <Cover id={card.id} label={card.name} cover={card.cover} />
                    <span style={S.cardName}>{card.name}</span>
                    <span style={S.cardSummary}>{card.summary ?? ''}</span>
                  </button>
                )
              })}
            </div>
          )}
        </main>

        {detailOpen && selected !== null ? (
          <aside style={S.detailPanel} aria-label={t('gallery.details')}>
            <div style={S.detailScroll}>
              <div style={S.detailHeader}>
                <span style={S.detailHeading}>{t('gallery.details')}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDetailOpen(false)}
                  aria-label={t('gallery.close')}
                >
                  {t('gallery.closeMark')}
                </Button>
              </div>
              <section style={S.hero}>
                <Cover
                  id={selected.id}
                  label={selected.meta.name}
                  cover={selected.meta.cover}
                  large
                />
                <div style={S.heroText}>
                  <h2 style={S.heroTitle}>{selected.meta.name}</h2>
                  {selected.meta.summary === undefined ? null : (
                    <p style={S.heroSummary}>{selected.meta.summary}</p>
                  )}
                  {selected.meta.tags.length === 0 ? null : (
                    <div style={S.tags}>
                      {selected.meta.tags.map((tag) => (
                        <Pill key={tag}>{tag}</Pill>
                      ))}
                    </div>
                  )}
                  {selected.meta.author === undefined &&
                  selected.meta.version === undefined ? null : (
                    <span style={S.metaLine}>
                      {selected.meta.author === undefined
                        ? ''
                        : t('gallery.author') + ': ' + selected.meta.author}
                      {selected.meta.author !== undefined && selected.meta.version !== undefined
                        ? ' · '
                        : ''}
                      {selected.meta.version === undefined
                        ? ''
                        : t('gallery.version') + ': ' + selected.meta.version}
                    </span>
                  )}
                </div>
              </section>

              <section style={S.section}>
                <span style={S.sectionTitle}>{t('gallery.opening')}</span>
                {selected.openings.length > 1 ? (
                  <select
                    aria-label={t('gallery.openingPick')}
                    value={opening?.id ?? ''}
                    disabled={busy}
                    onChange={(event) => setOpeningId(event.target.value)}
                    style={S.openingPick}
                  >
                    {selected.openings.map((entry, index) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.id.length === 0
                          ? t('gallery.openingN').replace('{n}', String(index + 1))
                          : entry.id}
                      </option>
                    ))}
                  </select>
                ) : null}
              </section>
              {opening === undefined ? (
                <p style={S.muted}>{t('gallery.noOpening')}</p>
              ) : (
                <blockquote style={S.opening}>
                  {interpolateCardText(opening.body, selected.meta.player)}
                </blockquote>
              )}

              <section style={S.section}>
                <span style={S.sectionIcon}>
                  <IconSkillOutlineRegular size={16} />
                </span>
                <span style={S.sectionTitle}>{t('gallery.skills')}</span>
                <Pill>{String(selected.skills.length)}</Pill>
              </section>
              {selected.skills.length === 0 ? (
                <p style={S.muted}>{t('gallery.noSkills')}</p>
              ) : (
                <div style={S.skillList}>
                  {selected.skills.map((skill) => (
                    <span key={skill.id} style={S.skillChip}>
                      <span style={S.skillName}>{skill.name ?? skill.id}</span>
                      {skill.description === undefined ? null : (
                        <span style={S.skillDesc}>{skill.description}</span>
                      )}
                    </span>
                  ))}
                </div>
              )}

              <section style={S.playerSection}>
                <div style={S.section}>
                  <span style={S.sectionIcon}>
                    <IconUserOutlineRegular size={16} />
                  </span>
                  <span style={S.sectionTitle}>{t('gallery.player')}</span>
                </div>
                <div style={S.playerRow}>
                  <span style={S.playerValue}>
                    {selected.meta.player?.name ?? t('gallery.playerUnknown')}
                  </span>
                  {selected.meta.player?.description === undefined ? null : (
                    <span style={S.playerDescription}>{selected.meta.player.description}</span>
                  )}
                </div>
                <span style={S.readOnlyHint}>{t('gallery.playerReadOnly')}</span>
              </section>
            </div>
            <footer style={S.actionBar}>
              <span style={S.status}>
                {dot === null ? null : <StateDot state={dot} />}
                <span>{status.text}</span>
              </span>
              <Button
                variant="primary"
                icon={
                  busy ? (
                    <IconLoadingOutlineRegular size={16} />
                  ) : (
                    <IconPlayOutlineRegular size={16} />
                  )
                }
                disabled={busy}
                onClick={() => begin(selected)}
              >
                {busy ? t('gallery.starting') : t('gallery.start')}
              </Button>
            </footer>
          </aside>
        ) : null}
      </div>
    </div>
  )
}

const S: Record<string, CSSProperties> = {
  root: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--dsw-alias-bg-base)',
    color: 'var(--dsw-alias-label-primary)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    padding: '12px 16px',
    borderBottom: '1px solid var(--dsw-alias-border-l1)',
    flex: '0 0 auto',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  brandIcon: { display: 'inline-flex', color: 'var(--dsw-alias-label-secondary)' },
  brandText: { fontSize: 14, fontWeight: 600 },
  headerSpacer: { flex: 1, minWidth: 8 },
  search: { width: 220, maxWidth: '100%', display: 'flex' },
  body: { position: 'relative', flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' },
  wall: { flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', padding: 16 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))',
    gap: 16,
    alignItems: 'start',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 6,
    minWidth: 0,
    padding: 8,
    borderRadius: 10,
    border: '1px solid var(--dsw-alias-border-l1)',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    textAlign: 'left',
    font: 'inherit',
    transition: 'background-color 120ms ease, border-color 120ms ease',
  },
  cardActive: {
    border: '2px solid var(--dsw-alias-brand-primary)',
    padding: 7,
    background: 'var(--dsw-alias-interactive-bg-hover)',
  },
  cover: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    aspectRatio: '2 / 3',
    overflow: 'hidden',
    borderRadius: 8,
    border: '1px solid var(--dsw-alias-border-l1)',
    color: '#fff',
    fontWeight: 700,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.24)',
  },
  coverLarge: { flex: '0 0 132px', width: 132, aspectRatio: '2 / 3' },
  coverImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'top',
    display: 'block',
  },
  coverPlaceholder: { fontSize: 48, lineHeight: 1, textShadow: '0 1px 2px rgba(0,0,0,0.24)' },
  cardName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 13,
    fontWeight: 600,
  },
  cardSummary: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 11,
    color: 'var(--dsw-alias-label-tertiary)',
  },
  skeleton: {
    display: 'inline-block',
    borderRadius: 6,
    background: 'var(--dsw-alias-bg-skeleton)',
  },
  skeletonCover: { width: '100%', aspectRatio: '2 / 3', borderRadius: 8 },
  empty: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    color: 'var(--dsw-alias-label-tertiary)',
    fontSize: 13,
  },
  emptyIcon: { display: 'inline-flex', opacity: 0.5 },
  detailPanel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 'min(430px, 100%)',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    borderLeft: '1px solid var(--dsw-alias-border-l1)',
    background: 'var(--dsw-alias-bg-base)',
    boxShadow: '-8px 0 24px rgba(0,0,0,0.08)',
    transition: 'transform 160ms ease-out',
    zIndex: 2,
  },
  detailScroll: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 18px 24px' },
  detailHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  detailHeading: {
    fontSize: 12,
    color: 'var(--dsw-alias-label-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  hero: { display: 'flex', gap: 14, alignItems: 'flex-start' },
  heroText: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, paddingTop: 2 },
  heroTitle: { margin: 0, fontSize: 20, lineHeight: 1.3, fontWeight: 650 },
  heroSummary: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.55,
    color: 'var(--dsw-alias-label-secondary)',
  },
  tags: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  metaLine: { fontSize: 11, lineHeight: 1.4, color: 'var(--dsw-alias-label-tertiary)' },
  section: { display: 'flex', alignItems: 'center', gap: 8, margin: '22px 0 10px' },
  sectionIcon: { display: 'inline-flex', color: 'var(--dsw-alias-label-tertiary)' },
  sectionTitle: { fontSize: 13, fontWeight: 650 },
  openingPick: {
    minWidth: 0,
    maxWidth: 220,
    height: 28,
    marginLeft: 'auto',
    padding: '0 24px 0 8px',
    borderRadius: 6,
    border: '1px solid var(--dsw-alias-border-l1)',
    background: 'var(--dsw-alias-bg-layer-1)',
    color: 'var(--dsw-alias-label-primary)',
    font: 'inherit',
    fontSize: 12,
  },
  opening: {
    margin: 0,
    padding: '14px 16px',
    borderRadius: 8,
    border: '1px solid var(--dsw-alias-border-l1)',
    borderLeft: '3px solid var(--dsw-alias-brand-primary)',
    background: 'var(--dsw-alias-bg-layer-1)',
    color: 'var(--dsw-alias-label-secondary)',
    fontSize: 13.5,
    lineHeight: 1.8,
    whiteSpace: 'pre-wrap',
  },
  skillList: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  skillChip: {
    display: 'inline-flex',
    flexDirection: 'column',
    gap: 2,
    maxWidth: 240,
    padding: '7px 11px',
    borderRadius: 8,
    border: '1px solid var(--dsw-alias-border-l1)',
    background: 'var(--dsw-alias-bg-layer-2)',
  },
  skillName: { fontSize: 12, fontWeight: 600 },
  skillDesc: { fontSize: 11, lineHeight: 1.45, color: 'var(--dsw-alias-label-tertiary)' },
  muted: { margin: 0, fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' },
  playerSection: { marginTop: 4 },
  playerRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--dsw-alias-border-l1)',
    background: 'var(--dsw-alias-bg-layer-1)',
  },
  playerValue: { fontSize: 13, fontWeight: 600 },
  playerDescription: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.5 },
  readOnlyHint: {
    display: 'block',
    marginTop: 7,
    fontSize: 11,
    color: 'var(--dsw-alias-label-tertiary)',
  },
  actionBar: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    padding: '12px 18px',
    borderTop: '1px solid var(--dsw-alias-border-l1)',
    background: 'var(--dsw-alias-bg-base)',
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 120,
    overflow: 'hidden',
    fontSize: 12,
    color: 'var(--dsw-alias-label-tertiary)',
  },
}

function GalleryGlyph(props: { size?: number; active?: boolean }): ReactNode {
  const size = props.size ?? 20
  return (
    <span
      aria-hidden="true"
      style={{ display: 'inline-flex', opacity: props.active === false ? 0.7 : 1 }}
    >
      <IconArchiveOutlineMedium size={size} />
    </span>
  )
}

export function registerGallery(ctx: RrpClientContext): void {
  const t = ctx.locale.bind('rrp') as Translate

  const loadList = async (): Promise<CardMeta[]> => {
    const response = await fetch(RRP_ROUTES.cards)
    if (!response.ok) throw new Error(String(response.status))
    const body = (await response.json()) as CardListResponse
    return body.cards
  }

  const loadCard = async (id: string): Promise<CardPackPlayerView | undefined> => {
    const response = await fetch(RRP_ROUTES.cardOne + '?id=' + encodeURIComponent(id))
    if (!response.ok) return undefined
    const body = (await response.json()) as CardOneResponse
    return body.card
  }

  const ensureCardWorkspace = async (
    card: CardPackPlayerView,
  ): Promise<{ workspaceId?: string; degraded: boolean }> => {
    try {
      const response = await fetch(RRP_ROUTES.cardWorkspace, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cardId: card.id, cardName: card.meta.name }),
      })
      if (!response.ok) return { degraded: true }
      const body = (await response.json()) as { workspaceId?: string }
      return typeof body.workspaceId === 'string' && body.workspaceId.length > 0
        ? { workspaceId: body.workspaceId, degraded: false }
        : { degraded: true }
    } catch {
      return { degraded: true }
    }
  }

  const start = async (
    card: CardPackPlayerView,
    openingId?: string,
  ): Promise<GalleryStartResult> => {
    const sessions = ctx.sessions
    const remote = ctx.remote
    if (sessions === undefined || remote === undefined)
      return { ok: false, message: t('gallery.unavailable') }
    const cardWorkspace = await ensureCardWorkspace(card)
    const sessionId = await sessions.create(
      cardWorkspace.workspaceId === undefined ? {} : { workspaceId: cardWorkspace.workspaceId },
    )
    const abortStart = async (reason: string): Promise<GalleryStartResult> => {
      let recovered = false
      try {
        const destroy = sessions as unknown as {
          dispose?: (id: string) => unknown
          remove?: (id: string) => unknown
        }
        const fn = destroy.dispose ?? destroy.remove
        if (typeof fn === 'function') {
          await fn.call(sessions, sessionId)
          recovered = true
        }
      } catch {
        /* fall through to the manual-cleanup hint */
      }
      const suffix = recovered ? '' : t('gallery.orphanSession') + sessionId
      return { ok: false, message: t('gallery.failed') + ': ' + reason + suffix }
    }

    const selected = await remote.agentPresets.select(sessionId, presetIdForCard(card.id))
    if (selected.ok === false)
      return abortStart(selected.error?.message ?? t('gallery.selectFailed'))

    const opening = pickOpening(card, (openingId ?? '').trim())?.body
    const response = await fetch(RRP_ROUTES.start, {
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
    if (!response.ok) return abortStart(await response.text())

    const uiWorkspace = (ctx as unknown as { get?(name: string): unknown }).get?.('uiWorkspace') as
      { openSession?: (id: string) => void } | undefined
    if (typeof uiWorkspace?.openSession === 'function') uiWorkspace.openSession(sessionId)
    ctx.layout?.selectPanel(null)

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 400))
      const binding = sessions.binding(sessionId)
      if (binding !== undefined) {
        try {
          const roster = sessions.list?.getSnapshot()
          const titles =
            roster === undefined
              ? []
              : roster.ids
                  .map((id) => roster.byId[id]?.title ?? roster.byId[id]?.displayTitle ?? '')
                  .filter((title) => title.length > 0)
          await binding.session.rename?.(uniqueMainTitle(card.meta.name, titles))
        } catch {
          /* title only */
        }
        break
      }
    }
    return {
      ok: true,
      message: cardWorkspace.degraded ? t('gallery.workspaceFallback') : undefined,
    }
  }

  ctx.effect(() => {
    const disposeMain = ctx.slots.inject('main', () =>
      ctx.slots.register(
        {
          name: 'main',
          key: GALLERY_PANEL_ID,
          locale: 'rrp',
          inject: () => ({ t, loadList, loadCard, start }),
        },
        GalleryPanel as never,
      ),
    )
    const disposeNav = ctx.slots.inject('sidebar.panellist', () =>
      ctx.slots.register(
        {
          name: 'sidebar.panellist',
          id: GALLERY_PANEL_ID,
          order: 40,
          label: () => t('gallery.title'),
        },
        GalleryGlyph as never,
      ),
    )
    return () => {
      disposeMain()
      disposeNav()
    }
  }, 'dsh-rrp: card gallery')
}
