import { describe, expect, it } from 'vitest'
import { summaryProjection } from '../src/projection/summary.ts'
import { settingsProjection } from '../src/projection/settings.ts'
import { loreProjection } from '../src/projection/lore.ts'
import { worldStateProjection } from '../src/projection/world-state.ts'
import { rrpStateMessage } from '../src/state-payload.ts'
import { emptyWorldState } from '../src/world-state.ts'

/** One synthetic committed session event (non-RP noise is a plain known event). */
function event(type: string, data: unknown, seq: number) {
  return { type, seq, time: 0, data }
}

/** One state-bearing context message (the only way our state enters the log). */
function stateEvent(payload: Record<string, unknown>, seq: number) {
  return event('user/message', rrpStateMessage('m' + seq, 'context', payload), seq)
}

/** Fold a projection unit from its init over a whole log (as the host does). */
function fold(
  definition: typeof worldStateProjection | typeof summaryProjection | typeof settingsProjection | typeof loreProjection,
  events: ReturnType<typeof event>[],
) {
  let state = (definition as { init(): unknown }).init()
  for (const item of events) {
    state = (definition as { apply(s: unknown, e: unknown): unknown }).apply(state, item)
  }
  return state as Record<string, any>
}

// A parent log: two WorldState snapshots and one macro summary, plus noise.
const prefix = [
  event('turn/start', { turn: 1 }, 0),
  stateEvent({ worldState: { ...emptyWorldState(), scene: { location: '归离客栈' } } }, 1),
  event('assistant/message', {}, 2),
  stateEvent({ worldState: { ...emptyWorldState(), scene: { location: '枯河滩' }, flags: { 受伤: true } } }, 3),
  stateEvent({ summary: { goal: '北行', conflict: '沙盗', turningPoints: ['离开客栈'], threads: [] } }, 4),
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
    const branchA = [...prefix, stateEvent({ worldState: { ...emptyWorldState(), scene: { location: 'A 分支' } } }, prefix.length)]
    const branchB = [...prefix, stateEvent({ worldState: { ...emptyWorldState(), scene: { location: 'B 分支' } } }, prefix.length)]

    expect(fold(worldStateProjection, branchA).scene.location).toBe('A 分支')
    expect(fold(worldStateProjection, branchB).scene.location).toBe('B 分支')
    // Replaying the shared prefix is unaffected by either branch's own writes.
    expect(fold(worldStateProjection, prefix).scene.location).toBe('枯河滩')
  })

  it('is deterministic: the same log folds to the same slice', () => {
    expect(fold(worldStateProjection, prefix)).toEqual(fold(worldStateProjection, prefix))
    expect(fold(summaryProjection, prefix)).toEqual(fold(summaryProjection, prefix))
  })

  it('inherits summary settings through the fork prefix and isolates later changes', () => {
    const shared = [...prefix, stateEvent({ settings: { summaryEnabled: false } }, 5)]
    const branchA = [...shared, stateEvent({ settings: { summaryEnabled: true } }, 6)]
    const branchB = [...shared]

    expect(fold(settingsProjection, shared).summaryEnabled).toBe(false)
    expect(fold(settingsProjection, branchA).summaryEnabled).toBe(true)
    expect(fold(settingsProjection, branchB).summaryEnabled).toBe(false)
  })

  it('inherits lore before a fork and isolates branch-local additions', () => {
    const inherited = { name: 'shared-lore', description: 'shared', body: '# Shared' }
    const onlyA = { name: 'branch-a-lore', description: 'A', body: '# A' }
    const shared = [...prefix, stateEvent({ sediment: { kind: 'add', skill: inherited } }, 5)]
    const branchA = [...shared, stateEvent({ sediment: { kind: 'add', skill: onlyA } }, 6)]
    const branchB = [...shared, stateEvent({ sediment: { kind: 'remove', name: inherited.name } }, 6)]

    expect(fold(loreProjection, shared).map((entry: { name: string }) => entry.name)).toEqual(['shared-lore'])
    expect(fold(loreProjection, branchA).map((entry: { name: string }) => entry.name)).toEqual(['shared-lore', 'branch-a-lore'])
    expect(fold(loreProjection, branchB)).toEqual([])
  })
})
