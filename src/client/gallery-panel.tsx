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
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  interpolateCardText,
  type CardMeta,
  type CardOpening,
  type CardPack,
  type CardPlayer,
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
import { withPlayerPersona } from '../world-state.ts'
import type { RrpClientContext } from './context-types.ts'

/** Panel id: the \`main\` key and the \`sidebar.panellist\` id must match. */
export const GALLERY_PANEL_ID = 'dsh-rrp/chronicle'

type Translate = (key: string) => string

/** Start outcome the panel renders. */
interface GalleryStartResult {
  ok: boolean
  message?: string
}

/** Props the slot framework merges: injected data plus the locale \`t\`. */
interface GalleryPanelProps {
  t?: Translate
  loadList?: () => Promise<CardMeta[]>
  loadCard?: (id: string) => Promise<CardPack | undefined>
  /** playerNameOverride: per-session player-name override (#25); empty/undefined = card-declared. */
  start?: (
    card: CardPack,
    playerNameOverride?: string,
    openingId?: string,
    playerPersona?: string,
  ) => Promise<GalleryStartResult>
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
  return (
    'linear-gradient(140deg, hsl(' +
    String(hue) +
    ' 42% 62%), hsl(' +
    String((hue + 40) % 360) +
    ' 40% 42%))'
  )
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
        borderRadius: 8,
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

/**
 * Which opening starts the run: the player's gallery pick wins, then the
 * card's declared default, then the first opening (defensive). Shared by the
 * preview and the start request so what you read is what you get (#31-A).
 */
function pickOpening(card: CardPack, openingId: string): CardOpening | undefined {
  return (
    card.openings.find((entry) => entry.id === openingId) ??
    card.openings.find((entry) => entry.id === card.meta.opening) ??
    card.openings[0]
  )
}

function GalleryPanel(props: GalleryPanelProps): ReactNode {
  const t: Translate = typeof props.t === 'function' ? props.t : (key) => key
  const [cards, setCards] = useState<CardMeta[] | null>(null)
  const [selected, setSelected] = useState<CardPack | null>(null)
  const [status, setStatus] = useState<Status>({ tone: 'idle', text: '' })
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  // #25 per-session player-name override; empty = use the card-declared name.
  const [playerName, setPlayerName] = useState('')
  // P1-B self-authored persona (appearance/personality/background); empty =
  // the card-declared player description stands alone.
  const [playerPersona, setPlayerPersona] = useState('')
  // Multi-opening pick (#31-A); empty = the card's declared default opening.
  const [openingId, setOpeningId] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  /**
   * P1-D: import a tavern character card (PNG or raw v2/v3 JSON). The file is
   * read client-side, posted as base64, and the gallery refreshes on success.
   */
  const importFile = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file === undefined) return
    setBusy(true)
    setStatus({ tone: 'busy', text: t('gallery.importing') })
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          resolve(String(reader.result))
        }
        reader.onerror = () => {
          reject(new Error('read failed'))
        }
        reader.readAsDataURL(file)
      })
      const data = dataUrl.slice(dataUrl.indexOf(',') + 1)
      const kind = file.name.toLowerCase().endsWith('.json') ? 'json' : 'png'
      const response = await fetch(RRP_ROUTES.cardImport, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, data }),
      })
      const body = (await response.json()) as CardImportResponse | RrpErrorBody
      if (!response.ok || !('id' in body)) {
        const reason = 'error' in body ? body.error : String(response.status)
        setStatus({ tone: 'error', text: t('gallery.importFailed') + ': ' + reason })
        return
      }
      setStatus({ tone: 'ok', text: t('gallery.imported') + '：' + body.name })
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

  const loadList = props.loadList
  const loadCard = props.loadCard
  // Latest-wins guard: two quick clicks must not let the slower response win.
  const selectSeq = useRef(0)
  const selectedRef = useRef<CardPack | null>(null)
  selectedRef.current = selected

  const select = (id: string, quiet = false): void => {
    if (loadCard === undefined) return
    const seq = ++selectSeq.current
    if (!quiet) setStatus({ tone: 'busy', text: t('gallery.loading') })
    void loadCard(id)
      .then((card) => {
        if (seq !== selectSeq.current) return
        setSelected(card ?? null)
        // A fresh selection gets a fresh per-run name override (#25),
        // persona (P1-B), and falls back to the card's declared default opening.
        setPlayerName('')
        setPlayerPersona('')
        setOpeningId('')
        if (!quiet)
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
    if (loadList === undefined) return
    setStatus({ tone: 'busy', text: t('gallery.loading') })
    void loadList()
      .then((list) => {
        setCards(list)
        setStatus(
          list.length === 0
            ? { tone: 'idle', text: t('gallery.empty') }
            : { tone: 'idle', text: '' },
        )
        if (list.length === 0) {
          setSelected(null)
          return
        }
        // Keep the player's current pick when it survived the reload.
        const currentId = selectedRef.current?.meta.id
        const stillThere = currentId !== undefined && list.some((card) => card.id === currentId)
        select(stillThere ? currentId! : list[0]!.id, true)
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

  const begin = (card: CardPack): void => {
    if (props.start === undefined) return
    setBusy(true)
    setStatus({ tone: 'busy', text: t('gallery.starting') })
    void props
      .start(card, playerName.trim(), openingId, playerPersona)
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
    return list.filter((card) => {
      const haystack = card.name + ' ' + (card.summary ?? '') + ' ' + card.tags.join(' ')
      return haystack.toLowerCase().includes(needle)
    })
  }, [cards, query])

  const opening = selected === null ? undefined : pickOpening(selected, openingId)

  // #25: the effective player for previews and the start request — the
  // per-run override replaces only the name; the description stays as declared.
  const playerNameOverride = playerName.trim()
  const effectivePlayer: CardPlayer | undefined =
    selected === null
      ? undefined
      : playerNameOverride.length === 0
        ? selected.meta.player
        : {
            name: playerNameOverride,
            ...(selected.meta.player?.description === undefined
              ? {}
              : { description: selected.meta.player.description }),
          }

  const dot = DOT[status.tone]

  return (
    <div style={S.root}>
      <header style={S.header}>
        <span style={S.brand}>
          <span style={S.brandIcon}>
            <IconArchiveOutline20 size={18} />
          </span>
          <span style={S.brandText}>{t('gallery.title')}</span>
        </span>
        {cards === null ? null : <Pill>{String(cards.length)}</Pill>}
        <span style={S.headerSpacer} />
        <span style={S.search}>
          <Input
            icon={<IconSearchOutline16 size={16} />}
            placeholder={t('gallery.search')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
            }}
          />
        </span>
        <Tooltip label={t('gallery.reload')}>
          <Button
            variant="ghost"
            size="sm"
            icon={<IconRefreshOutline16 size={16} />}
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
          onChange={(event) => {
            void importFile(event)
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            fileInputRef.current?.click()
          }}
        >
          {t('gallery.import')}
        </Button>
      </header>

      <div style={S.body}>
        <nav style={S.list} aria-label={t('gallery.title')}>
          {cards === null ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : null}
          {cards !== null && filtered.length === 0 ? (
            <div style={S.listEmpty}>
              {cards.length === 0 ? t('gallery.empty') : t('gallery.nomatch')}
            </div>
          ) : null}
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
              <span style={S.placeholderIcon}>
                <IconArchiveOutline20 size={30} />
              </span>
              <div style={S.placeholderText}>{t('gallery.pick')}</div>
            </div>
          ) : (
            <div style={S.detail}>
              <div style={S.scroll}>
                <div style={S.hero}>
                  <Cover seed={selected.id} label={selected.meta.name} size={76} />
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
                  </div>
                </div>

                {selected.meta.player === undefined ? null : (
                  <div style={S.fact}>
                    <span style={S.factIcon}>
                      <IconUserOutline16 size={16} />
                    </span>
                    <span style={S.factLabel}>{t('gallery.player')}</span>
                    <span style={S.factValue}>
                      {selected.meta.player.name}
                      {selected.meta.player.description === undefined
                        ? ''
                        : ' · ' + selected.meta.player.description}
                    </span>
                  </div>
                )}

                {/* #25 per-run name override: empty keeps the card-declared name. */}
                <div style={S.playerOverride}>
                  <span style={S.overrideLabel}>{t('gallery.playerName')}</span>
                  <span style={S.overrideInput}>
                    <Input
                      value={playerName}
                      onChange={(event) => {
                        setPlayerName(event.target.value)
                      }}
                      placeholder={selected.meta.player?.name ?? ''}
                      maxLength={24}
                      aria-label={t('gallery.playerName')}
                    />
                  </span>
                  <span style={S.overrideHint}>{t('gallery.playerNameHint')}</span>
                </div>

                {/* P1-B self-authored persona; rides the `player` dynamic field
                    so the Author reads it every turn and the player can edit it
                    mid-run in the world-state tab's dynamic-field editor. */}
                <div style={S.playerOverride}>
                  <span style={S.overrideLabel}>{t('gallery.playerPersona')}</span>
                  <span style={{ flex: 1, display: 'flex', minWidth: 0 }}>
                    <textarea
                      value={playerPersona}
                      onChange={(event) => {
                        setPlayerPersona(event.target.value)
                      }}
                      placeholder={t('gallery.playerPersonaPlaceholder')}
                      maxLength={400}
                      rows={3}
                      style={S.personaInput}
                      aria-label={t('gallery.playerPersona')}
                    />
                  </span>
                  <span style={S.overrideHint}>{t('gallery.playerPersonaHint')}</span>
                </div>

                <div style={S.section}>
                  <span style={S.sectionIcon}>
                    <IconSkillOutline16 size={16} />
                  </span>
                  <span style={S.sectionTitle}>{t('gallery.skills')}</span>
                  <Pill>{String(selected.skills.length)}</Pill>
                </div>
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

                {opening === undefined ? null : (
                  <>
                    <div style={S.section}>
                      <span style={S.sectionTitle}>{t('gallery.opening')}</span>
                      {selected.openings.length > 1 ? (
                        <select
                          aria-label={t('gallery.openingPick')}
                          value={opening.id}
                          disabled={busy}
                          onChange={(event) => {
                            setOpeningId(event.target.value)
                          }}
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
                    </div>
                    <blockquote style={S.opening}>
                      {interpolateCardText(opening.body, effectivePlayer)}
                    </blockquote>
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
    gap: 8,
    padding: '12px 16px',
    borderBottom: '1px solid var(--dsw-alias-border-l1)',
    flex: '0 0 auto',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 8 },
  brandIcon: { display: 'inline-flex', color: 'var(--dsw-alias-label-secondary)' },
  brandText: { fontSize: 14, fontWeight: 600 },
  headerSpacer: { flex: 1 },
  search: { width: 220, display: 'flex' },
  body: { flex: 1, minHeight: 0, display: 'flex' },
  list: {
    flex: '0 0 272px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '10px 10px 18px',
    overflowY: 'auto',
    borderRight: '1px solid var(--dsw-alias-border-l1)',
  },
  listEmpty: {
    fontSize: 12,
    color: 'var(--dsw-alias-label-tertiary)',
    padding: '16px 8px',
    textAlign: 'center',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid transparent',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    font: 'inherit',
    color: 'inherit',
    width: '100%',
  },
  rowActive: {
    background: 'var(--dsw-alias-interactive-bg-hover)',
    borderColor: 'var(--dsw-alias-border-l2)',
  },
  cover: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 600,
    letterSpacing: 0,
    flex: '0 0 auto',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
  },
  rowText: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 },
  rowName: {
    fontSize: 13,
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowSummary: {
    fontSize: 11,
    color: 'var(--dsw-alias-label-tertiary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  skeletonRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px' },
  skeleton: {
    background: 'var(--dsw-alias-bg-skeleton)',
    borderRadius: 6,
    display: 'inline-block',
  },
  preview: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' },
  placeholder: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    color: 'var(--dsw-alias-label-tertiary)',
  },
  placeholderIcon: { display: 'inline-flex', opacity: 0.5 },
  placeholderText: { fontSize: 13, maxWidth: 280, textAlign: 'center', lineHeight: 1.6 },
  detail: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' },
  scroll: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '22px 24px 28px' },
  hero: { display: 'flex', gap: 16, alignItems: 'flex-start' },
  heroText: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, paddingTop: 2 },
  heroTitle: { margin: 0, fontSize: 20, fontWeight: 600, lineHeight: 1.35 },
  heroSummary: {
    margin: 0,
    fontSize: 13,
    color: 'var(--dsw-alias-label-secondary)',
    lineHeight: 1.6,
    maxWidth: 560,
  },
  tags: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  fact: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, fontSize: 13 },
  factIcon: { display: 'inline-flex', color: 'var(--dsw-alias-label-tertiary)' },
  factLabel: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, flex: '0 0 auto' },
  factValue: { color: 'var(--dsw-alias-label-primary)', minWidth: 0 },
  playerOverride: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12 },
  overrideLabel: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, flex: '0 0 auto' },
  overrideInput: { width: 200, display: 'flex' },
  personaInput: {
    width: '100%',
    resize: 'vertical',
    minHeight: 56,
    padding: '6px 9px',
    borderRadius: 6,
    border: '1px solid var(--dsw-alias-border-l1)',
    background: 'var(--dsw-alias-bg-layer-1)',
    color: 'var(--dsw-alias-label-primary)',
    font: 'inherit',
    fontSize: 12,
    lineHeight: 1.6,
  },
  overrideHint: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 11 },
  section: { display: 'flex', alignItems: 'center', gap: 8, margin: '22px 0 10px' },
  sectionIcon: { display: 'inline-flex', color: 'var(--dsw-alias-label-tertiary)' },
  sectionTitle: { fontSize: 13, fontWeight: 600 },
  skillList: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  skillChip: {
    display: 'inline-flex',
    flexDirection: 'column',
    gap: 2,
    padding: '7px 11px',
    borderRadius: 8,
    background: 'var(--dsw-alias-bg-layer-2)',
    border: '1px solid var(--dsw-alias-border-l1)',
    maxWidth: 240,
  },
  skillName: { fontSize: 12, fontWeight: 600 },
  skillDesc: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', lineHeight: 1.45 },
  opening: {
    margin: 0,
    padding: '14px 16px',
    borderRadius: 8,
    fontSize: 13.5,
    lineHeight: 1.9,
    whiteSpace: 'pre-wrap',
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
    borderLeft: '3px solid var(--dsw-alias-brand-primary)',
    color: 'var(--dsw-alias-label-secondary)',
  },
  actionBar: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    padding: '12px 24px',
    borderTop: '1px solid var(--dsw-alias-border-l1)',
    background: 'var(--dsw-alias-bg-base)',
  },
  status: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: 'var(--dsw-alias-label-tertiary)',
    minWidth: 120,
    overflow: 'hidden',
  },
  openingPick: {
    minWidth: 0,
    maxWidth: 220,
    height: 26,
    padding: '0 24px 0 8px',
    borderRadius: 6,
    border: '1px solid var(--dsw-alias-border-l1)',
    background: 'var(--dsw-alias-bg-layer-1)',
    color: 'var(--dsw-alias-label-primary)',
    font: 'inherit',
    fontSize: 12,
  },
}

/** Host-native archive glyph for the left-sidebar nav entry. */
function GalleryGlyph(props: { size?: number; active?: boolean }): ReactNode {
  const size = props.size ?? 20
  return (
    <span
      aria-hidden="true"
      style={{ display: 'inline-flex', opacity: props.active === false ? 0.7 : 1 }}
    >
      <IconArchiveOutline20 size={size} />
    </span>
  )
}

/**
 * Register the gallery panel, its left-nav entry, and the start flow.
 * @param ctx - the client context owning the registration.
 */
export function registerGallery(ctx: RrpClientContext): void {
  const t = ctx.locale.bind('rrp') as Translate

  const loadList = async (): Promise<CardMeta[]> => {
    const response = await fetch(RRP_ROUTES.cards)
    if (!response.ok) throw new Error(String(response.status))
    const body = (await response.json()) as CardListResponse
    return body.cards
  }

  const loadCard = async (id: string): Promise<CardPack | undefined> => {
    const response = await fetch(RRP_ROUTES.cardOne + '?id=' + encodeURIComponent(id))
    if (!response.ok) return undefined
    const body = (await response.json()) as CardOneResponse
    return body.card
  }

  /**
   * Ensure the card's own workspace (issue #37 「一卡一区」): the save-group
   * drawer every session of this card lives in (forks re-attach natively).
   * A host without the workspace registry (or a failed ensure) degrades to
   * the old ungrouped flow — playing must never be blocked by grouping.
   */
  const ensureCardWorkspace = async (
    card: CardPack,
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
    card: CardPack,
    playerNameOverride?: string,
    openingId?: string,
    playerPersona?: string,
  ): Promise<GalleryStartResult> => {
    const sessions = ctx.sessions
    const remote = ctx.remote
    if (sessions === undefined || remote === undefined)
      return { ok: false, message: t('gallery.unavailable') }
    const cardWorkspace = await ensureCardWorkspace(card)
    const sessionId = await sessions.create(
      cardWorkspace.workspaceId === undefined ? {} : { workspaceId: cardWorkspace.workspaceId },
    )
    // Best-effort orphan cleanup: the session exists on the host now, so any
    // later failure must not leave a preset-bound empty session behind.
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
    // Each card gets its own scoped preset (rp-<card-id>) so only this card's
    // world-knowledge skills are in the session's skill scope.
    const selected = await remote.agentPresets.select(sessionId, presetIdForCard(card.id))
    if (selected.ok === false)
      return abortStart(selected.error?.message ?? t('gallery.selectFailed'))

    const opening = pickOpening(card, (openingId ?? '').trim())?.body
    // P1-B: the self-authored persona rides the `player` dynamic field.
    const state = withPlayerPersona(card.initialState, (playerPersona ?? '').trim())
    // #25: the per-run override rides the card player slot — description stays
    // as declared; the effective name flows into the card projection, the
    // facts fingerprint and the pre-log opening interpolation on the host side.
    const override = (playerNameOverride ?? '').trim()
    const declared = card.meta.player
    const player: CardPlayer | undefined =
      override.length === 0
        ? declared
        : {
            name: override,
            ...(declared?.description === undefined ? {} : { description: declared.description }),
          }
    const response = await fetch(RRP_ROUTES.start, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        state,
        opening,
        card: {
          id: card.id,
          name: card.meta.name,
          persona: card.persona,
          worldCore: card.worldCore,
          player,
        },
      }),
    })
    if (!response.ok) return abortStart(await response.text())
    // Stage the session only AFTER the log is complete: the conversation view
    // then pulls the whole history (card context + facts + opening) in one go,
    // instead of racing the host's live follow stream for the opening.
    // Navigation belongs to view owners: ISessions has no open(), so switch
    // through the host's workspace navigation (defensively probed — the
    // workspace package may mount after this plugin).
    const uiWorkspace = (ctx as unknown as { get?(name: string): unknown }).get?.('uiWorkspace') as
      { openSession?: (id: string) => void } | undefined
    if (typeof uiWorkspace?.openSession === 'function') {
      uiWorkspace.openSession(sessionId)
    }
    ctx.layout?.selectPanel(null)

    // The save's title is the drawer-readable name: 「卡名·主线」, auto-
    // numbered (主线2, 主线3…) when earlier saves of this card already hold
    // the base (issue #37). The rename runs AFTER openSession: the binding
    // only materializes once the conversation view retains the session, so a
    // single shot at create time silently skipped. A title is a nicety, never
    // fatal — the bounded retry gives up rather than blocking the start.
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
