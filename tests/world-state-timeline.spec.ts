import { describe, expect, it } from 'vitest'
import { worldStateTimelineProjection } from '../src/projection/world-state-timeline.ts'
import { rrpStateMessage } from '../src/state-payload.ts'
import { emptyWorldState, type WorldState } from '../src/world-state.ts'
import { type WorldStateTimelineBatch } from '../src/world-state-timeline.ts'

const state: WorldState = emptyWorldState()

function event(batch: unknown, snapshot: unknown = state) {
  return {
    type: 'user/message',
    data: rrpStateMessage('timeline', 'context', {
      worldState: snapshot as WorldState,
      worldStateTimelineBatch: batch as WorldStateTimelineBatch,
    }),
  }
}

describe('WorldState timeline projection', () => {
  it('keeps one complete snapshot paired with one atomic baseline batch', () => {
    const baseline: WorldStateTimelineBatch = {
      kind: 'baseline',
      snapshot: 'initial-state',
      provenance: { actor: 'initial-state', at: 'unknown' },
      origin: 'local',
    }

    const next = worldStateTimelineProjection.apply(
      worldStateTimelineProjection.init(),
      event(baseline),
    )

    expect(next.batches).toEqual([baseline])
  })

  it('preserves explicit unknown provenance without inventing metadata', () => {
    const batch: WorldStateTimelineBatch = {
      kind: 'changes',
      changes: [{ type: 'modified', field: 'globalFields.weather', before: '晴', after: '雨' }],
      provenance: { actor: 'unknown' },
    }

    const next = worldStateTimelineProjection.apply(
      worldStateTimelineProjection.init(),
      event(batch),
    )

    expect(next.batches[0]).toEqual(batch)
    expect(
      (next.batches[0] as Extract<WorldStateTimelineBatch, { kind: 'changes' }>).provenance,
    ).toEqual({ actor: 'unknown' })
  })

  it('does not fold timeline-only, invalid, or empty batches', () => {
    const initial = worldStateTimelineProjection.init()
    const timelineOnly = worldStateTimelineProjection.apply(initial, {
      type: 'user/message',
      data: rrpStateMessage('timeline-only', 'context', {
        worldStateTimelineBatch: {
          kind: 'changes',
          changes: [{ type: 'modified' }],
          provenance: { actor: 'player' },
        },
      }),
    })
    const invalid = worldStateTimelineProjection.apply(
      initial,
      event({ kind: 'changes', changes: [], provenance: { actor: 'player' } }),
    )
    const malformedSnapshot = worldStateTimelineProjection.apply(
      initial,
      event(
        { kind: 'baseline', snapshot: 'initial-state', provenance: { actor: 'system' } },
        { version: 1 },
      ),
    )

    expect(timelineOnly).toBe(initial)
    expect(invalid).toBe(initial)
    expect(malformedSnapshot).toBe(initial)
  })
})
