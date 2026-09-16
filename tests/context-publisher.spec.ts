import { describe, expect, it } from 'vitest'
import { CARD_KEY, renderCardContext, type CardContext } from '../src/card-types.ts'
import { publishContext } from '../src/context-publisher.ts'
import { emptyWorldState, renderWorldState } from '../src/world-state.ts'

const CARD: CardContext = { id: 'c1', name: '测试卡', persona: 'P', worldCore: 'W' }
const STATE = { ...emptyWorldState(), scene: { location: '门口' } }

const projections = {
  stateOf: (_session: unknown, key: string) => {
    if (key === CARD_KEY) return CARD
    if (key === 'rrpWorldState') return STATE
    return undefined
  },
}

/** A fake session recording appends. */
function fakeSession(id: string, seed: Array<{ seq?: number; type?: string; data?: unknown }> = []) {
  const appended: Array<{ type: string; data: unknown; intent?: unknown }> = []
  let seq = seed.length
  const session = {
    id,
    append(type: string, data: unknown, intent?: unknown) {
      appended.push({ type, data, intent })
      seq += 1
      return { seq }
    },
    snapshotEvents: () => seed,
  }
  return { session, appended }
}

// user/message data IS the UserMessage (SessionEventMap['user/message'] = UserMessage).
const owned = (seq: number, text: string) => ({
  seq,
  type: 'user/message',
  data: { id: 'm' + seq, role: 'user', source: { kind: 'plugin', plugin: 'dsh-rrp' }, content: [{ type: 'text', text }] },
})

const localProjections = (readState: () => unknown) => ({
  stateOf: (_session: unknown, key: string) => {
    if (key === CARD_KEY) return CARD
    if (key === 'rrpWorldState') return readState()
    return undefined
  },
})

describe('durable context publisher', () => {
  it('publishes the card once and the facts once on the first pass', () => {
    const { session, appended } = fakeSession('a1')
    publishContext(session, projections)
    expect(appended).toHaveLength(2)
    expect((appended[0]?.intent as { surfaceOp: string }).surfaceOp).toBe('append')
    expect((appended[1]?.intent as { surfaceOp: string }).surfaceOp).toBe('append')
  })

  it('appends the changed facts and never duplicates the constant card', () => {
    let state: unknown = STATE
    const { session, appended } = fakeSession('a2')
    publishContext(session, localProjections(() => state))
    state = { ...STATE, flags: { 新事实: true } }
    publishContext(session, localProjections(() => state))

    expect(appended).toHaveLength(3)
    const cardAppends = appended.filter((entry) => JSON.stringify(entry.data).includes('【当前卡包'))
    expect(cardAppends).toHaveLength(1)
    const factsAppends = appended.filter((entry) => JSON.stringify(entry.data).includes('【世界状态'))
    expect(factsAppends).toHaveLength(2)
  })

  it('NEVER emits a replace (cache continuity guard)', () => {
    let state: unknown = STATE
    const { session, appended } = fakeSession('a7')
    publishContext(session, localProjections(() => state))
    state = { ...STATE, flags: { 又一条: true } }
    publishContext(session, localProjections(() => state))
    state = { ...STATE, flags: { 再一条: true } }
    publishContext(session, localProjections(() => state))

    for (const entry of appended) {
      expect((entry.intent as { surfaceOp: unknown }).surfaceOp).toBe('append')
    }
  })

  it('publishes nothing when neither card nor state is present', () => {
    const { session, appended } = fakeSession('a5')
    publishContext(session, { stateOf: () => undefined })
    expect(appended).toHaveLength(0)
  })

  it('adopts existing context after a restart instead of duplicating it', () => {
    const seed = [owned(1, renderCardContext(CARD)), owned(2, renderWorldState(STATE))]
    const { session, appended } = fakeSession('a4', seed)
    publishContext(session, projections)
    expect(appended).toHaveLength(0) // fully adopted: nothing re-published
  })

  it('appends only the changed facts after a restart (no card duplicate)', () => {
    const seed = [owned(1, renderCardContext(CARD)), owned(2, renderWorldState(STATE))]
    const { session, appended } = fakeSession('a6', seed)
    const state = { ...STATE, flags: { 新事实: true } }
    publishContext(session, localProjections(() => state))

    expect(appended).toHaveLength(1)
    expect((appended[0]?.intent as { surfaceOp: string }).surfaceOp).toBe('append')
    expect(JSON.stringify(appended[0]?.data)).toContain('【世界状态')
  })

  it('does not re-publish an unchanged facts block', () => {
    const { session, appended } = fakeSession('a8')
    publishContext(session, projections)
    publishContext(session, projections)
    expect(appended).toHaveLength(2) // card + facts only
  })
})
