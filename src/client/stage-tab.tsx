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
import { Button, IconRefreshOutline16, Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { CARD_KEY, type CardContext } from '../card-types.ts'
import { RRP_ROUTES, type CardUiResponse } from '../route-contract.ts'
import { WORLD_STATE_KEY, emptyWorldState, type WorldState } from '../world-state.ts'
import {
  applyButtonPatch,
  readCharacters,
  readGaugeValue,
  visiblePanels,
  type UiManifest,
  type UiPanelDecl,
} from '../ui-schema.ts'
import { WORLDLINE_DIGEST_KEY, type WorldlineDigest } from '../worldline-digest.ts'
import { StageFrame } from './stage-frame.tsx'
import { askCopilot } from './copilot-prefill.ts'
import type { RrpClientContext, RrpUseProjection } from './context-types.ts'
import type { StageApi, Translate } from './stage-types.ts'

export type { StageApi, Translate }

interface StagePanelProps {
  t?: Translate
  sessionId?: string
  api?: StageApi
  useProjection?: RrpUseProjection
}

/** Manifest cache keyed by card id, plus one error note for the author. */
const MANIFESTS = new Map<string, UiManifest | null>()
const MANIFEST_ERRORS = new Map<string, string>()

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
  const rows = readCharacters(props.panel.bind, props.state)
  if (rows.length === 0) return <div style={S.muted}>{props.t('stage.noData')}</div>
  return (
    <div style={S.charList}>
      {rows.map((row) => {
        const entry = (row.state ?? {}) as Record<string, unknown>
        const lines = ['mood', 'condition', 'appearance']
          .map((key) => (typeof entry[key] === 'string' ? (entry[key] as string) : undefined))
          .filter((line): line is string => line !== undefined && line.length > 0)
        return (
          <div key={row.name} style={S.char}>
            <div style={S.charHead}>
              <span style={S.charName}>{row.name}</span>
              {typeof entry.affinity === 'number' ? <Pill>{String(entry.affinity)}</Pill> : null}
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
  const relations = (props.state.relations ?? []) as Array<{ a: string; b: string; label: string }>
  if (relations.length === 0) return <div style={S.muted}>{props.t('stage.noData')}</div>
  return (
    <div style={S.rows}>
      {relations.map((rel) => (
        <div key={rel.a + '|' + rel.b + '|' + rel.label} style={S.row}>
          <span style={S.rowPair}>
            {rel.a} × {rel.b}
          </span>
          <span style={S.rowLabel}>{rel.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Where and when the story stands. */
function Timeline(props: { panel: UiPanelDecl; state: WorldState; t: Translate }): ReactNode {
  const scene = (props.state.scene ?? {}) as Record<string, unknown>
  const parts = ['time', 'location', 'weather']
    .map((key) => (typeof scene[key] === 'string' ? (scene[key] as string) : undefined))
    .filter((part): part is string => part !== undefined && part.length > 0)
  if (parts.length === 0) return <div style={S.muted}>{props.t('stage.noData')}</div>
  return <div style={S.sceneLine}>{parts.join(' · ')}</div>
}

/** Buttons — the only place card UI can act. */
function ButtonRow(props: {
  panel: UiPanelDecl
  state: WorldState
  sessionId?: string
  api: StageApi
  t: Translate
}): ReactNode {
  const [busy, setBusy] = useState('')
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
          await props.api.correctState(
            props.sessionId,
            applyButtonPatch(props.state, payload as Record<string, unknown>),
          )
        } else if (action === 'ask_copilot' && typeof payload === 'string') {
          props.api.askCopilot(payload)
        }
      } finally {
        setBusy('')
      }
    },
    [props.api, props.sessionId, props.state],
  )
  return (
    <div style={S.buttons}>
      {(props.panel.buttons ?? []).map((button) => (
        <Button
          key={button.label}
          size="sm"
          variant={busy === button.label ? 'ghost' : 'outline'}
          disabled={busy.length > 0}
          onClick={() => {
            void run(
              button.label,
              button.action,
              button.action === 'correct_state' ? button.patch : button.question,
            )
          }}
        >
          {busy === button.label ? props.t('stage.working') : button.label}
        </Button>
      ))}
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
  t: Translate
}

function PanelBody(props: PanelBodyProps): ReactNode {
  if (props.panel.component === 'app') {
    // A card-authored page owns its whole surface; no panel card around it.
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
  // Every panel sits in a card; a gauge carries its own label row, so it
  // doesn't repeat the title above it.
  if (props.panel.component === 'gauge') return <div style={S.panel}>{inner}</div>
  return (
    <div style={S.panel}>
      {props.panel.title === undefined ? null : <div style={S.panelTitle}>{props.panel.title}</div>}
      {inner}
    </div>
  )
}

export function StagePanel(props: StagePanelProps): ReactNode {
  const t: Translate = props.t ?? ((key: string) => key)
  const useProjection = typeof props.useProjection === 'function' ? props.useProjection : undefined
  const card = useProjection?.(CARD_KEY) as CardContext | null | undefined
  const live = (useProjection?.(WORLD_STATE_KEY) as WorldState | undefined) ?? null
  const state = live ?? emptyWorldState()
  const [manifest, setManifest] = useState<UiManifest | null>(null)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)

  const api = props.api
  useEffect(() => {
    let alive = true
    if (card === null || card === undefined || api === undefined) {
      setManifest(null)
      setError('')
      return
    }
    setError('')
    void api.loadManifest(card.id).then((loaded) => {
      if (!alive) return
      setManifest(loaded)
      const note = MANIFEST_ERRORS.get(card.id)
      if (note !== undefined) setError(note)
    })
    return () => {
      alive = false
    }
  }, [api, card?.id, nonce])

  if (card === null || card === undefined)
    return (
      <div style={S.wrap}>
        <div style={S.muted}>{t('stage.noCard')}</div>
      </div>
    )
  const panels = visiblePanels(manifest, state)
  // The tail of the latest turn, so a card app can react to what just happened
  // without re-reading the transcript itself.
  const digest = useProjection?.(WORLDLINE_DIGEST_KEY) as WorldlineDigest | undefined
  // The digest entry is already excerpt-bounded at the fold (PROSE_CHARS), so
  // the card app gets the latest turn's tail as-is.
  const transcript = digest?.turns[digest.turns.length - 1]?.prose ?? ''
  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <span style={S.headTitle}>{manifest?.title ?? card.name}</span>
        <Button
          size="sm"
          variant="ghost"
          title={t('stage.reload')}
          onClick={() => {
            api?.forget(card.id)
            setNonce((n) => n + 1)
          }}
        >
          <IconRefreshOutline16 />
        </Button>
      </div>
      {error.length === 0 ? null : <div style={S.error}>{error}</div>}
      {error.length === 0 && panels.length === 0 ? (
        <div style={S.muted}>{t(manifest === null ? 'stage.noUi' : 'stage.noPanels')}</div>
      ) : null}
      <div style={S.grid}>
        {panels.map((panel) => (
          <div key={panel.id} style={panel.span === 2 ? S.span2 : S.span1}>
            <PanelBody
              panel={panel}
              state={state}
              sessionId={props.sessionId}
              cardId={card.id}
              cardName={card.name}
              transcript={transcript}
              api={api as StageApi}
              t={t}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Register the Stage tab next to 对话/轨迹/世界线. */
export function registerStageTab(ctx: RrpClientContext): void {
  const t = ctx.locale.bind('rrp') as Translate
  const sidebarRight = ctx.get('sidebarRight') as { openTab?(kind: string): void } | undefined

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
      } catch {
        return null
      }
    },
    async correctState(sessionId, state) {
      await fetch(RRP_ROUTES.worldState, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, state }),
      })
    },
    askCopilot(question) {
      askCopilot(question)
      sidebarRight?.openTab?.('dsh-rrp-copilot')
    },
    forget(cardId) {
      MANIFESTS.delete(cardId)
      MANIFEST_ERRORS.delete(cardId)
    },
  }

  ctx.effect(() => {
    const dispose = ctx.slots.inject('conversation.view', () =>
      ctx.slots.register(
        {
          name: 'conversation.view',
          id: 'dsh-rrp/stage',
          order: 30,
          locale: 'rrp',
          label: () => t('stage.view'),
          inject: (sessionId: unknown) => ({ t, sessionId, api }),
        },
        StagePanel as never,
      ),
    )
    return dispose
  }, 'dsh-rrp: stage tab')
}

const S: Record<string, CSSProperties> = {
  wrap: { padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
  headTitle: { fontSize: '14px', fontWeight: 650, letterSpacing: '0.02em' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '12px',
    alignContent: 'start',
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
  error: {
    fontSize: '12px',
    lineHeight: 1.6,
    padding: '8px 10px',
    borderRadius: '8px',
    background: 'rgba(200,80,80,0.12)',
  },
}
