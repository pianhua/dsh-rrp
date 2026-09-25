import { z } from 'zod'
import { rrpPayloadOf } from '../state-payload.ts'
import { worldStateSchema } from './world-state.ts'
import {
  WORLD_STATE_TIMELINE_KEY,
  WORLD_STATE_TIMELINE_VERSION,
  type WorldStateTimeline,
  type WorldStateTimelineEntry,
  emptyWorldStateTimeline,
  foldWorldStateTimeline,
} from '../world-state-timeline.ts'

const actorSchema = z.enum([
  'initial-state',
  'player',
  'chronicler',
  'copilot',
  'system',
  'unknown',
])
const provenanceSchema = z
  .object({
    actor: actorSchema,
    storyTurn: z.number().int().nonnegative().optional(),
    at: z.string().optional(),
    evidence: z.string().optional(),
  })
  .strict()

const changeSchema = z
  .object({
    type: z.enum(['added', 'modified', 'closed', 'archived', 'deleted', 'restored']),
    objectId: z.string().optional(),
    field: z.string().optional(),
    before: z.unknown().optional(),
    after: z.unknown().optional(),
  })
  .strict()

const baselineSchema = z
  .object({
    kind: z.literal('baseline'),
    snapshot: z.literal('initial-state'),
    provenance: provenanceSchema,
    origin: z.enum(['inherited', 'local']).optional(),
  })
  .strict()

const batchSchema = z
  .object({
    kind: z.literal('changes'),
    changes: z.array(changeSchema).min(1),
    provenance: provenanceSchema,
    origin: z.enum(['inherited', 'local']).optional(),
  })
  .strict()

export const worldStateTimelineEntrySchema = z.discriminatedUnion('kind', [
  baselineSchema,
  batchSchema,
])

export const worldStateTimelineSchema = z
  .object({
    version: z.literal(WORLD_STATE_TIMELINE_VERSION),
    batches: z.array(worldStateTimelineEntrySchema),
  })
  .strict()

export const worldStateTimelineProjection = {
  key: WORLD_STATE_TIMELINE_KEY,
  stateSchema: worldStateTimelineSchema,
  stateVersion: WORLD_STATE_TIMELINE_VERSION,
  init: (): WorldStateTimeline => emptyWorldStateTimeline(),
  apply: (
    state: WorldStateTimeline,
    event: { type: string; data?: unknown },
  ): WorldStateTimeline => {
    const payload = rrpPayloadOf(event)
    if (payload?.worldState === undefined) return state
    if (!worldStateSchema.safeParse(payload.worldState).success) return state
    const candidate = payload.worldStateTimelineBatch
    if (candidate === undefined) return state
    const parsed = worldStateTimelineEntrySchema.safeParse(candidate)
    if (!parsed.success) return state
    const entry = parsed.data as WorldStateTimelineEntry
    return foldWorldStateTimeline(state, entry)
  },
}
