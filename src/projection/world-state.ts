/**
 * dsh-rrp — the WorldState session-projection unit.
 *
 * A state-carrying log event MUST carry the complete post-change state (the
 * session-projection whole-value rule), so this fold simply adopts it.
 * Unrelated events return the SAME state reference, letting the registry's
 * Object.is gate do zero downstream work.
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

/** Runtime state/view validator (zod 4, matching the host's dependency). */
export const worldStateSchema = z.object({
  characters: z.record(z.string(), characterSchema),
  inventory: z.record(z.string(), itemSchema),
  scene: sceneSchema,
  flags: z.record(z.string(), flagSchema),
})

/**
 * The projection definition registered into `ctx.sessionProjections`.
 *
 * `wire.view` returns the state itself: the raw view reference is stable
 * exactly while `apply` keeps the state reference stable, which is what
 * suppresses redundant client publication.
 */
export const worldStateProjection = {
  key: WORLD_STATE_KEY,
  stateSchema: worldStateSchema,
  stateVersion: 1,
  init: (): WorldState => emptyWorldState(),
  apply: (state: WorldState, event: { type: string; data?: unknown }): WorldState =>
    rrpPayloadOf(event)?.worldState ?? state,
  wire: {
    viewSchema: worldStateSchema,
    view: (state: WorldState): WorldStateView => state,
  },
}
