import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_EVENT,
  ACTIVITY_KEY,
  ACTIVITY_LIMIT,
  emptyActivityLog,
  pendingActivity,
  type RrpActivity,
} from '../src/activity.ts'
import { activityProjection } from '../src/projection/activity.ts'
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

describe('activity ledger projection', () => {
  it('appends entries and keeps the bounded tail', () => {
    let log = emptyActivityLog()
    for (let index = 0; index < ACTIVITY_LIMIT + 5; index += 1) {
      log = activityProjection.apply(log, {
        type: ACTIVITY_EVENT,
        data: entry({ id: 'a' + index, phase: 'committed' }),
      })
    }
    expect(log.entries).toHaveLength(ACTIVITY_LIMIT)
    expect(log.entries[0]?.id).toBe('a5')
    expect(log.entries.at(-1)?.id).toBe('a' + (ACTIVITY_LIMIT + 4))
  })

  it('returns the same reference for unrelated events (Object.is gate)', () => {
    const log = emptyActivityLog()
    expect(activityProjection.apply(log, { type: 'user/message', data: {} })).toBe(log)
  })

  it('reports a pending writer only while the tail for its target is started', () => {
    const started = activityProjection.apply(emptyActivityLog(), { type: ACTIVITY_EVENT, data: entry() })
    expect(pendingActivity(started, 'world-state')?.id).toBe('a1')
    const committed = activityProjection.apply(started, {
      type: ACTIVITY_EVENT,
      data: entry({ phase: 'committed' }),
    })
    expect(pendingActivity(committed, 'world-state')).toBeUndefined()
  })

  it('initializes a fresh ledger per session', () => {
    expect(activityProjection.init()).not.toBe(activityProjection.init())
  })

  it('publishes the stable ledger key', () => {
    expect(ACTIVITY_KEY).toBe('rrpActivity')
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
