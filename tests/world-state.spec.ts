import { describe, expect, it } from 'vitest'
import { worldStateProjection, worldStateSchema } from '../src/projection/world-state.ts'
import { rrpStateMessage } from '../src/state-payload.ts'
import {
  archiveTrackedObject,
  canDeleteTrackedObject,
  deleteTrackedObject,
  diagnoseWorldState,
  diffWorldState,
  emptyWorldState,
  restoreTrackedObject,
  normalizeWorldState,
  type TrackedObject,
  type WorldState,
} from '../src/world-state.ts'

const tracked = (overrides: Partial<TrackedObject> = {}): TrackedObject => ({
  id: 'mia',
  kind: 'character',
  name: '米娅',
  character: {
    presence: 'present',
    outfit: '女仆装',
    emotionalState: '警惕',
    affinity: 12,
  },
  fields: {
    stamina: { type: 'number', value: 80, definition: 'undeclared', min: 0, max: 100 },
  },
  ...overrides,
})

const state = (): WorldState => ({
  ...emptyWorldState(),
  trackedObjects: { mia: tracked() },
  globalFields: {
    weather: { type: 'string', value: '雨', definition: 'card-defined', visibility: 'player' },
  },
  objectives: [
    {
      id: 'reach-inn',
      owners: [{ objectId: 'mia' }],
      desiredOutcome: '抵达客栈',
      status: 'active',
      nextStep: '穿过雨幕',
      primary: true,
      order: 1,
    },
  ],
})

const stateEvent = (payload: Record<string, unknown>) => ({
  type: 'user/message',
  data: rrpStateMessage('m1', 'context', payload),
})

describe('WorldState v2 domain', () => {
  it('models tracked objects, optional common fields, scoped scalar fields, and visibility', () => {
    const current = state()
    expect(current.version).toBe(2)
    expect(current.trackedObjects.mia.character?.presence).toBe('present')
    expect(current.trackedObjects.mia.character?.affinity).toBe(12)
    expect(current.trackedObjects.mia.fields.stamina.definition).toBe('undeclared')
    expect(current.globalFields.weather.visibility).toBe('player')
    expect(worldStateSchema.safeParse(current).success).toBe(true)
  })

  it('uses explicit tri-state character presence and rejects the legacy boolean field', () => {
    const current = state()
    expect(current.trackedObjects.mia.character?.presence).toBe('present')
    expect(
      worldStateSchema.safeParse({
        ...current,
        trackedObjects: {
          ...current.trackedObjects,
          mia: { ...current.trackedObjects.mia, character: { presence: 'unknown' } },
        },
      }).success,
    ).toBe(true)
    expect(
      worldStateSchema.safeParse({
        ...current,
        trackedObjects: {
          ...current.trackedObjects,
          mia: { ...current.trackedObjects.mia, character: { present: true } },
        },
      }).success,
    ).toBe(false)
  })

  it('models targets, conflicts, cognition, relations, events, external references, and visibility', () => {
    const current: WorldState = {
      ...state(),
      conflicts: [
        {
          id: 'storm',
          parties: [{ objectId: 'mia' }, { external: { name: '北境商会', kind: 'group' } }],
          stakes: '客栈归属',
          pressure: '巡查即将抵达',
          status: 'active',
          visibility: 'model',
        },
      ],
      cognition: [
        {
          id: 'mia-knows-door',
          character: { objectId: 'mia' },
          proposition: '后门通向码头',
          markers: ['known'],
          visibility: 'hidden',
        },
      ],
      relations: [
        {
          id: 'mia-player',
          a: { objectId: 'mia' },
          b: { external: { name: '玩家', kind: 'character' } },
          labels: ['主仆'],
          aToB: { attitude: '信任', value: 80 },
          visibility: 'player',
        },
      ],
      currentEvents: [
        {
          id: 'secret-promise',
          type: 'promise',
          fact: '米娅答应保守秘密',
          relatedObjects: [{ objectId: 'mia' }, { external: { name: '玩家' } }],
          status: 'blocked',
          visibility: 'hidden',
        },
      ],
    }
    expect(worldStateSchema.safeParse(current).success).toBe(true)
  })

  it('accepts every current-event lifecycle status and closes completed, invalid, and abandoned events', () => {
    const statuses = ['pending', 'active', 'blocked', 'completed', 'invalid', 'abandoned'] as const
    for (const status of statuses) {
      expect(
        worldStateSchema.safeParse({
          ...state(),
          currentEvents: [
            {
              id: 'event-' + status,
              type: 'ongoing',
              fact: '事项',
              relatedObjects: [{ objectId: 'mia' }],
              status,
            },
          ],
        }).success,
      ).toBe(true)
    }

    const before = {
      ...state(),
      currentEvents: [
        {
          id: 'event',
          type: 'ongoing',
          fact: '事项',
          relatedObjects: [{ objectId: 'mia' }],
          status: 'active' as const,
        },
      ],
    }
    for (const status of ['completed', 'invalid', 'abandoned'] as const) {
      const after = {
        ...before,
        currentEvents: [{ ...before.currentEvents[0]!, status }],
      }
      expect(diffWorldState(before, after).changes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'closed', field: 'currentEvents.status' }),
        ]),
      )
    }
  })

  it('does not impose quantity caps or silently truncate diagnostics', () => {
    const current = state()
    const manyObjects = Object.fromEntries(
      Array.from({ length: 100 }, (_, index) => [String(index), tracked({ id: String(index) })]),
    )
    const expanded = { ...current, trackedObjects: manyObjects }
    expect(Object.keys(expanded.trackedObjects)).toHaveLength(100)
    expect(diagnoseWorldState(expanded, { diagnosticSerializedChars: 10 })).toEqual(
      expect.arrayContaining([
        { kind: 'serialized-budget', path: '$', actual: expect.any(Number), limit: 10 },
      ]),
    )
    expect(Object.keys(expanded.trackedObjects)).toHaveLength(100)
  })

  it('clamps number values but does not change scalar type or field ownership', () => {
    const current = state()
    const next = {
      ...current,
      trackedObjects: {
        mia: {
          ...current.trackedObjects.mia,
          fields: { stamina: { ...current.trackedObjects.mia.fields.stamina, value: 200 } },
        },
      },
    }
    const normalized = normalizeWorldState(next)
    expect(normalized.trackedObjects.mia.fields.stamina.value).toBe(100)
    expect(normalized.trackedObjects.mia.fields.stamina.definition).toBe('undeclared')
    expect(
      worldStateProjection.apply(emptyWorldState(), stateEvent({ worldState: normalized }))
        .trackedObjects.mia,
    ).toEqual(normalized.trackedObjects.mia)
  })

  it('blocks deletion while referenced, then downgrades references only after explicit confirmation', () => {
    const current = state()
    expect(canDeleteTrackedObject(current, 'mia').allowed).toBe(false)
    const blocked = deleteTrackedObject(current, 'mia')
    expect(blocked.ok).toBe(false)
    if (blocked.ok) throw new Error('expected reference protection')
    expect(blocked.references[0]?.collection).toBe('objectives')

    const deleted = deleteTrackedObject(current, 'mia', true)
    expect(deleted.ok).toBe(true)
    if (!deleted.ok) throw new Error('expected confirmed delete')
    expect(deleted.state.trackedObjects.mia).toBeUndefined()
    expect(deleted.state.objectives[0]?.owners[0]).toEqual({
      external: { name: '米娅', kind: 'character' },
    })
  })

  it('keeps archive distinct from delete and allows restoration', () => {
    const archived = archiveTrackedObject(state(), 'mia')
    expect(archived.trackedObjects.mia?.archived).toBe(true)
    expect(restoreTrackedObject(archived, 'mia').trackedObjects.mia?.archived).toBe(false)
  })

  it('classifies archive and restore changes without deleting the object', () => {
    const archived = archiveTrackedObject(state(), 'mia')
    const restored = restoreTrackedObject(archived, 'mia')
    expect(diffWorldState(state(), archived).changes).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'archived', objectId: 'mia' })]),
    )
    expect(diffWorldState(archived, restored).changes).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'restored', objectId: 'mia' })]),
    )
    expect(restored.trackedObjects.mia).toBeDefined()
  })

  it('produces structured field-level changes for objects and current entries', () => {
    const before = state()
    const after = {
      ...before,
      trackedObjects: {
        ...before.trackedObjects,
        mia: { ...before.trackedObjects.mia, character: { presence: 'absent' as const } },
        guard: tracked({ id: 'guard', name: '守卫' }),
      },
      objectives: [{ ...before.objectives[0]!, status: 'completed' as const }],
    }
    const diff = diffWorldState(before, after)
    expect(diff.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'modified',
          objectId: 'mia',
          field: 'trackedObjects.character.presence',
        }),
        expect.objectContaining({ type: 'added', objectId: 'guard' }),
        expect.objectContaining({
          type: 'closed',
          objectId: 'reach-inn',
          field: 'objectives.status',
        }),
      ]),
    )
  })

  it('omits the undefined side of added/deleted changes so diffs stay event-log safe', () => {
    const before = state()
    const after = structuredClone(before) as ReturnType<typeof state>
    delete after.trackedObjects.mia
    after.trackedObjects.guard = tracked({ id: 'guard', name: '守卫' })
    const diff = diffWorldState(before, after)
    const added = diff.changes.find(
      (change) => change.type === 'added' && change.objectId === 'guard',
    )
    const deleted = diff.changes.find(
      (change) => change.type === 'deleted' && change.objectId === 'mia',
    )
    expect(added).toBeDefined()
    expect('before' in (added as object)).toBe(false)
    expect(deleted).toBeDefined()
    expect('after' in (deleted as object)).toBe(false)
    // The whole diff must survive the host's lossless JSON round-trip.
    expect(JSON.parse(JSON.stringify(diff))).toEqual(diff)
  })
})

describe('WorldState v2 projection', () => {
  it('adopts a valid complete snapshot by whole value', () => {
    const current = state()
    const after = worldStateProjection.apply(emptyWorldState(), stateEvent({ worldState: current }))
    expect(after).toEqual(current)
    expect(after).not.toBe(emptyWorldState())
    expect(worldStateProjection.stateVersion).toBe(2)
  })

  it('rejects invalid and v1-shaped payloads without polluting the existing projection', () => {
    const current = state()
    const invalid = worldStateProjection.apply(
      current,
      stateEvent({ worldState: { ...current, version: 1 } }),
    )
    expect(invalid).toBe(current)
    const malformed = worldStateProjection.apply(
      current,
      stateEvent({ worldState: { version: 2 } }),
    )
    expect(malformed).toBe(current)
    const extraWireKey = worldStateProjection.apply(
      current,
      stateEvent({
        ...current,
        objectives: [
          {
            ...current.objectives[0]!,
            owners: [{ external: { name: '陌生对象', unexpected: true } }],
          },
        ],
      }),
    )
    expect(extraWireKey).toBe(current)
  })

  it('ignores unrelated events without changing the projection reference', () => {
    const current = state()
    expect(worldStateProjection.apply(current, { type: 'assistant/message', data: {} })).toBe(
      current,
    )
  })
})
