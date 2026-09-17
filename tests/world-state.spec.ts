import { describe, expect, it } from 'vitest'
import { worldStateProjection, worldStateSchema } from '../src/projection/world-state.ts'
import { rrpStateMessage } from '../src/state-payload.ts'
import { emptyWorldState } from '../src/world-state.ts'

/** One plugin context message carrying a structured world-state payload. */
const stateEvent = (payload: Record<string, unknown>) => ({
  type: 'user/message',
  data: rrpStateMessage('m1', 'context text', payload),
})

describe('WorldState projection unit', () => {
  it('adopts the complete state from a state-bearing context message', () => {
    const before = emptyWorldState()
    const next = {
      ...before,
      scene: { location: '归离客栈', time: '入夜' },
      characters: { 毓忻: { affinity: 3, mood: '警惕' } },
    }
    const after = worldStateProjection.apply(before, stateEvent({ worldState: next }))
    expect(after).toBe(next)
    expect(worldStateSchema.parse(after)).toEqual(next)
  })

  it('returns the same reference for unrelated events (Object.is gate)', () => {
    const state = emptyWorldState()
    expect(worldStateProjection.apply(state, { type: 'user/message', data: {} })).toBe(state)
    expect(worldStateProjection.apply(state, stateEvent({ card: { id: 'c', name: 'n', persona: '', worldCore: '' } }))).toBe(state)
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
