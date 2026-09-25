import { describe, expect, it } from 'vitest'
import { worldStateProjection } from '../src/projection/world-state.ts'
import { worldStateTimelineProjection } from '../src/projection/world-state-timeline.ts'
import { rrpStateMessage } from '../src/state-payload.ts'
import { emptyWorldState, type WorldState } from '../src/world-state.ts'
import { type WorldStateTimelineBatch } from '../src/world-state-timeline.ts'

function event(type: string, data: unknown, seq: number) {
  return { type, seq, data }
}

function stateEvent(worldState: WorldState, batch?: WorldStateTimelineBatch, seq = 0) {
  return event(
    'user/message',
    rrpStateMessage('m' + seq, 'context', { worldState, worldStateTimelineBatch: batch }),
    seq,
  )
}

function fold(definition: any, events: Array<{ type: string; data: unknown }>): any {
  let state = definition.init()
  for (const item of events) state = definition.apply(state, item)
  return state
}

const initial = {
  ...emptyWorldState(),
  trackedObjects: {
    mia: { id: 'mia', kind: 'character' as const, name: '米娅', fields: {} },
  },
}
const baseline: WorldStateTimelineBatch = {
  kind: 'baseline',
  snapshot: 'initial-state',
  provenance: { actor: 'initial-state', at: 'unknown' },
  origin: 'local',
}
const localA: WorldStateTimelineBatch = {
  kind: 'changes',
  changes: [
    { type: 'modified', objectId: 'mia', field: 'character.present', before: true, after: false },
  ],
  provenance: { actor: 'player', storyTurn: 2 },
  origin: 'local',
}
const localB: WorldStateTimelineBatch = {
  kind: 'changes',
  changes: [
    { type: 'modified', objectId: 'mia', field: 'character.present', before: true, after: true },
  ],
  provenance: { actor: 'chronicler', storyTurn: 2 },
  origin: 'local',
}

describe('WorldState v2 fork replay', () => {
  it('replays complete snapshots and timeline batches from the physical prefix', () => {
    const prefix = [stateEvent(initial, baseline, 1)]
    const state = fold(worldStateProjection, prefix)
    const timeline = fold(worldStateTimelineProjection, prefix)
    expect(state.trackedObjects.mia?.name).toBe('米娅')
    expect(timeline.batches).toEqual([baseline])
  })

  it('keeps sibling state and timeline branches independent', () => {
    const prefix = [stateEvent(initial, baseline, 1)]
    const branchA = [
      ...prefix,
      stateEvent(
        {
          ...initial,
          trackedObjects: {
            ...initial.trackedObjects,
            mia: { ...initial.trackedObjects.mia!, character: { presence: 'absent' } },
          },
        },
        localA,
        2,
      ),
    ]
    const branchB = [
      ...prefix,
      stateEvent(
        {
          ...initial,
          trackedObjects: {
            ...initial.trackedObjects,
            mia: { ...initial.trackedObjects.mia!, character: { presence: 'present' } },
          },
        },
        localB,
        2,
      ),
    ]
    expect(fold(worldStateProjection, branchA).trackedObjects.mia?.character?.presence).toBe(
      'absent',
    )
    expect(fold(worldStateProjection, branchB).trackedObjects.mia?.character?.presence).toBe(
      'present',
    )
    expect(fold(worldStateTimelineProjection, branchA).batches).toEqual([baseline, localA])
    expect(fold(worldStateTimelineProjection, branchB).batches).toEqual([baseline, localB])
    expect(fold(worldStateTimelineProjection, prefix).batches).toEqual([baseline])
  })

  it('inherits only the physical fork prefix and preserves explicit origin metadata', () => {
    const inheritedPrefixBatch: WorldStateTimelineBatch = {
      ...baseline,
      origin: 'inherited',
    }
    const parentLateBatch: WorldStateTimelineBatch = {
      kind: 'changes',
      changes: [
        {
          type: 'modified',
          objectId: 'mia',
          field: 'character.presence',
          before: 'present',
          after: 'absent',
        },
      ],
      provenance: { actor: 'chronicler', storyTurn: 3 },
      origin: 'local',
    }
    const childLocalBatch: WorldStateTimelineBatch = {
      kind: 'changes',
      changes: [
        {
          type: 'modified',
          objectId: 'mia',
          field: 'character.presence',
          before: 'present',
          after: 'unknown',
        },
      ],
      provenance: { actor: 'player', storyTurn: 2 },
      origin: 'local',
    }
    const prefix = [stateEvent(initial, inheritedPrefixBatch, 1)]
    const parent = [
      ...prefix,
      stateEvent(
        {
          ...initial,
          trackedObjects: {
            ...initial.trackedObjects,
            mia: { ...initial.trackedObjects.mia!, character: { presence: 'absent' } },
          },
        },
        parentLateBatch,
        3,
      ),
    ]
    const child = [
      ...prefix,
      stateEvent(
        {
          ...initial,
          trackedObjects: {
            ...initial.trackedObjects,
            mia: { ...initial.trackedObjects.mia!, character: { presence: 'unknown' } },
          },
        },
        childLocalBatch,
        2,
      ),
    ]

    expect(fold(worldStateProjection, parent).trackedObjects.mia?.character?.presence).toBe(
      'absent',
    )
    expect(fold(worldStateProjection, child).trackedObjects.mia?.character?.presence).toBe(
      'unknown',
    )
    expect(fold(worldStateTimelineProjection, child).batches).toEqual([
      inheritedPrefixBatch,
      childLocalBatch,
    ])
    expect(fold(worldStateTimelineProjection, child).batches).not.toContain(parentLateBatch)
    expect(
      fold(worldStateTimelineProjection, child).batches.map(
        (batch: WorldStateTimelineBatch) => batch.origin,
      ),
    ).toEqual(['inherited', 'local'])
  })

  it('does not infer origin, actor, turn, or time from event sequence', () => {
    const batch: WorldStateTimelineBatch = {
      kind: 'changes',
      changes: [{ type: 'added', objectId: 'mia', after: { name: '米娅' } }],
      provenance: { actor: 'unknown' },
    }
    const timeline = fold(worldStateTimelineProjection, [stateEvent(initial, batch, 99)])
    expect(timeline.batches[0]).toEqual(batch)
    expect(
      (timeline.batches[0] as Extract<WorldStateTimelineBatch, { kind: 'changes' }>).provenance
        .storyTurn,
    ).toBeUndefined()
  })

  it('is host-only and requires a complete snapshot for an atomic timeline batch', () => {
    expect('wire' in worldStateTimelineProjection).toBe(false)
    const current = worldStateTimelineProjection.init()
    const next = worldStateTimelineProjection.apply(current, {
      type: 'user/message',
      data: rrpStateMessage('timeline-only', 'context', { worldStateTimelineBatch: localA }),
    })
    expect(next).toBe(current)
    const invalidSnapshot = worldStateTimelineProjection.apply(
      current,
      stateEvent({ ...initial, version: 1 } as unknown as WorldState, localA, 3),
    )
    expect(invalidSnapshot).toBe(current)
  })

  it('rejects an invalid timeline batch without mutating the folded timeline', () => {
    const current = worldStateTimelineProjection.init()
    const next = worldStateTimelineProjection.apply(
      current,
      stateEvent(initial, { kind: 'changes', changes: [], provenance: { actor: 'player' } }, 3),
    )
    expect(next).toBe(current)
  })
})
