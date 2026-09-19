/**
 * dsh-rrp — the WorldlineDigest session-projection unit (issue #28).
 *
 * Same discipline as the transcript unit: fold incrementally, return the SAME
 * state reference for unrelated events (the registry's Object.is gate does
 * zero downstream work), cap the tail. The map client reads this via the
 * facts route; nothing here ever scans the log.
 */
import { z } from 'zod'
import { rrpPayloadOf } from '../state-payload.ts'
import { emptyWorldlineDigest, WORLDLINE_DIGEST_KEY, type WorldlineBadge, type WorldlineDigest } from '../worldline-digest.ts'

/** Slot budgets: the map shows dozens of lines, keep every node small. */
const TURN_CAP = 500
const PLAYER_CHARS = 120
const PROSE_CHARS = 400

const badgeSchema = z.object({
  location: z.string().optional(),
  time: z.string().optional(),
  affinity: z.array(z.object({ name: z.string(), value: z.number() })).max(3).optional(),
  summary: z.string().optional(),
})

const turnSchema = z.object({
  turn: z.number().int().min(0),
  seq: z.number().int().min(0),
  player: z.string().max(PLAYER_CHARS),
  prose: z.string().max(PROSE_CHARS),
  badge: badgeSchema.optional(),
})

export const digestSchema = z.object({
  turns: z.array(turnSchema).max(TURN_CAP),
  pending: badgeSchema.optional(),
})

const worldStatePayloadSchema = z.object({
  scene: z.record(z.string(), z.string()).optional(),
  characters: z.record(z.string(), z.object({ affinity: z.number().optional() }).passthrough()).optional(),
})

const summaryPayloadSchema = z.object({
  goal: z.string().optional(),
  conflict: z.string().optional(),
})

/** Text of either message shape: user data IS the message; assistant wraps it in `message`. */
function textOf(event: { data?: unknown }): string {
  const data = event.data as { content?: unknown; message?: { content?: unknown } } | undefined
  const blocks = Array.isArray(data?.content) ? data.content : Array.isArray(data?.message?.content) ? data.message?.content : null
  if (blocks === null) return ''
  return blocks.map((block) => (block as { text?: unknown }).text ?? '').join('')
}

/** True for plugin-issued messages WITHOUT an rrp payload (notices, fallbacks). */
function isPluginNotice(event: { type: string; data?: unknown }): boolean {
  const source = (event.data as { source?: { kind?: unknown } } | undefined)?.source
  return source?.kind === 'plugin' && rrpPayloadOf(event) === undefined
}

/** Read the badge fields a state publish contributes (defensive: any shape passes through). */
function badgeFromState(raw: unknown, base: WorldlineBadge | undefined): WorldlineBadge | undefined {
  const parsed = worldStatePayloadSchema.safeParse(raw)
  if (!parsed.success) return base
  const next: WorldlineBadge = { ...base }
  const location = parsed.data.scene?.location
  const time = parsed.data.scene?.time
  if (typeof location === 'string' && location.length > 0) next.location = location
  if (typeof time === 'string' && time.length > 0) next.time = time
  if (parsed.data.characters !== undefined) {
    const top = Object.entries(parsed.data.characters)
      .map(([name, entry]) => ({ name, value: entry.affinity ?? 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
    if (top.length > 0) next.affinity = top
  }
  return next
}

/** The projection definition registered into `ctx.sessionProjections`. */
export const worldlineDigestProjection = {
  key: WORLDLINE_DIGEST_KEY,
  stateSchema: digestSchema,
  stateVersion: 1,
  init: (): WorldlineDigest => emptyWorldlineDigest(),
  apply: (state: WorldlineDigest, event: { type: string; data?: unknown; seq?: number }): WorldlineDigest => {
    if (event.type !== 'user/message' && event.type !== 'assistant/message') return state
    const seq = event.seq
    if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0) return state

    const payload = rrpPayloadOf(event)
    if (payload !== undefined) {
      // State-bearing writes only move the badge watermark forward.
      let pending = state.pending
      if (payload.worldState !== undefined) pending = badgeFromState(payload.worldState, pending)
      if (payload.summary !== undefined) {
        const parsed = summaryPayloadSchema.safeParse(payload.summary)
        if (parsed.success) {
          const line = parsed.data.conflict ?? parsed.data.goal
          if (typeof line === 'string' && line.length > 0) pending = { ...pending, summary: line.slice(0, 120) }
        }
      }
      if (pending === undefined || pending === state.pending) return state
      // The watermark belongs to the turn that just ended (state is published
      // after the prose), so write it back onto the tail node as well.
      const turns = state.turns.length > 0
        ? state.turns.map((entry, index) => (index === state.turns.length - 1 ? { ...entry, badge: pending } : entry))
        : state.turns
      return { turns, pending }
    }

    if (isPluginNotice(event)) return state
    const text = textOf(event).trim()
    if (event.type === 'assistant/message') {
      // The turn's prose opening; later assistant steps never overwrite it.
      if (text.length === 0 || state.turns.length === 0) return state
      const last = state.turns[state.turns.length - 1]!
      if (last.prose.length > 0) return state
      const turns = state.turns.map((entry) => (entry === last ? { ...entry, prose: text.slice(0, PROSE_CHARS) } : entry))
      return { ...state, turns }
    }
    // A real player message opens the next save slot.
    if (text.length === 0) return state
    const turns = [...state.turns, {
      turn: state.turns.length === 0 ? 0 : (state.turns[state.turns.length - 1]?.turn ?? -1) + 1,
      seq,
      player: text.slice(0, PLAYER_CHARS),
      prose: '',
      ...(state.pending === undefined ? {} : { badge: state.pending }),
    }].slice(-TURN_CAP)
    return { ...state, turns }
  },
}
