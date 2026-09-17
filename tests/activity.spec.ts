import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_LIMIT,
  appendActivity,
  emptyActivityLog,
  forgetActivity,
  pendingActivity,
  readActivity,
  recordActivity,
  type RrpActivity,
} from '../src/activity.ts'
import { NO_WORLD_STATE_CHANGE, diffWorldState, emptyWorldState } from '../src/world-state.ts'

/** A complete ledger entry with overridable fields. */
function entry(overrides: Partial<RrpActivity> = {}): RrpActivity {
  return {
    id: 'a1',
    at: '2026-09-16T00:00:00.000Z',
    actor: 'chronicler',
    target: 'world-state',
    phase: 'started',
    ...overrides,
  }
}

describe('activity ledger (host-side, in-memory)', () => {
  it('appends entries and keeps the bounded tail', () => {
    const id = 'spec-bounded'
    forgetActivity(id)
    for (let index = 0; index < ACTIVITY_LIMIT + 5; index += 1) {
      recordActivity(id, entry({ id: 'a' + index, phase: 'committed' }))
    }
    const log = readActivity(id)
    expect(log.entries).toHaveLength(ACTIVITY_LIMIT)
    expect(log.entries[0]?.id).toBe('a5')
    expect(log.entries.at(-1)?.id).toBe('a' + (ACTIVITY_LIMIT + 4))
    forgetActivity(id)
  })

  it('reads an empty ledger for an unknown session', () => {
    expect(readActivity('spec-unknown').entries).toEqual([])
  })

  it('keeps sessions isolated and forgets one on request', () => {
    recordActivity('spec-a', entry({ id: 'a' }))
    recordActivity('spec-b', entry({ id: 'b' }))
    expect(readActivity('spec-a').entries[0]?.id).toBe('a')
    expect(readActivity('spec-b').entries[0]?.id).toBe('b')
    forgetActivity('spec-a')
    expect(readActivity('spec-a').entries).toEqual([])
    forgetActivity('spec-b')
  })

  it('reports a pending writer only while the tail for its target is started', () => {
    const started = appendActivity(emptyActivityLog(), entry())
    expect(pendingActivity(started, 'world-state')?.id).toBe('a1')
    const committed = appendActivity(started, entry({ phase: 'committed' }))
    expect(pendingActivity(committed, 'world-state')).toBeUndefined()
  })
})

describe('WorldState change digest', () => {
  it('names the changed entries, and the no-change case', () => {
    const prior = emptyWorldState()
    const next = {
      ...prior,
      scene: { location: '归离客栈' },
      characters: { 毓忻: { affinity: 3 } },
      inventory: { 铜钥匙: { quantity: 1 } },
      flags: { 已知晓密道: true },
    }
    const digest = diffWorldState(prior, next)
    expect(digest).toContain('地点 （空） → 归离客栈')
    expect(digest).toContain('新增角色「毓忻」')
    expect(digest).toContain('新增物品「铜钥匙」')
    expect(digest).toContain('新事件「已知晓密道」')
    expect(diffWorldState(next, next)).toBe(NO_WORLD_STATE_CHANGE)
  })

  it('caps a very large digest', () => {
    const prior = emptyWorldState()
    const next = {
      ...prior,
      flags: Object.fromEntries(Array.from({ length: 12 }, (_, index) => ['事件' + index, true])),
    }
    expect(diffWorldState(prior, next)).toContain('共 12 处变化')
  })
})
