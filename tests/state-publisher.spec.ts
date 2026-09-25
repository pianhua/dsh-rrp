import { describe, expect, it } from 'vitest'
import { rrpStateMessage, type RrpStatePayload } from '../src/state-payload.ts'
import { publishState, forgetState } from '../src/state-publisher.ts'
import { emptyWorldState, type WorldState } from '../src/world-state.ts'
import { type WorldStateTimelineBatch } from '../src/world-state-timeline.ts'

function fakeSession(id: string) {
  const appended: Array<{ type: string; data: unknown; intent?: unknown }> = []
  return {
    appended,
    session: {
      id,
      append(type: string, data: unknown, intent?: unknown) {
        appended.push({ type, data, intent })
        return { seq: appended.length }
      },
    },
  }
}

const payloadOf = (data: unknown): RrpStatePayload | undefined =>
  (data as { source?: { rrp?: RrpStatePayload } })?.source?.rrp

const state = (location: string): WorldState => ({
  ...emptyWorldState(),
  trackedObjects: {
    scene: { id: 'scene', kind: 'scene', name: location, fields: {} },
  },
})

const batch: WorldStateTimelineBatch = {
  kind: 'changes',
  changes: [{ type: 'modified', objectId: 'scene', field: 'name', before: '门口', after: '客栈' }],
  provenance: { actor: 'player', storyTurn: 1, evidence: '玩家保存' },
  origin: 'local',
}

describe('WorldState v2 durable publisher', () => {
  it('keeps the complete snapshot and timeline batch in source.rrp', () => {
    const { session, appended } = fakeSession('publisher-v2-wire')
    const current = state('客栈')
    publishState(
      session,
      { stateOf: () => undefined },
      { worldState: current, worldStateTimelineBatch: batch },
    )
    expect(appended).toHaveLength(1)
    expect(appended[0]?.type).toBe('user/message')
    expect((appended[0]?.intent as { surfaceOp: string }).surfaceOp).toBe('append')
    expect(payloadOf(appended[0]?.data)?.worldState).toEqual(current)
    expect(payloadOf(appended[0]?.data)?.worldStateTimelineBatch).toEqual(batch)
  })

  it('never uses replace and appends a later complete snapshot', () => {
    const { session, appended } = fakeSession('publisher-v2-append')
    publishState(session, { stateOf: () => undefined }, { worldState: state('门口') })
    publishState(session, { stateOf: () => undefined }, { worldState: state('客栈') })
    expect(appended).toHaveLength(2)
    expect(
      appended.every((entry) => (entry.intent as { surfaceOp: string }).surfaceOp === 'append'),
    ).toBe(true)
    expect(payloadOf(appended[1]?.data)?.worldState?.trackedObjects.scene?.name).toBe('客栈')
  })

  it('deduplicates an identical timeline batch without replacing the append-only record', () => {
    const { session, appended } = fakeSession('publisher-v2-timeline-dedup')
    const current = state('客栈')
    publishState(
      session,
      { stateOf: () => undefined },
      { worldState: current, worldStateTimelineBatch: batch },
    )
    publishState(
      session,
      { stateOf: () => undefined },
      { worldState: current, worldStateTimelineBatch: batch },
    )
    expect(appended).toHaveLength(1)
  })

  it('does not publish a timeline batch for a no-op snapshot', () => {
    const { session, appended } = fakeSession('publisher-v2-noop')
    const current = state('客栈')
    publishState(
      session,
      { stateOf: (_session, key) => (key === 'rrpWorldState' ? current : undefined) },
      { worldState: current, worldStateTimelineBatch: batch },
    )
    expect(appended).toHaveLength(1)
    expect(payloadOf(appended[0]?.data)?.worldState).toEqual(current)
    expect(payloadOf(appended[0]?.data)?.worldStateTimelineBatch).toBeUndefined()
  })

  it('does not publish an invalid timeline batch', () => {
    const { session, appended } = fakeSession('publisher-v2-invalid')
    publishState(session, { stateOf: () => undefined }, {
      worldState: state('客栈'),
      worldStateTimelineBatch: { kind: 'changes', changes: [], provenance: { actor: 'player' } },
    } as never)
    expect(appended).toHaveLength(1)
    expect(payloadOf(appended[0]?.data)?.worldStateTimelineBatch).toBeUndefined()
  })

  it('does not publish an empty patch', () => {
    const { session, appended } = fakeSession('publisher-v2-empty')
    publishState(session, { stateOf: () => undefined }, {})
    expect(appended).toHaveLength(0)
  })

  it('adopts an existing facts lane through the transcript projection', () => {
    const current = state('客栈')
    const seed = [
      {
        type: 'user/message',
        data: rrpStateMessage('seed', 'context', { worldState: current }),
      },
    ]
    const { session, appended } = fakeSession('publisher-v2-adopt')
    publishState(
      session,
      {
        stateOf: (_session, key) =>
          key === 'rrpTranscript'
            ? {
                entries: [],
                lastStateSeq: 1,
                lastFoldSeq: -1,
                facts: { text: '【世界状态 · 事实基准】' },
                sedimentSeen: false,
                lastSummaryTurn: -1,
              }
            : undefined,
      },
      { worldState: current },
    )
    expect(seed).toHaveLength(1)
    expect(appended).toHaveLength(1)
  })

  it('forgets retained lanes between sessions', () => {
    const { session, appended } = fakeSession('publisher-v2-forget')
    publishState(session, { stateOf: () => undefined }, { worldState: state('门口') })
    forgetState(session.id)
    publishState(session, { stateOf: () => undefined }, { worldState: state('门口') })
    expect(appended).toHaveLength(2)
  })
})
