/**
 * dsh-rrp — the WorldlineDigest session-projection unit (issue #28).
 *
 * The fold keeps absolute turn coordinates even when only a capped tail is
 * retained. Fork cuts and the inherited-prefix predecessor are protected from
 * that cap so the topology fold always has a durable mount point.
 */
import { z } from 'zod'
import {
  collectTextBlocks,
  isHostReminder,
  isPluginNotice,
  rrpPayloadOf,
} from '../state-payload.ts'
import {
  emptyWorldlineDigest,
  WORLDLINE_DIGEST_KEY,
  type WorldlineBadge,
  type WorldlineDigest,
  type WorldlineTurnMeta,
} from '../worldline-digest.ts'
import { isWorldStateTimelineBatch, type WorldStateTimelineBatch } from '../world-state-timeline.ts'

/** Slot budgets: the map shows dozens of lines, keep every node small. */
const TURN_CAP = 500
const PLAYER_CHARS = 120
const PROSE_CHARS = 400

type DigestState = WorldlineDigest & { inheritedEventCount: number }

const badgeSchema = z.object({
  location: z.string().optional(),
  time: z.string().optional(),
  affinity: z
    .array(z.object({ name: z.string(), value: z.number() }))
    .max(3)
    .optional(),
  summary: z.string().optional(),
})

const metaSchema = z.object({
  actor: z
    .enum(['initial-state', 'player', 'chronicler', 'copilot', 'system', 'unknown'])
    .optional(),
  origin: z.enum(['inherited', 'local']).optional(),
  changeCount: z.number().int().min(0).optional(),
})

const turnSchema = z.object({
  turn: z.number().int().min(0),
  seq: z.number().int().min(0),
  player: z.string().max(PLAYER_CHARS),
  prose: z.string().max(PROSE_CHARS),
  badge: badgeSchema.optional(),
  meta: metaSchema.optional(),
})

export const digestSchema = z.object({
  turns: z.array(turnSchema),
  inheritedEventCount: z.number().int().min(0),
  nextTurn: z.number().int().min(0),
  firstLocalTurn: z.number().int().min(0).optional(),
  forkCuts: z.array(z.number().int().min(0)),
  pending: badgeSchema.optional(),
})

const worldStatePayloadSchema = z.object({
  trackedObjects: z
    .record(
      z.string(),
      z
        .object({
          kind: z.string(),
          name: z.string(),
          character: z.object({ affinity: z.number().optional() }).passthrough().optional(),
          fields: z.record(z.string(), z.object({ value: z.unknown() }).passthrough()).default({}),
        })
        .passthrough(),
    )
    .default({}),
})

const summaryPayloadSchema = z.object({
  goal: z.string().optional(),
  conflict: z.string().optional(),
})

function inheritedCountOf(state: WorldlineDigest): number {
  const value = (state as DigestState).inheritedEventCount
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

/** Rebuild the badge from the current payload; absent fields are deleted. */
function badgeFromState(raw: unknown, summary: unknown): WorldlineBadge | undefined {
  const parsed = worldStatePayloadSchema.safeParse(raw)
  const summaryParsed = summaryPayloadSchema.safeParse(summary)
  if (!parsed.success && !summaryParsed.success) return undefined

  const next: WorldlineBadge = {}
  if (parsed.success) {
    const objects = Object.values(parsed.data.trackedObjects)
    const scene = objects.find((object) => object.kind === 'scene')
    const location = scene?.fields.location?.value
    const time = scene?.fields.time?.value
    if (typeof location === 'string' && location.length > 0) next.location = location
    if (typeof time === 'string' && time.length > 0) next.time = time
    const top = objects
      .filter((object) => object.kind === 'character' && object.character !== undefined)
      .map((object) => ({ name: object.name, value: object.character?.affinity ?? 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
    if (top.length > 0) next.affinity = top
  }
  if (summaryParsed.success) {
    const line = summaryParsed.data.conflict ?? summaryParsed.data.goal
    if (typeof line === 'string' && line.length > 0) next.summary = line.slice(0, 120)
  }
  return Object.keys(next).length === 0 ? undefined : next
}

function sameBadge(a: WorldlineBadge | undefined, b: WorldlineBadge | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function metaFromBatch(batch: WorldStateTimelineBatch | undefined): WorldlineTurnMeta | undefined {
  if (batch === undefined) return undefined
  const meta: WorldlineTurnMeta = { actor: batch.provenance.actor }
  if (batch.origin !== undefined) meta.origin = batch.origin
  if (batch.kind === 'changes') meta.changeCount = batch.changes.length
  else meta.changeCount = 0
  return meta
}

function targetTurnIndex(
  turns: readonly { turn: number; seq: number }[],
  storyTurn: number | undefined,
  stateFoldSeq: number | undefined,
): number {
  if (storyTurn !== undefined) {
    const index = turns.findIndex((entry) => entry.turn === storyTurn)
    if (index >= 0) return index
  }
  if (stateFoldSeq !== undefined && Number.isSafeInteger(stateFoldSeq)) {
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      if (turns[index]!.seq <= stateFoldSeq) return index
    }
  }
  return turns.length - 1
}

function withAnnotations(
  entry: WorldlineDigest['turns'][number],
  badge: WorldlineBadge | undefined,
  meta: WorldlineTurnMeta | undefined,
): WorldlineDigest['turns'][number] {
  const { badge: _oldBadge, meta: _oldMeta, ...withoutAnnotations } = entry
  return {
    ...withoutAnnotations,
    ...(badge === undefined ? {} : { badge }),
    ...(meta === undefined ? {} : { meta }),
  }
}

function cappedTurns(
  turns: WorldlineDigest['turns'],
  forkCuts: readonly number[],
  seedTurns: number,
): WorldlineDigest['turns'] {
  if (turns.length <= TURN_CAP) return turns
  const keep = new Set(turns.slice(-TURN_CAP).map((entry) => entry.turn))
  for (const turn of forkCuts) keep.add(turn)
  if (seedTurns > 0) keep.add(seedTurns - 1)
  return turns.filter((entry) => keep.has(entry.turn))
}

/** The projection definition registered into `ctx.sessionProjections`. */
export const worldlineDigestProjection = {
  key: WORLDLINE_DIGEST_KEY,
  stateSchema: digestSchema,
  stateVersion: 4,
  init: (_header?: unknown, inheritedEventCount = 0): WorldlineDigest =>
    ({
      ...emptyWorldlineDigest(),
      inheritedEventCount:
        Number.isSafeInteger(inheritedEventCount) && inheritedEventCount >= 0
          ? inheritedEventCount
          : 0,
    }) as WorldlineDigest,
  apply: (
    state: WorldlineDigest,
    event: { type: string; data?: unknown; seq?: number },
  ): WorldlineDigest => {
    if (event.type !== 'user/message' && event.type !== 'assistant/message') return state
    const seq = event.seq
    if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0) return state

    const payload = rrpPayloadOf(event)
    if (payload !== undefined) {
      let next: WorldlineDigest = state
      if (payload.worldlineForkCut !== undefined && payload.worldlineForkCut.turn !== null) {
        const turn = payload.worldlineForkCut.turn
        if (Number.isSafeInteger(turn) && turn >= 0 && !state.forkCuts.includes(turn)) {
          next = { ...next, forkCuts: [...next.forkCuts, turn] }
        }
      }

      const hasBadgePayload = payload.worldState !== undefined || payload.summary !== undefined
      if (hasBadgePayload) {
        const batch = isWorldStateTimelineBatch(payload.worldStateTimelineBatch)
          ? payload.worldStateTimelineBatch
          : undefined
        const worldBadge =
          payload.worldState === undefined
            ? undefined
            : badgeFromState(payload.worldState, undefined)
        const summaryBadge =
          payload.summary === undefined ? undefined : badgeFromState(undefined, payload.summary)
        const combinedBadge = badgeFromState(payload.worldState, payload.summary)
        const meta = metaFromBatch(batch)
        const turns = next.turns
        const worldIndex =
          payload.worldState === undefined
            ? -1
            : targetTurnIndex(turns, batch?.provenance.storyTurn, payload.stateFoldSeq)
        const summaryIndex =
          payload.summary === undefined
            ? -1
            : targetTurnIndex(turns, payload.summaryTurn, payload.stateFoldSeq)
        const updates = new Map<
          number,
          { badge: WorldlineBadge | undefined; meta: WorldlineTurnMeta | undefined }
        >()
        if (worldIndex >= 0) updates.set(worldIndex, { badge: worldBadge, meta })
        if (summaryIndex >= 0) {
          const existing = updates.get(summaryIndex)
          updates.set(summaryIndex, {
            badge:
              existing?.badge === undefined ? summaryBadge : { ...existing.badge, ...summaryBadge },
            meta: existing?.meta ?? meta,
          })
        }
        if (updates.size > 0) {
          const updatedTurns = turns.map((entry, index) => {
            const update = updates.get(index)
            if (update === undefined) return entry
            return withAnnotations(entry, update.badge, update.meta)
          })
          if (updatedTurns.some((entry, index) => entry !== turns[index])) {
            next = { ...next, turns: updatedTurns }
          }
        }
        if (!sameBadge(next.pending, combinedBadge)) {
          if (combinedBadge === undefined) {
            const { pending: _oldPending, ...withoutPending } = next
            next = withoutPending
          } else {
            next = { ...next, pending: combinedBadge }
          }
        }
      }
      return next === state ? state : next
    }

    if (isPluginNotice(event)) return state
    const found: string[] = []
    collectTextBlocks(event.data, found)
    const blocks = found.filter((text) => text.length > 0)
    if (event.type === 'assistant/message') {
      const text = (blocks[blocks.length - 1] ?? '').trim()
      if (text.length === 0 || state.turns.length === 0) return state
      const last = state.turns[state.turns.length - 1]!
      if (last.prose === text.slice(0, PROSE_CHARS)) return state
      return {
        ...state,
        turns: state.turns.map((entry, index) =>
          index === state.turns.length - 1
            ? { ...entry, prose: text.slice(0, PROSE_CHARS) }
            : entry,
        ),
      }
    }

    const text = blocks.join('\n').trim()
    if (text.length === 0 || isHostReminder(text)) return state
    const turn = state.nextTurn
    const firstLocalTurn =
      state.firstLocalTurn === undefined && seq >= inheritedCountOf(state)
        ? turn
        : state.firstLocalTurn
    const entry = {
      turn,
      seq,
      player: text.slice(0, PLAYER_CHARS),
      prose: '',
      ...(state.pending === undefined ? {} : { badge: state.pending }),
    }
    const allTurns = [...state.turns, entry]
    const nextTurn = turn + 1
    const { pending: _oldPending, ...withoutPending } = state
    const nextState: WorldlineDigest = {
      ...withoutPending,
      turns: cappedTurns(allTurns, state.forkCuts, firstLocalTurn ?? nextTurn),
      nextTurn,
      ...(firstLocalTurn === undefined ? {} : { firstLocalTurn }),
    }
    return nextState
  },
}

export { TURN_CAP }
