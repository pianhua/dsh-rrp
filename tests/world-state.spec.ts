import { describe, expect, it } from 'vitest'
import { emptyWorldState, WORLD_STATE_EVENT } from '../src/world-state.ts'
import { worldStateProjection, worldStateSchema } from '../src/projection/world-state.ts'

describe('WorldState projection unit', () => {
  it('adopts the complete state from a world-state event', () => {
    const before = emptyWorldState()
    const next = {
      ...before,
      scene: { location: '归离客栈', time: '入夜' },
      characters: { 毓忻: { affinity: 3, mood: '警惕' } },
    }
    const after = worldStateProjection.apply(before, { type: WORLD_STATE_EVENT, data: next })
    expect(after).toBe(next)
    expect(worldStateSchema.parse(after)).toEqual(next)
  })

  it('returns the same reference for unrelated events (Object.is gate)', () => {
    const state = emptyWorldState()
    expect(worldStateProjection.apply(state, { type: 'user/message', data: {} })).toBe(state)
  })

  it('initializes a fresh empty state per session', () => {
    const a = worldStateProjection.init()
    const b = worldStateProjection.init()
    expect(a).not.toBe(b)
    expect(a).toEqual(emptyWorldState())
  })

  it('wire view reuses the state reference', () => {
    const state = emptyWorldState()
    expect(worldStateProjection.wire.view(state)).toBe(state)
  })
})
