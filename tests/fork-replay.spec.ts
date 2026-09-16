import { describe, expect, it } from 'vitest'
import { SUMMARY_EVENT } from '../src/macro-summary.ts'
import { summaryProjection } from '../src/projection/summary.ts'
import { worldStateProjection } from '../src/projection/world-state.ts'
import { WORLD_STATE_EVENT, emptyWorldState } from '../src/world-state.ts'

/** One synthetic committed session event. */
function event(type: string, data: unknown, seq: number) {
  return { type, seq, time: 0, data }
}

/** Fold a projection unit from its init over a whole log (as the host does). */
function fold(definition: typeof worldStateProjection | typeof summaryProjection, events: ReturnType<typeof event>[]) {
  let state = (definition as { init(): unknown }).init()
  for (const item of events) {
    state = (definition as { apply(s: unknown, e: unknown): unknown }).apply(state, item)
  }
  return state as Record<string, any>
}

// A parent log: two WorldState snapshots and one macro summary, plus noise.
const prefix = [
  event('turn/start', { turn: 1 }, 0),
  event(WORLD_STATE_EVENT, { ...emptyWorldState(), scene: { location: '归离客栈' } }, 1),
  event('assistant/message', {}, 2),
  event(WORLD_STATE_EVENT, { ...emptyWorldState(), scene: { location: '枯河滩' }, flags: { 受伤: true } }, 3),
  event(SUMMARY_EVENT, { goal: '北行', conflict: '沙盗', turningPoints: ['离开客栈'], threads: [] }, 4),
]

describe('worldline replay (fork) correctness', () => {
  it('reconstructs the parent terminal slice by replaying the inherited prefix', () => {
    const state = fold(worldStateProjection, prefix)
    const summary = fold(summaryProjection, prefix)
    expect(state.scene.location).toBe('枯河滩')
    expect(state.flags['受伤']).toBe(true)
    expect(summary?.goal).toBe('北行')
  })

  it('keeps sibling branches independent (no cross-branch leakage)', () => {
    const branchA = [...prefix, event(WORLD_STATE_EVENT, { ...emptyWorldState(), scene: { location: 'A 分支' } }, prefix.length)]
    const branchB = [...prefix, event(WORLD_STATE_EVENT, { ...emptyWorldState(), scene: { location: 'B 分支' } }, prefix.length)]

    expect(fold(worldStateProjection, branchA).scene.location).toBe('A 分支')
    expect(fold(worldStateProjection, branchB).scene.location).toBe('B 分支')
    // Replaying the shared prefix is unaffected by either branch's own writes.
    expect(fold(worldStateProjection, prefix).scene.location).toBe('枯河滩')
  })

  it('is deterministic: the same log folds to the same slice', () => {
    expect(fold(worldStateProjection, prefix)).toEqual(fold(worldStateProjection, prefix))
    expect(fold(summaryProjection, prefix)).toEqual(fold(summaryProjection, prefix))
  })
})
