/**
 * WorldState v2 session projection.
 *
 * State writes are complete snapshots. The projection never backfills v1
 * fields, migrates old payloads, or adopts an invalid snapshot.
 */
import { z } from 'zod'
import { rrpPayloadOf } from '../state-payload.ts'
import {
  WORLD_STATE_KEY,
  WORLD_STATE_VERSION,
  type WorldState,
  type WorldStateView,
  emptyWorldState,
} from '../world-state.ts'
import { filterWorldState } from '../world-state-visibility.ts'

const visibilitySchema = z.enum(['player', 'model', 'hidden'])
const objectKindSchema = z.enum(['character', 'group', 'item', 'scene'])
const scalarTypeSchema = z.enum(['number', 'string', 'boolean'])

const externalReferenceSchema = z.object({
  name: z.string(),
  kind: objectKindSchema.optional(),
})

const objectReferenceSchema = z
  .object({
    objectId: z.string().optional(),
    external: externalReferenceSchema.optional(),
  })
  .strict()
  .refine((value) => (value.objectId !== undefined) !== (value.external !== undefined), {
    message: 'object reference must contain exactly one objectId or external reference',
  })

const scalarFieldSchema = z
  .object({
    type: scalarTypeSchema,
    value: z.union([z.number(), z.string(), z.boolean()]),
    definition: z.enum(['card-defined', 'undeclared']),
    visibility: visibilitySchema.optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.type === 'number' && typeof value.value !== 'number') {
      context.addIssue({
        code: 'custom',
        message: 'number field value must be a number',
        path: ['value'],
      })
    }
    if (value.type === 'string' && typeof value.value !== 'string') {
      context.addIssue({
        code: 'custom',
        message: 'string field value must be a string',
        path: ['value'],
      })
    }
    if (value.type === 'boolean' && typeof value.value !== 'boolean') {
      context.addIssue({
        code: 'custom',
        message: 'boolean field value must be a boolean',
        path: ['value'],
      })
    }
    if (value.min !== undefined && value.max !== undefined && value.min > value.max) {
      context.addIssue({ code: 'custom', message: 'field min must not exceed max', path: ['min'] })
    }
  })

const characterSchema = z
  .object({
    presence: z.enum(['present', 'absent', 'unknown']).optional(),
    outfit: z.string().optional(),
    emotionalState: z.string().optional(),
    affinity: z.number().optional(),
    appearance: z.string().optional(),
  })
  .strict()

const trackedObjectSchema = z
  .object({
    id: z.string(),
    kind: objectKindSchema,
    name: z.string(),
    archived: z.boolean().optional(),
    isPlayer: z.boolean().optional(),
    visibility: visibilitySchema.optional(),
    character: characterSchema.optional(),
    fields: z.record(z.string(), scalarFieldSchema),
  })
  .strict()

const objectiveSchema = z
  .object({
    id: z.string(),
    owners: z.array(objectReferenceSchema),
    desiredOutcome: z.string(),
    progress: z.string().optional(),
    status: z.enum(['pending', 'active', 'blocked', 'completed', 'abandoned']),
    nextStep: z.string().optional(),
    primary: z.boolean().optional(),
    order: z.number().int().optional(),
    visibility: visibilitySchema.optional(),
  })
  .strict()

const conflictSchema = z
  .object({
    id: z.string(),
    parties: z.array(objectReferenceSchema),
    stakes: z.string(),
    pressure: z.string(),
    status: z.enum(['active', 'controlled', 'resolved', 'abandoned']),
    visibility: visibilitySchema.optional(),
  })
  .strict()

const cognitionSchema = z
  .object({
    id: z.string(),
    character: objectReferenceSchema,
    proposition: z.string(),
    markers: z.array(z.enum(['known', 'believed', 'suspected', 'rumored', 'misunderstood'])),
    visibility: visibilitySchema.optional(),
  })
  .strict()
  .refine(
    (value) => !(value.markers.includes('known') && value.markers.includes('misunderstood')),
    {
      message: 'known and misunderstood cognition markers cannot coexist',
      path: ['markers'],
    },
  )

const attitudeSchema = z.object({ attitude: z.string(), value: z.number().optional() }).strict()

const relationSchema = z
  .object({
    id: z.string(),
    a: objectReferenceSchema,
    b: objectReferenceSchema,
    labels: z.array(z.string()),
    aToB: attitudeSchema.optional(),
    bToA: attitudeSchema.optional(),
    visibility: visibilitySchema.optional(),
  })
  .strict()

const eventSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    fact: z.string(),
    relatedObjects: z.array(objectReferenceSchema),
    status: z.enum(['pending', 'active', 'blocked', 'completed', 'invalid', 'abandoned']),
    visibility: visibilitySchema.optional(),
  })
  .strict()

export const worldStateSchema = z
  .object({
    version: z.literal(WORLD_STATE_VERSION),
    trackedObjects: z.record(z.string(), trackedObjectSchema),
    globalFields: z.record(z.string(), scalarFieldSchema),
    objectives: z.array(objectiveSchema),
    conflicts: z.array(conflictSchema),
    cognition: z.array(cognitionSchema),
    relations: z.array(relationSchema),
    currentEvents: z.array(eventSchema),
  })
  .strict()

const playerVisibilityNoticeSchema = z
  .object({
    kind: z.enum([
      'tracked-object',
      'field',
      'objective',
      'conflict',
      'cognition',
      'relation',
      'current-event',
    ]),
    count: z.number().int().positive(),
    message: z.literal('不公开的世界信息'),
  })
  .strict()

export const worldStatePlayerViewSchema = worldStateSchema
  .extend({ visibilityNotices: z.array(playerVisibilityNoticeSchema) })
  .strict()

export const worldStateProjection = {
  key: WORLD_STATE_KEY,
  stateSchema: worldStateSchema,
  stateVersion: 2,
  init: (): WorldState => emptyWorldState(),
  apply: (state: WorldState, event: { type: string; data?: unknown }): WorldState => {
    const payload = rrpPayloadOf(event)
    if (payload?.worldState === undefined) return state
    const parsed = worldStateSchema.safeParse(payload.worldState)
    return parsed.success ? (parsed.data as WorldState) : state
  },
  wire: {
    viewSchema: worldStatePlayerViewSchema,
    view: (state: WorldState): WorldStateView =>
      filterWorldState(state, 'player') as WorldStateView,
  },
}
