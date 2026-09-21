/**
 * dsh-rrp — the WorldState session-projection unit.
 *
 * A state-carrying log event MUST carry the complete post-change state (the
 * session-projection whole-value rule), so this fold simply adopts it.
 * Unrelated events return the SAME state reference, letting the registry's
 * Object.is gate do zero downstream work.
 *
 * D5: Automatic migration from legacy format to current format.
 */
import { z } from 'zod'
import { rrpPayloadOf } from '../state-payload.ts'
import {
  WORLD_STATE_KEY,
  emptyWorldState,
  type WorldState,
  type WorldStateView,
} from '../world-state.ts'

const characterSchema = z.object({
  affinity: z.number().optional(),
  mood: z.string().optional(),
  appearance: z.string().optional(),
  condition: z.string().optional(),
})

const itemSchema = z.object({
  quantity: z.number().optional(),
  note: z.string().optional(),
})

const sceneSchema = z.object({
  location: z.string().optional(),
  time: z.string().optional(),
  weather: z.string().optional(),
})

const flagSchema = z.union([z.string(), z.number(), z.boolean()])

/** One tracked relation: undirected endpoint pair + short label. */
const relationSchema = z.object({
  a: z.string(),
  b: z.string(),
  label: z.string(),
})

/** D5: DynamicFieldValue schema. */
const dynamicFieldValueSchema = z.object({
  type: z.enum(['number', 'string', 'boolean']),
  value: z.union([z.number(), z.string(), z.boolean()]),
  min: z.number().optional(),
  max: z.number().optional(),
})

/** Runtime state/view validator. */
export const worldStateSchema = z
  .object({
    characters: z.record(z.string(), characterSchema),
    inventory: z.record(z.string(), itemSchema),
    scene: sceneSchema,
    flags: z.record(z.string(), flagSchema),
    // Optional for legacy sessions written before relations existed.
    relations: z.array(relationSchema).optional(),
  })
  .catchall(dynamicFieldValueSchema)

/**
 * The projection definition registered into `ctx.sessionProjections`.
 */
export const worldStateProjection = {
  key: WORLD_STATE_KEY,
  stateSchema: worldStateSchema,
  stateVersion: 1,
  init: (): WorldState => emptyWorldState(),
  apply: (state: WorldState, event: { type: string; data?: unknown }): WorldState => {
    const payload = rrpPayloadOf(event)
    if (!payload?.worldState) return state

    // D5: payload.worldState should already be in correct format
    // (writers use createWorldState or direct construction)
    const worldState = payload.worldState as WorldState
    // Legacy payloads predate the relations domain: backfill the key so the
    // in-memory projection shape always carries it.
    if (worldState.relations !== undefined) return worldState
    return { ...worldState, relations: [] }
  },
  wire: {
    viewSchema: worldStateSchema,
    view: (state: WorldState): WorldStateView => state,
  },
}
