import { describe, expect, it } from 'vitest'
import { worldlineDigestProjection } from '../src/projection/worldline-digest.ts'
import { emptyWorldlineDigest, type WorldlineDigest } from '../src/worldline-digest.ts'
import { rrpStateMessage } from '../src/state-payload.ts'
import { emptyWorldState, type WorldState } from '../src/world-state.ts'

const apply = worldlineDigestProjection.apply as (
  state: WorldlineDigest,
  event: unknown,
) => WorldlineDigest

function player(seq: number, text: string) {
  return {
    type: 'user/message',
    seq,
    data: { content: [{ type: 'text', text }], source: { kind: 'user' } },
  }
}
function assistant(seq: number, text: string) {
  return {
    type: 'assistant/message',
    seq,
    data: { message: { content: [{ type: 'text', text }] } },
  }
}
function notice(seq: number, text: string) {
  return {
    type: 'user/message',
    seq,
    data: {
      content: [{ type: 'text', text }],
      source: { kind: 'plugin', plugin: 'dsh-rrp', form: 'notice' },
    },
  }
}
function stateEvent(seq: number, worldState: unknown, extra: Record<string, unknown> = {}) {
  const merged =
    worldState === undefined
      ? undefined
      : ({ ...emptyWorldState(), ...(worldState as Record<string, unknown>) } as WorldState)
  return {
    type: 'user/message',
    seq,
    data: rrpStateMessage('st' + String(seq), 'ctx', {
      ...(merged === undefined ? {} : { worldState: merged }),
      ...extra,
    }),
  }
}

function scene(location: string) {
  return {
    trackedObjects: {
      scene: {
        id: 'scene',
        kind: 'scene',
        name: '场景',
        fields: { location: { type: 'string', value: location } },
      },
    },
  }
}

describe('worldline digest fold (v2)', () => {
  it('opens a save slot per real player message; the LAST assistant text wins', () => {
    let state = apply(emptyWorldlineDigest(), player(1, '我推门而入'))
    state = apply(state, assistant(2, 'planning'))
    state = apply(state, assistant(3, '门轴吱呀一声。'))
    state = apply(state, player(4, '我环顾四周'))
    expect(state.turns.map((entry) => [entry.turn, entry.seq, entry.player, entry.prose])).toEqual([
      [0, 1, '我推门而入', '门轴吱呀一声。'],
      [1, 4, '我环顾四周', ''],
    ])
    expect(state.nextTurn).toBe(2)
  })

  it('uses absolute turns and preserves the inherited prefix boundary', () => {
    let state = worldlineDigestProjection.init({}, 7) as WorldlineDigest
    state = apply(state, player(1, 'inherited'))
    state = apply(state, player(7, 'local'))
    expect(state.turns.map((entry) => entry.turn)).toEqual([0, 1])
    expect(state.firstLocalTurn).toBe(1)
    expect((state as WorldlineDigest & { inheritedEventCount: number }).inheritedEventCount).toBe(7)
  })

  it('caps the tail without rewinding nextTurn and protects cuts plus seed predecessor', () => {
    let state = emptyWorldlineDigest()
    for (let index = 0; index < 3; index += 1) {
      state = apply(
        state,
        stateEvent(index + 1, undefined, { worldlineForkCut: { child: 'child', turn: 2 } }),
      )
      break
    }
    for (let index = 0; index < 505; index += 1)
      state = apply(state, player(index + 10, 'P' + index))
    expect(state.nextTurn).toBe(505)
    expect(state.turns.map((entry) => entry.turn)).toContain(2)
    expect(state.forkCuts).toEqual([2])
    expect(state.turns.length).toBeLessThanOrEqual(501)
  })

  it('aligns state badges by storyTurn, then stateFoldSeq, then the tail', () => {
    let state = apply(emptyWorldlineDigest(), player(1, 'a'))
    state = apply(state, player(2, 'b'))
    state = apply(state, player(3, 'c'))
    state = apply(
      state,
      stateEvent(10, scene('story'), {
        worldStateTimelineBatch: {
          kind: 'changes',
          changes: [{ type: 'modified', objectId: 'scene', field: 'location' }],
          provenance: { actor: 'player', storyTurn: 1 },
          origin: 'local',
        },
      }),
    )
    expect(state.turns[1]?.badge?.location).toBe('story')
    state = apply(state, stateEvent(11, scene('folded'), { stateFoldSeq: 2 }))
    expect(state.turns[1]?.badge?.location).toBe('folded')
    state = apply(state, stateEvent(12, scene('tail')))
    expect(state.turns[2]?.badge?.location).toBe('tail')
  })

  it('rebuilds badges with deletion semantics and forwards the pending badge', () => {
    let state = apply(emptyWorldlineDigest(), player(1, '住店'))
    state = apply(state, stateEvent(2, scene('客栈')))
    expect(state.turns[0]?.badge).toEqual({ location: '客栈' })
    state = apply(state, stateEvent(3, { trackedObjects: {} }))
    expect(state.turns[0]?.badge).toBeUndefined()
    state = apply(state, player(4, '上楼'))
    expect(state.turns[1]?.badge).toBeUndefined()
  })

  it('writes timeline provenance metadata and aligns summaries by summaryTurn', () => {
    let state = apply(emptyWorldlineDigest(), player(1, 'a'))
    state = apply(state, player(2, 'b'))
    state = apply(
      state,
      stateEvent(3, undefined, {
        summary: { goal: 'g', conflict: '冲突', turningPoints: [], threads: [] },
        summaryTurn: 0,
        worldStateTimelineBatch: {
          kind: 'baseline',
          snapshot: 'initial-state',
          provenance: { actor: 'initial-state' },
        },
      }),
    )
    expect(state.turns[0]?.badge?.summary).toBe('冲突')
    expect(state.turns[0]?.meta).toEqual({ actor: 'initial-state', changeCount: 0 })
  })

  it('folds fork cuts, ignores null cuts, and preserves reference for unrelated events', () => {
    const base = apply(emptyWorldlineDigest(), player(1, 'x'))
    const marker = apply(
      base,
      stateEvent(2, undefined, { worldlineForkCut: { child: 'c', turn: 0 } }),
    )
    expect(marker.forkCuts).toEqual([0])
    expect(
      apply(marker, stateEvent(3, undefined, { worldlineForkCut: { child: 'd', turn: null } })),
    ).toBe(marker)
    expect(apply(base, { type: 'turn/end', seq: 2, data: {} })).toBe(base)
  })

  it('skips notices, reminders, and empty player messages', () => {
    const state = apply(apply(emptyWorldlineDigest(), notice(1, '序章')), player(2, ''))
    expect(state.turns).toEqual([])
    expect(apply(state, player(3, '<system-reminder>host</system-reminder>'))).toBe(state)
  })
})
