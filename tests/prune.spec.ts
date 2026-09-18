import { describe, expect, it } from 'vitest'
import { parseChroniclerReply } from '../src/agents/chronicler.ts'
import { WORLD_STATE_LIMITS, emptyWorldState, pruneWorldState } from '../src/world-state.ts'

describe('WorldState pruning', () => {
  it('keeps the same reference while within limits (Object.is gate)', () => {
    const state = emptyWorldState()
    expect(pruneWorldState(state)).toBe(state)
  })

  it('caps flags, keeping the importance-ordered head', () => {
    const flags: Record<string, boolean> = {}
    for (let index = 0; index < WORLD_STATE_LIMITS.flags + 5; index += 1) flags['事件' + index] = true
    const pruned = pruneWorldState({ ...emptyWorldState(), flags })
    expect(Object.keys(pruned.flags)).toHaveLength(WORLD_STATE_LIMITS.flags)
    expect(Object.keys(pruned.flags)[0]).toBe('事件0')
    expect(pruned.flags['事件' + (WORLD_STATE_LIMITS.flags + 4)]).toBeUndefined()
  })

  it('caps a single verbose flag value, ellipsis included in the limit', () => {
    const long = 'x'.repeat(WORLD_STATE_LIMITS.flagValueChars + 20)
    const pruned = pruneWorldState({ ...emptyWorldState(), flags: { 秘密: long } })
    const value = pruned.flags['秘密'] as string
    expect(value.length).toBe(WORLD_STATE_LIMITS.flagValueChars)
    expect(value.endsWith('…')).toBe(true)
  })

  it('is applied by the Chronicler reply parser', () => {
    const flags: Record<string, boolean> = {}
    for (let index = 0; index < WORLD_STATE_LIMITS.flags + 10; index += 1) flags['f' + index] = true
    const reply = JSON.stringify({ characters: {}, inventory: {}, scene: {}, flags })
    const parsed = parseChroniclerReply(reply)
    expect(Object.keys(parsed?.state?.flags ?? {})).toHaveLength(WORLD_STATE_LIMITS.flags)
  })
})
