/**
 * dsh-rrp — the shared HTTP route contract (issue #22).
 *
 * One source of truth for the paths, JSON request/response shapes and the
 * Copilot SSE event vocabulary spoken between our host routes and our client
 * panels. Server and client must never re-declare these strings or shapes by
 * hand again. Dependency-free (no node imports) so both the host bundle and
 * the browser bundle can import it. This is a CONTRACT, not a transport:
 * the host webServer + plain fetch/SSE stay exactly as they are — no RPC
 * framework, per the personal-toy positioning.
 */
import type { CardContext, CardMeta, CardPackPlayerView } from './card-types.ts'
import type { StewardProposal } from './steward-proposals.ts'
import type { WorldState, WorldStateDiagnostic, WorldStateDiff } from './world-state.ts'
import type { WorldStateTimeline } from './world-state-timeline.ts'
import type { WorldlineTree } from './worldline-tree.ts'
import type { UiManifest } from './ui-schema.ts'

export type { StewardProposal } from './steward-proposals.ts'

// ── Paths (host registers these; clients fetch these) ──────────────────────
export const RRP_ROUTES = {
  cards: '/dsh-rrp/cards',
  cardOne: '/dsh-rrp/cards/one',
  cardImport: '/dsh-rrp/cards/import',
  start: '/dsh-rrp/start',
  worldState: '/dsh-rrp/world-state',
  worldStateTimeline: '/dsh-rrp/world-state-timeline',
  activity: '/dsh-rrp/activity',
  lore: '/dsh-rrp/lore',
  copilot: '/dsh-rrp/copilot',
  copilotUndo: '/dsh-rrp/copilot/undo',
  copilotProposals: '/dsh-rrp/copilot/proposals',
  worldlineTree: '/dsh-rrp/worldlines/tree',
  worldlineHidden: '/dsh-rrp/worldlines/hidden',
  cardUi: '/dsh-rrp/card-ui',
  novelExport: '/dsh-rrp/export/novel',
  cardWorkspace: '/dsh-rrp/card-workspace',
} as const

// ── Shared JSON vocabulary ──────────────────────────────────────────────────

/** The only error body any RRP route may return on a non-2xx status. */
export interface RrpErrorBody {
  error: string
}

/** Query every session-scoped route takes. */
export interface RrpSessionQuery {
  sessionId: string
}

// ── /dsh-rrp/cards/import (tavern card conversion) ─────────────────────────
export interface CardImportRequest {
  /** `png` = card embedded in a PNG; `json` = tavern v2/v3 export. */
  kind: 'png' | 'json'
  /** Base64 of the file (png) or of its JSON text. */
  data: string
}

/** The card as written into the user card root, ready to open. */
export interface CardImportResponse {
  ok: true
  id: string
  name: string
}

// ── /dsh-rrp/start ──────────────────────────────────────────────────────────
export interface StartRequest {
  sessionId: string
  state?: WorldState
  /** Raw opening template; `{{player.*}}` is interpolated host-side BEFORE the append. */
  opening?: string
  card?: CardContext
}

export interface StartResponse {
  ok: true
  cardWritten: boolean
  stateWritten: boolean
  openingWritten: 'assistant' | 'notice' | 'none'
}

// ── /dsh-rrp/world-state (player correction) ────────────────────────────────
export interface CorrectionRequest {
  sessionId: string
  state: WorldState
  /** Return the diff and diagnostics without appending a state snapshot. */
  preview?: boolean
  /** Optional player-facing explanation stored in timeline provenance. */
  evidence?: string
  /** Only supplied when the player explicitly confirms reference downgrade. */
  confirmDeleteIds?: string[]
  /** Host-provided turn metadata; omitted means unknown. */
  storyTurn?: number
}

export interface CorrectionResponse {
  ok: true
  /** True when the posted state equalled the current slice and nothing was appended. */
  unchanged?: boolean
  /** True when this was a preview-only request. */
  preview?: boolean
  diff?: WorldStateDiff
  diagnostics?: WorldStateDiagnostic[]
}

export interface WorldStateTimelineResponse {
  timeline: WorldStateTimeline
}

// ── /dsh-rrp/cards ──────────────────────────────────────────────────────────
export interface CardListResponse {
  cards: CardMeta[]
}

export interface CardOneResponse {
  card: CardPackPlayerView
}

// ── /dsh-rrp/lore ───────────────────────────────────────────────────────────
export type LoreAction = 'draft' | 'confirm' | 'discard' | 'manual'

export interface LorePostRequest {
  sessionId: string
  action: LoreAction
  /** action=draft: optional topic hint for the Scribe. */
  topic?: string
  /** action=manual / confirm fallback: a client-composed draft. */
  draft?: { name: string; description: string; body: string }
}

/** One lore entry as served to the panel. */
export interface LoreEntryView {
  name: string
  description: string
  bytes: number
}

/** One staged Scribe draft, waiting for the player's confirmation. */
export interface LoreDraftView {
  name: string
  description: string
  body: string
}

/** One conditional-injection trigger and whether it currently hits. */
export interface LoreTriggerView {
  name: string
  active: boolean
}

export interface LoreGetResponse {
  skills: LoreEntryView[]
  pending: LoreDraftView | null
  drafting: boolean
  triggers: LoreTriggerView[]
  injectedChars: number
}

export interface LoreDraftResponse {
  ok: true
  drafting: boolean
}

export interface LoreConfirmResponse {
  ok: true
  skill: LoreEntryView
}

export interface LoreDeleteResponse {
  ok: boolean
  removed: boolean
}

// ── /dsh-rrp/worldlines (issue #28 save map) ───────────────────────────────
/**
 * The whole map in one shot, folded server-side over live sessions plus COLD
 * skeleton placeholders for persisted-but-unloaded RP sessions (issue #29,
 * via the host's session-query service; absent = live-only map). Node titles
 * arrive empty for live nodes and are filled client-side from the host's own
 * session list display names; skeleton nodes carry their cold-read titles and
 * `loaded: false`, and the client must not overwrite them from the roster.
 */
export interface WorldlineTreeResponse {
  trees: WorldlineTree[]
}

export interface WorldlineHiddenResponse {
  hidden: string[]
}

export interface WorldlineHiddenSetRequest {
  sessionId: string
  hidden: boolean
}

// ── /dsh-rrp/card-ui ────────────────────────────────────────────────────────
/** One card's validated UI declaration; `absent` is the normal plain-card case. */
export type CardUiResponse = { manifest: UiManifest } | { absent: true } | RrpErrorBody

// ── /dsh-rrp/card-workspace (issue #37) ─────────────────────────────────────
/**
 * Idempotent ensure of the card's own workspace (「一卡一区」): the host
 * registry adopts `<dshHome>/.dsh-rrp/saves/<cardId>` once, later calls
 * return the existing record; a drifted title (renamed card) is corrected.
 */
export interface CardWorkspaceRequest {
  cardId: string
  cardName: string
}

export interface CardWorkspaceResponse {
  ok: true
  workspaceId: string
  path: string
  created: boolean
}

// ── /dsh-rrp/copilot ────────────────────────────────────────────────────────
/** One executed action as recorded on the turn (for the panel's action card). */
export type CopilotTurnAction =
  | { kind: 'world-state'; digest: string }
  | { kind: 'lore'; name: string }
  /** `subject` is the dynamic half (file path / note title); the panel owns the fixed wording. */
  | { kind: 'proposal'; proposalKind: 'card-edit' | 'doc-note' | 'world-state'; subject: string }
  | { kind: 'failed'; error: string }

export interface CopilotTurn {
  role: 'player' | 'copilot'
  text: string
  at: string
  actions?: CopilotTurnAction[]
}

export interface CopilotAskRequest {
  sessionId: string
  message: string
}

export interface CopilotWorldStateProposal {
  id: string
  digest: string
  at: string
  evidence?: string
  changes: WorldStateDiff['changes']
}

export interface CopilotHistoryView {
  turns: CopilotTurn[]
  undoCount: number
  /** Steward proposals staged for player confirmation (issue #33 P1). */
  proposals: StewardProposal[]
  /** WorldState actions staged until the player explicitly confirms them. */
  worldStateProposals: CopilotWorldStateProposal[]
}

export interface CopilotUndoResponse {
  ok: true
  digest: string
  undoCount: number
}

// ── /dsh-rrp/copilot/proposals (issue #33 P1) ──────────────────────────────
export interface CopilotProposalRequest {
  sessionId: string
  action: 'confirm' | 'discard'
  id: string
}

export interface CopilotProposalResponse {
  ok: boolean
  /** action=confirm 的落盘/已阅摘要。 */
  summary?: string
  /** 操作后的最新提案列表（面板直接刷新）。 */
  proposals: StewardProposal[]
}

// ── Copilot SSE event vocabulary ────────────────────────────────────────────
/**
 * Stream semantics: `chunk` may repeat, `action` may repeat, and the stream
 * carries EXACTLY ONE terminal frame — `done` (success) or `error` — after
 * which the server closes the response. A stream that ends without a terminal
 * frame is a transport failure; the client must reload history to converge.
 */
/** The machine-readable 503 reason: this session has no provider/model route. */
export const COPILOT_NO_MODEL_ROUTE = 'no provider/model route'

export const COPILOT_SSE = {
  chunk: 'chunk',
  action: 'action',
  done: 'done',
  error: 'error',
} as const

export interface CopilotSseChunk {
  text: string
}

export interface CopilotSseAction {
  applied: CopilotTurnAction[]
}

export interface CopilotSseDone {
  turn: CopilotTurn
  undoCount: number
}

export interface CopilotSseError {
  error: string
}

/** Whether an event name ends the stream (either outcome). */
export function isTerminalCopilotEvent(event: string): boolean {
  return event === COPILOT_SSE.done || event === COPILOT_SSE.error
}

// ── Route URLs (the panels build them, the routes parse them) ───────────────
/**
 * One route path carrying `sessionId` plus any extra query params, encoded the
 * way the host routes read them back (`host-faces.queryOf`). Seven panels used
 * to hand-stringify `'?sessionId=' + encodeURIComponent(...)`.
 */
export function routeUrl(
  path: string,
  sessionId: string,
  params: Record<string, string> = {},
): string {
  return path + '?' + new URLSearchParams({ sessionId, ...params }).toString()
}

// ── SSE frame codec (server encodes, client drains — one implementation) ───
/** Serialize one SSE frame exactly as the host route writes it. */
export function encodeSseFrame(event: string, data: unknown): string {
  return 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'
}

/**
 * Parse complete SSE frames out of a receive buffer; returns the unconsumed
 * tail (a frame may be split across network chunks). A frame with no event
 * name, no data, or a JSON body that will not parse is skipped — one
 * malformed frame must never sink the stream.
 */
export function drainSse(buffer: string, onEvent: (event: string, data: unknown) => void): string {
  const frames = buffer.split('\n\n')
  const rest = frames.pop() ?? ''
  for (const frame of frames) {
    let event = ''
    let data = ''
    for (const line of frame.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7)
      if (line.startsWith('data: ')) data = line.slice(6)
    }
    if (event.length === 0 || data.length === 0) continue
    try {
      onEvent(event, JSON.parse(data) as unknown)
    } catch {
      /* malformed frame: skip it, keep the stream */
    }
  }
  return rest
}
