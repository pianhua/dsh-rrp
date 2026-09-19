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
import type { CardContext, CardMeta, CardPack } from './card-types.ts'
import type { WorldState } from './world-state.ts'
import type { WorldlineTree } from './worldline-tree.ts'

// ── Paths (host registers these; clients fetch these) ──────────────────────
export const RRP_ROUTES = {
  cards: '/dsh-rrp/cards',
  cardOne: '/dsh-rrp/cards/one',
  start: '/dsh-rrp/start',
  worldState: '/dsh-rrp/world-state',
  activity: '/dsh-rrp/activity',
  lore: '/dsh-rrp/lore',
  copilot: '/dsh-rrp/copilot',
  copilotUndo: '/dsh-rrp/copilot/undo',
  worldlineTree: '/dsh-rrp/worldlines/tree',
  worldlineHidden: '/dsh-rrp/worldlines/hidden',
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
}

export interface CorrectionResponse {
  ok: true
  /** True when the posted state equalled the current slice and nothing was appended. */
  unchanged?: boolean
}

// ── /dsh-rrp/cards ──────────────────────────────────────────────────────────
export interface CardListResponse {
  cards: CardMeta[]
}

export interface CardOneResponse {
  card: CardPack
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
  updatedAt: string
}

/** One conditional-injection trigger and whether it currently hits. */
export interface LoreTriggerView {
  name: string
  active: boolean
}

export interface LoreGetResponse {
  skills: LoreEntryView[]
  pending: { name: string; description: string; body: string } | null
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
 * The whole map in one shot, folded server-side over LIVE sessions only
 * (the host keeps unloaded sessions off the service; opening one from the
 * host roster brings it into the map). Node titles arrive empty and are
 * filled client-side from the host's own session list display names.
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

// ── /dsh-rrp/copilot ────────────────────────────────────────────────────────
/** One executed action as recorded on the turn (for the panel's action card). */
export type CopilotTurnAction =
  | { kind: 'world-state'; digest: string }
  | { kind: 'lore'; name: string }
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

export interface CopilotHistoryView {
  turns: CopilotTurn[]
  undoCount: number
}

export interface CopilotUndoResponse {
  ok: true
  digest: string
  undoCount: number
}

// ── Copilot SSE event vocabulary ────────────────────────────────────────────
/**
 * Stream semantics: `chunk` may repeat, `action` may repeat, and the stream
 * carries EXACTLY ONE terminal frame — `done` (success) or `error` — after
 * which the server closes the response. A stream that ends without a terminal
 * frame is a transport failure; the client must reload history to converge.
 */
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
