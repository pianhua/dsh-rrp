/**
 * dsh-rrp — the Stage panel (issue #18, L1): a native `conversation.view` tab
 * that renders whatever UI the active card declared.
 *
 * The card authors data, the host validates it, and this panel is the one
 * closed interpreter: five components, bound to the live WorldState through
 * `useProjection` (host-pushed, so no polling). A card UI can never write
 * anything except a player correction or a question handed to the copilot —
 * that restriction is the whole reason arbitrary card code is unnecessary.
 */
import {
  Button,
  IconRefreshOutline16,
  Pill,
  RiskConfirmation,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { CARD_KEY, type CardContext } from '../card-types.ts'
import { RRP_ROUTES, type CardUiResponse } from '../route-contract.ts'
import { RRP_SETTINGS_KEY, rrpSettingsOf } from '../settings.ts'
import type { LoreEntry } from '../lore-state.ts'
import {
  applyButtonPatch,
  readCharacters,
  readGaugeValue,
  readReferenceName,
  readTimeline,
  visiblePanels,
  type UiButtonDecl,
  type UiManifest,
  type UiPanelDecl,
} from '../ui-schema.ts'
import { WORLD_STATE_KEY, emptyWorldState, type WorldState } from '../world-state.ts'
import { filterWorldState } from '../world-state-visibility.ts'
import { WORLDLINE_DIGEST_KEY, type WorldlineDigest } from '../worldline-digest.ts'
import type { RrpClientContext, RrpUseProjection } from './context-types.ts'
import { StageFrame } from './stage-frame.tsx'
import { askCopilot } from './copilot-prefill.ts'
import type { StageApi, StageInputActions, Translate } from './stage-types.ts'

export type { StageApi, Translate }

interface StagePanelProps {
  t?: Translate
  sessionId?: string
  api?: StageApi
  useProjection?: RrpUseProjection
  /** Host input-machine actions; `conversation.view` standard prop. */
  inputActions?: StageInputActions
}

/** Manifest cache keyed by card id; errors are cleared whenever the card reloads. */
const MANIFESTS = new Map<string, UiManifest | null>()
const MANIFEST_ERRORS = new Map<string, string>()

/** Test-only hook to isolate manifest cache between tests. */
export function __clearStageManifestCache(): void {
  MANIFESTS.clear()
  MANIFEST_ERRORS.clear()
}

const APP_VIEW_KEY = 'app'
const L1_VIEW_KEY = 'l1'

type Subview = typeof APP_VIEW_KEY | typeof L1_VIEW_KEY

function viewStorageKey(sessionId: string | undefined): string | undefined {
  return sessionId === undefined ? undefined : 'dsh-rrp:stage-view:' + sessionId
}

function readStoredView(sessionId: string | undefined): Subview {
  const key = viewStorageKey(sessionId)
  if (key === undefined) return APP_VIEW_KEY
  try {
    const value = sessionStorage.getItem(key)
    return value === L1_VIEW_KEY ? L1_VIEW_KEY : APP_VIEW_KEY
  } catch {
    return APP_VIEW_KEY
  }
}

function writeStoredView(sessionId: string | undefined, view: Subview): void {
  const key = viewStorageKey(sessionId)
  if (key === undefined) return
  try {
    sessionStorage.setItem(key, view)
  } catch {
    /* quota or private mode — ignore */
  }
}

function isDev(): boolean {
  return (
    typeof process !== 'undefined' &&
    process.env !== undefined &&
    process.env.NODE_ENV !== 'production'
  )
}

/** One number bar: value over its bounds, tinted by fill. */
function Gauge(props: { panel: UiPanelDecl; state: WorldState; t: Translate }): ReactNode {
  const value = readGaugeValue(props.panel.bind, props.state)
  const min = props.panel.min ?? 0
  const max = props.panel.max ?? 100
  const ratio = value === undefined ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min || 1)))
  return (
    <div style={S.field}>
      <div style={S.fieldHead}>
        <span>{props.panel.title ?? props.panel.bind ?? props.panel.id}</span>
        <span style={S.gaugeValue}>{value === undefined ? '—' : String(value)}</span>
      </div>
      <div style={S.gaugeTrack}>
        <div style={{ ...S.gaugeFill, width: Math.round(ratio * 100).toString() + '%' }} />
      </div>
      <div style={S.gaugeBounds}>
        <span>{String(min)}</span>
        <span>{String(max)}</span>
      </div>
    </div>
  )
}

/** One character: name, affinity pill, and whatever else the state tracks. */
function CharacterCard(props: { panel: UiPanelDecl; state: WorldState; t: Translate }): ReactNode {
  const rows = readCharacters(props.panel.bind, props.state).filter(
    (row) => row.state.character?.presence === 'present',
  )
  if (rows.length === 0) return <div style={S.muted}>{props.t('stage.noData')}</div>
  return (
    <div style={S.charList}>
      {rows.map((row) => {
        const entry = row.state
        const lines = [
          entry.character?.emotionalState,
          entry.character?.outfit,
          entry.character?.appearance,
          ...Object.values(entry.fields).map((field) =>
            typeof field.value === 'string' ? field.value : undefined,
          ),
        ].filter((line): line is string => line !== undefined && line.length > 0)
        return (
          <div key={row.name} style={S.char}>
            <div style={S.charHead}>
              <span style={S.charName}>{row.name}</span>
              {typeof entry.character?.affinity === 'number' ? (
                <Pill>{String(entry.character.affinity)}</Pill>
              ) : null}
            </div>
            {lines.map((line) => (
              <div key={line} style={S.charLine}>
                {line}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

/** The relation net as plain pairs. */
function RelationTable(props: { panel: UiPanelDecl; state: WorldState; t: Translate }): ReactNode {
  const relations = props.state.relations
  if (relations.length === 0) return <div style={S.muted}>{props.t('stage.noData')}</div>
  return (
    <div style={S.rows}>
      {relations.map((rel) => (
        <div key={rel.id} style={S.row}>
          <span style={S.rowPair}>
            {readReferenceName(rel.a, props.state)} × {readReferenceName(rel.b, props.state)}
          </span>
          <span style={S.rowLabel}>{rel.labels.join(' · ')}</span>
        </div>
      ))}
    </div>
  )
}

/** Where and when the story stands, from scene tracked-object fields. */
function Timeline(props: { panel: UiPanelDecl; state: WorldState; t: Translate }): ReactNode {
  const scenes = readTimeline(props.panel.bind, props.state)
  const lines = scenes.flatMap((scene) => {
    const values = Object.values(scene.fields).filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    )
    return values.length === 0 ? [] : [scene.name + ' · ' + values.join(' · ')]
  })
  if (lines.length === 0) return <div style={S.muted}>{props.t('stage.noData')}</div>
  return (
    <div style={S.sceneLine}>
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  )
}

function buttonPayload(
  button: UiButtonDecl,
): { ok: true; payload: unknown } | { ok: false; reason: string } {
  switch (button.action) {
    case 'correct_state':
      if (button.patch === undefined) return { ok: false, reason: 'button.missingPatch' }
      return { ok: true, payload: button.patch }
    case 'ask_copilot':
      if (button.question === undefined || button.question.length === 0)
        return { ok: false, reason: 'button.missingQuestion' }
      return { ok: true, payload: button.question }
    case 'send_message':
      if (button.trigger === undefined || button.trigger.length === 0)
        return { ok: false, reason: 'button.missingTrigger' }
      return { ok: true, payload: button.trigger }
    case 'draft_lore':
      if (button.entry === undefined) return { ok: false, reason: 'button.missingEntry' }
      return { ok: true, payload: button.entry }
  }
}

const RISK_PATCH_FIELDS_THRESHOLD = 8
const RISK_PATCH_BYTES_THRESHOLD = 2048

function isRiskyPatch(patch: Record<string, unknown>): boolean {
  const fields = Object.keys(patch).length
  const bytes = JSON.stringify(patch).length
  return fields > RISK_PATCH_FIELDS_THRESHOLD || bytes > RISK_PATCH_BYTES_THRESHOLD
}

/** Buttons — the only place card UI can act. */
function ButtonRow(props: {
  panel: UiPanelDecl
  state: WorldState
  sessionId?: string
  api: StageApi
  allowSendMessage: boolean
  t: Translate
  onConfirm: (action: () => Promise<void>, title: string, description: string) => void
}): ReactNode {
  const [busy, setBusy] = useState('')
  const [sent, setSent] = useState('')
  const run = useCallback(
    async (label: string, action: string, payload: unknown): Promise<void> => {
      setBusy(label)
      try {
        if (
          action === 'correct_state' &&
          props.sessionId !== undefined &&
          payload !== null &&
          typeof payload === 'object'
        ) {
          const patch = payload as Record<string, unknown>
          const next = applyButtonPatch(props.state, patch)
          const execute = async (): Promise<void> => {
            await props.api.correctState(props.sessionId ?? '', next)
          }
          if (isRiskyPatch(patch)) {
            props.onConfirm(
              execute,
              props.t('stage.confirmCorrectStateTitle'),
              props.t('stage.confirmCorrectStateDesc'),
            )
          } else {
            await execute()
          }
        } else if (action === 'ask_copilot' && typeof payload === 'string') {
          props.api.askCopilot(payload)
        } else if (action === 'draft_lore' && props.sessionId !== undefined) {
          const entry = payload as LoreEntry
          props.onConfirm(
            async () => {
              await props.api.draftLore(props.sessionId ?? '', entry)
            },
            props.t('stage.confirmDraftLoreTitle'),
            props.t('stage.confirmDraftLoreDesc'),
          )
        } else if (action === 'send_message' && props.sessionId !== undefined) {
          await props.api.sendMessage(props.sessionId, payload as string)
          setSent(label)
          window.setTimeout(() => setSent(''), 1200)
        }
      } catch (error: unknown) {
        console.error('stage button failed:', error)
      } finally {
        setBusy('')
      }
    },
    [props.api, props.sessionId, props.state, props.allowSendMessage, props.onConfirm, props.t],
  )
  return (
    <div style={S.buttons}>
      {(props.panel.buttons ?? []).map((button) => {
        const resolved = buttonPayload(button)
        const disabled =
          busy.length > 0 ||
          !resolved.ok ||
          (button.action === 'send_message' && !props.allowSendMessage) ||
          props.sessionId === undefined
        const tooltip = !resolved.ok
          ? props.t(resolved.reason)
          : button.action === 'send_message' && !props.allowSendMessage
            ? props.t('stage.sendMessageDisabled')
            : undefined
        const buttonNode = (
          <Button
            key={button.label}
            size="sm"
            variant={
              busy === button.label ? 'ghost' : sent === button.label ? 'toolbar' : 'outline'
            }
            disabled={disabled}
            onClick={() => {
              if (resolved.ok) {
                void run(button.label, button.action, resolved.payload)
              }
            }}
          >
            {busy === button.label
              ? props.t('stage.working')
              : sent === button.label
                ? props.t('stage.sent')
                : button.label}
          </Button>
        )
        return tooltip !== undefined ? (
          <Tooltip key={button.label} label={tooltip} side="bottom">
            {buttonNode}
          </Tooltip>
        ) : (
          buttonNode
        )
      })}
    </div>
  )
}

interface PanelBodyProps {
  panel: UiPanelDecl
  state: WorldState
  sessionId?: string
  cardId: string
  cardName: string
  transcript: string
  api: StageApi
  allowSendMessage: boolean
  t: Translate
  onConfirm: (action: () => Promise<void>, title: string, description: string) => void
}

function PanelBody(props: PanelBodyProps): ReactNode {
  if (props.panel.component === 'app') {
    return (
      <StageFrame
        cardId={props.cardId}
        cardName={props.cardName}
        src={props.panel.src ?? ''}
        state={props.state}
        transcript={props.transcript}
        sessionId={props.sessionId}
        api={props.api}
        t={props.t}
      />
    )
  }
  const inner =
    props.panel.component === 'gauge' ? (
      <Gauge {...props} />
    ) : props.panel.component === 'characterCard' ? (
      <CharacterCard {...props} />
    ) : props.panel.component === 'relationTable' ? (
      <RelationTable {...props} />
    ) : props.panel.component === 'timeline' ? (
      <Timeline {...props} />
    ) : (
      <ButtonRow {...props} />
    )
  if (props.panel.component === 'gauge') return <div style={S.panel}>{inner}</div>
  return (
    <div style={S.panel}>
      {props.panel.title === undefined ? null : <div style={S.panelTitle}>{props.panel.title}</div>}
      {inner}
    </div>
  )
}

function themeStyle(theme?: Record<string, string>): CSSProperties {
  if (theme === undefined) return {}
  const vars: Record<string, string> = {}
  for (const [key, value] of Object.entries(theme)) {
    vars['--rrp-' + key] = value
  }
  return vars as CSSProperties
}

export function StagePanel(props: StagePanelProps): ReactNode {
  const t: Translate = props.t ?? ((key: string) => key)
  const useProjection = typeof props.useProjection === 'function' ? props.useProjection : undefined
  const card = useProjection?.(CARD_KEY) as CardContext | null | undefined
  const live = (useProjection?.(WORLD_STATE_KEY) as WorldState | undefined) ?? null
  const state = live === null ? emptyWorldState() : (filterWorldState(live, 'player') as WorldState)
  const settings = rrpSettingsOf(useProjection?.(RRP_SETTINGS_KEY))
  const [manifest, setManifest] = useState<UiManifest | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [subview, setSubview] = useState<Subview>(() => readStoredView(props.sessionId))
  const [confirm, setConfirm] = useState<{
    open: boolean
    title: string
    description: string
    acknowledged: boolean
    execute: (() => Promise<void>) | undefined
  }>({ open: false, title: '', description: '', acknowledged: false, execute: undefined })

  const baseApi = props.api
  const digest = useProjection?.(WORLDLINE_DIGEST_KEY) as WorldlineDigest | undefined
  const api = useMemo<StageApi | undefined>(() => {
    if (baseApi === undefined) return undefined
    return {
      ...baseApi,
      sendMessage: async (sessionId: string, text: string): Promise<void> => {
        if (props.inputActions === undefined) throw new Error('input machine unavailable')
        props.inputActions.setDraft(text)
        props.inputActions.submit()
      },
    }
  }, [baseApi, props.inputActions])

  // Remember the active subview within this session.
  useEffect(() => {
    writeStoredView(props.sessionId, subview)
  }, [props.sessionId, subview])

  // Load or reload the manifest whenever the card, the reload nonce, or the
  // session changes. Errors are surfaced as a card-level failure with retry.
  useEffect(() => {
    let alive = true
    if (card === null || card === undefined || api === undefined) {
      setManifest(null)
      setError('')
      setLoading(false)
      return
    }
    const cached = MANIFESTS.get(card.id)
    if (cached !== undefined) {
      setManifest(cached)
      const note = MANIFEST_ERRORS.get(card.id)
      setError(note ?? '')
      setLoading(false)
    } else {
      setLoading(true)
      setError('')
    }
    api
      .loadManifest(card.id)
      .then((loaded) => {
        if (!alive) return
        setLoading(false)
        setManifest(loaded)
        if (loaded === null) {
          MANIFESTS.set(card.id, null)
          MANIFEST_ERRORS.delete(card.id)
          setError('')
        } else {
          MANIFESTS.set(card.id, loaded)
          MANIFEST_ERRORS.delete(card.id)
          setError('')
        }
      })
      .catch((error: unknown) => {
        if (!alive) return
        setLoading(false)
        const message = String(error)
        MANIFEST_ERRORS.set(card.id, message)
        MANIFESTS.set(card.id, null)
        setError(message)
      })
    return () => {
      alive = false
    }
  }, [api, card?.id, nonce, props.sessionId])

  // Developer hot-reload: re-read the manifest when the window regains focus or
  // the tab becomes visible again. The route is cheap; this keeps the panel in
  // sync with disk edits without polling.
  useEffect(() => {
    if (!isDev()) return
    const revalidate = (): void => {
      if (card === null || card === undefined) return
      MANIFESTS.delete(card.id)
      MANIFEST_ERRORS.delete(card.id)
      setNonce((n) => n + 1)
    }
    window.addEventListener('focus', revalidate)
    document.addEventListener('visibilitychange', revalidate)
    return () => {
      window.removeEventListener('focus', revalidate)
      document.removeEventListener('visibilitychange', revalidate)
    }
  }, [card?.id])

  const reload = useCallback((): void => {
    if (card === null || card === undefined) return
    api?.forget(card.id)
    MANIFESTS.delete(card.id)
    MANIFEST_ERRORS.delete(card.id)
    setNonce((n) => n + 1)
  }, [api, card?.id])

  const requestConfirm = useCallback(
    (execute: () => Promise<void>, title: string, description: string): void => {
      setConfirm({ open: true, title, description, acknowledged: false, execute })
    },
    [],
  )

  if (card === null || card === undefined)
    return (
      <div style={S.wrap}>
        <div style={S.muted}>{t('stage.noCard')}</div>
      </div>
    )

  const panels = visiblePanels(manifest, state)
  const appPanels = panels.filter((p) => p.component === 'app')
  const l1Panels = panels.filter((p) => p.component !== 'app')
  const hasApp = appPanels.length > 0
  const transcript = digest?.turns[digest.turns.length - 1]?.prose ?? ''

  if (api === undefined) {
    return (
      <div style={S.wrap}>
        <div style={S.muted}>{t('stage.noCard')}</div>
      </div>
    )
  }

  const renderPanel = (panel: UiPanelDecl): ReactNode => (
    <PanelBody
      key={panel.id}
      panel={panel}
      state={state}
      sessionId={props.sessionId}
      cardId={card.id}
      cardName={card.name}
      transcript={transcript}
      api={api}
      allowSendMessage={settings.allowSendMessage}
      t={t}
      onConfirm={requestConfirm}
    />
  )

  const showApp = hasApp && subview === APP_VIEW_KEY
  const showL1Grid = !hasApp || subview === L1_VIEW_KEY || drawerOpen

  return (
    <div style={{ ...S.wrap, ...themeStyle(manifest?.theme) }}>
      <div style={S.head}>
        <span style={S.headTitle}>{manifest?.title ?? card.name}</span>
        <Button size="sm" variant="ghost" title={t('stage.reload')} onClick={reload}>
          <IconRefreshOutline16 />
        </Button>
      </div>

      {loading && manifest === null ? (
        <div style={S.skeleton} data-rrp-skeleton="">
          <div style={S.skeletonTitle} />
          <div style={S.skeletonGrid}>
            <div style={S.skeletonCard} />
            <div style={S.skeletonCard} />
            <div style={S.skeletonCard} />
          </div>
        </div>
      ) : null}

      {error.length > 0 ? (
        <div style={S.errorCard}>
          <div style={S.errorTitle}>{t('stage.loadFailed')}</div>
          <DisclosureButton t={t} detail={error} />
          <Button size="sm" variant="outline" onClick={reload}>
            {t('stage.retry')}
          </Button>
        </div>
      ) : null}

      {!loading && error.length === 0 && panels.length === 0 ? (
        <div style={S.muted}>{t(manifest === null ? 'stage.noUi' : 'stage.noPanels')}</div>
      ) : null}

      {error.length === 0 && panels.length > 0 ? (
        <div style={S.stage}>
          {hasApp ? (
            <div style={S.viewToggle}>
              <Button
                size="sm"
                variant={subview === APP_VIEW_KEY ? 'primary' : 'outline'}
                onClick={() => setSubview(APP_VIEW_KEY)}
              >
                {t('stage.appView')}
              </Button>
              <Button
                size="sm"
                variant={subview === L1_VIEW_KEY ? 'primary' : 'outline'}
                onClick={() => {
                  setSubview(L1_VIEW_KEY)
                  setDrawerOpen(true)
                }}
              >
                {t('stage.l1View')}
              </Button>
            </div>
          ) : null}

          {showApp ? <div style={S.appMain}>{renderPanel(appPanels[0] as UiPanelDecl)}</div> : null}

          {showL1Grid ? (
            <div style={drawerOpen ? S.drawerOpen : S.grid}>
              {l1Panels.map((panel) => (
                <div key={panel.id} style={panel.span === 2 ? S.span2 : S.span1}>
                  {renderPanel(panel)}
                </div>
              ))}
            </div>
          ) : null}

          {hasApp && subview === APP_VIEW_KEY && !drawerOpen ? (
            <button
              type="button"
              style={S.drawerHandle}
              onClick={() => setDrawerOpen(true)}
              title={t('stage.openDrawer')}
            >
              {t('stage.l1Panels')}
            </button>
          ) : null}

          {drawerOpen ? (
            <Button size="sm" variant="ghost" onClick={() => setDrawerOpen(false)}>
              {t('stage.collapseDrawer')}
            </Button>
          ) : null}
        </div>
      ) : null}

      <RiskConfirmation
        open={confirm.open}
        title={confirm.title}
        description={confirm.description}
        acknowledgeLabel={t('stage.riskAcknowledge')}
        cancelLabel={t('stage.cancel')}
        closeLabel={t('stage.close')}
        confirmLabel={t('stage.confirm')}
        acknowledged={confirm.acknowledged}
        onAcknowledgedChange={(acknowledged) => setConfirm((c) => ({ ...c, acknowledged }))}
        onCancel={() => setConfirm((c) => ({ ...c, open: false, execute: undefined }))}
        onConfirm={() => {
          const execute = confirm.execute
          setConfirm((c) => ({ ...c, open: false, execute: undefined, acknowledged: false }))
          if (execute !== undefined) {
            void execute().catch((error: unknown) => {
              console.error('confirmed stage action failed:', error)
            })
          }
        }}
      />
    </div>
  )
}

function DisclosureButton(props: { t: Translate; detail: string }): ReactNode {
  const [open, setOpen] = useState(false)
  return (
    <div style={S.disclosure}>
      <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
        {open ? props.t('stage.hideDetail') : props.t('stage.showDetail')}
      </Button>
      {open ? <div style={S.errorDetail}>{props.detail}</div> : null}
    </div>
  )
}

/** Register the Stage tab next to 对话/轨迹/世界线. */
export function registerStageTab(ctx: RrpClientContext): void {
  const t = ctx.locale.bind('rrp') as Translate
  const sidebarRight = ctx.sidebarRight

  const api: StageApi = {
    async loadManifest(cardId) {
      if (MANIFESTS.has(cardId)) return MANIFESTS.get(cardId) ?? null
      try {
        const response = await fetch(RRP_ROUTES.cardUi + '?card=' + encodeURIComponent(cardId))
        const body = (await response.json()) as CardUiResponse
        if ('manifest' in body) {
          MANIFESTS.set(cardId, body.manifest)
          MANIFEST_ERRORS.delete(cardId)
          return body.manifest
        }
        if ('error' in body) {
          MANIFEST_ERRORS.set(cardId, body.error)
          MANIFESTS.set(cardId, null)
          return null
        }
        MANIFESTS.set(cardId, null)
        return null
      } catch (error: unknown) {
        MANIFEST_ERRORS.set(cardId, String(error))
        MANIFESTS.set(cardId, null)
        return null
      }
    },
    async correctState(sessionId, state) {
      const response = await fetch(RRP_ROUTES.worldState, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, state } as { sessionId: string; state: WorldState }),
      })
      if (!response.ok) throw new Error(response.status + ' ' + (await response.text()))
    },
    askCopilot(question) {
      askCopilot(question)
      sidebarRight.openTab('dsh-rrp-copilot')
    },
    async draftLore(sessionId, entry) {
      const response = await fetch(RRP_ROUTES.lore, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, action: 'stage', draft: entry }),
      })
      if (!response.ok) throw new Error(response.status + ' ' + (await response.text()))
    },
    async sendMessage() {
      throw new Error('sendMessage must be wired by StagePanel from inputActions')
    },
    forget(cardId) {
      MANIFESTS.delete(cardId)
      MANIFEST_ERRORS.delete(cardId)
    },
  }

  ctx.slots.inject('conversation.view', () =>
    ctx.slots.register(
      {
        name: 'conversation.view',
        id: 'dsh-rrp/stage',
        order: 30,
        locale: 'rrp',
        label: () => t('stage.view'),
        inject: (sessionId: unknown) => ({ t, sessionId, api }),
      },
      StagePanel,
    ),
  )
}

const S: Record<string, CSSProperties> = {
  wrap: { padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
  headTitle: { fontSize: '14px', fontWeight: 650, letterSpacing: '0.02em' },
  stage: { display: 'flex', flexDirection: 'column', gap: '12px' },
  viewToggle: { display: 'flex', gap: '8px' },
  appMain: { minHeight: '120px' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '12px',
    alignContent: 'start',
  },
  drawerOpen: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '12px',
    alignContent: 'start',
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid rgba(128,128,128,0.20)',
    background: 'rgba(128,128,128,0.05)',
  },
  drawerHandle: {
    alignSelf: 'flex-start',
    fontSize: '11px',
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid rgba(128,128,128,0.25)',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
  },
  span1: { minWidth: 0 },
  span2: { gridColumn: 'span 2', minWidth: 0 },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid rgba(128,128,128,0.20)',
    background: 'rgba(128,128,128,0.05)',
    height: '100%',
    boxSizing: 'border-box',
  },
  panelTitle: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    opacity: 0.6,
  },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  fieldHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    fontSize: '12px',
  },
  gaugeValue: {
    fontVariantNumeric: 'tabular-nums',
    fontSize: '16px',
    fontWeight: 700,
    lineHeight: 1,
  },
  gaugeTrack: {
    height: '8px',
    borderRadius: '4px',
    background: 'rgba(128,128,128,0.20)',
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: '4px',
    background: 'linear-gradient(90deg, rgba(128,150,220,0.75), rgba(150,190,235,0.95))',
    transition: 'width 260ms ease',
  },
  gaugeBounds: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '10px',
    opacity: 0.45,
    fontVariantNumeric: 'tabular-nums',
  },
  charList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  char: { display: 'flex', flexDirection: 'column', gap: '3px' },
  charHead: { display: 'flex', alignItems: 'center', gap: '8px' },
  charName: { fontSize: '13px', fontWeight: 650 },
  charLine: { fontSize: '12px', opacity: 0.72, lineHeight: 1.55 },
  rows: { display: 'flex', flexDirection: 'column', gap: '6px' },
  row: { display: 'flex', gap: '8px', fontSize: '12px', alignItems: 'baseline' },
  rowPair: { opacity: 0.72, fontVariantNumeric: 'tabular-nums' },
  rowLabel: { fontWeight: 650 },
  sceneLine: { fontSize: '13px', lineHeight: 1.65 },
  buttons: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  muted: { fontSize: '12px', opacity: 0.55, lineHeight: 1.6 },
  skeleton: { display: 'flex', flexDirection: 'column', gap: '12px' },
  skeletonTitle: {
    height: '18px',
    width: '35%',
    borderRadius: '4px',
    background: 'rgba(128,128,128,0.15)',
  },
  skeletonGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' },
  skeletonCard: {
    height: '80px',
    borderRadius: '10px',
    background: 'rgba(128,128,128,0.10)',
  },
  errorCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px 14px',
    borderRadius: '10px',
    background: 'rgba(200,80,80,0.12)',
    fontSize: '12px',
    lineHeight: 1.6,
  },
  errorTitle: { fontWeight: 650 },
  errorDetail: {
    opacity: 0.72,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'monospace',
    fontSize: '11px',
  },
  disclosure: { display: 'flex', flexDirection: 'column', gap: '6px' },
}
