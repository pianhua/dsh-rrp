import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_LIMIT,
  appendActivity,
  emptyActivityLog,
  forgetActivity,
  pendingActivity,
  readActivity,
  recordActivity,
  renderActivityWorldStateDiff,
  type RrpActivity,
} from '../src/activity.ts'
import { diffWorldState, emptyWorldState } from '../src/world-state.ts'

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
  it('renders structured v2 object and global changes as a readable activity summary', () => {
    const prior = emptyWorldState()
    const next = {
      ...prior,
      trackedObjects: {
        mia: {
          id: 'mia',
          kind: 'character' as const,
          name: '米娅',
          character: { affinity: 3 },
          fields: {},
        },
      },
      globalFields: {
        identity_revealed: {
          type: 'boolean' as const,
          value: true,
          definition: 'card-defined' as const,
        },
      },
    }
    const digest = renderActivityWorldStateDiff(diffWorldState(prior, next))
    expect(digest).toContain('added:trackedObjects')
    expect(digest).toContain('added:globalFields.identity_revealed')
    expect(digest).not.toContain('米娅')
    expect(renderActivityWorldStateDiff(diffWorldState(next, next))).toBe('（无实质变化）')
  })

  it('caps a very large digest without exposing values', () => {
    const prior = emptyWorldState()
    const trackedObjects = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [
        'object-' + String(index),
        { id: 'object-' + String(index), kind: 'item' as const, name: '物品', fields: {} },
      ]),
    )
    const digest = renderActivityWorldStateDiff(diffWorldState(prior, { ...prior, trackedObjects }))
    expect(digest).toContain('另有')
    expect(digest).not.toContain('物品')
  })
})
