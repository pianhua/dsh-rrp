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

/** A fake session recording appends; optionally rejects replace intents. */
function fakeSession(id: string, seed: Array<{ seq?: number; type?: string; data?: unknown }> = [], rejectReplace = false) {
  const appended: Array<{ type: string; data: unknown; intent?: unknown }> = []
  let seq = seed.length
  const session = {
    id,
    append(type: string, data: unknown, intent?: unknown) {
      if (rejectReplace && typeof (intent as { surfaceOp?: unknown } | undefined)?.surfaceOp === 'object') {
        throw new Error('replace rejected')
      }
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

describe('durable context publisher', () => {
  it('publishes the card once and the facts once on the first pass', () => {
    const { session, appended } = fakeSession('a1')
    publishContext(session, projections)
    expect(appended).toHaveLength(2)
    expect((appended[0]?.intent as { surfaceOp: string }).surfaceOp).toBe('append')
    expect((appended[1]?.intent as { surfaceOp: string }).surfaceOp).toBe('append')
  })

  it('replaces the facts message when the state changes, never duplicating the card', () => {
    let state: unknown = STATE
    const local = {
      stateOf: (_session: unknown, key: string) => {
        if (key === CARD_KEY) return CARD
        if (key === 'rrpWorldState') return state
        return undefined
      },
    }
    const { session, appended } = fakeSession('a2')
    publishContext(session, local)
    state = { ...STATE, flags: { 新事实: true } }
    publishContext(session, local)

    expect(appended).toHaveLength(3) // card, facts, facts(replace)
    const intent = appended[2]?.intent as { surfaceOp: { op: string; startSeq: number; endSeq: number }; sourceEventSeqs: number[] }
    expect(intent.surfaceOp).toEqual({ op: 'replace', startSeq: 2, endSeq: 2 })
    expect(intent.sourceEventSeqs).toEqual([2])
    const cardAppends = appended.filter((entry) => JSON.stringify(entry.data).includes('【当前卡包'))
    expect(cardAppends).toHaveLength(1)
  })

  it('falls back to append when the host rejects the replace', () => {
    let state: unknown = STATE
    const local = {
      stateOf: (_session: unknown, key: string) => {
        if (key === CARD_KEY) return CARD
        if (key === 'rrpWorldState') return state
        return undefined
      },
    }
    const { session, appended } = fakeSession('a3', [], true)
    publishContext(session, local)
    state = { ...STATE, flags: { 又一条: true } }
    publishContext(session, local)

    // card + facts appended, the rejected replace wrote nothing, fallback appended.
    expect(appended).toHaveLength(3)
    expect((appended[2]?.intent as { surfaceOp: string }).surfaceOp).toBe('append')
  })

  it('adopts existing context after a restart instead of duplicating it', () => {
    const seed = [owned(1, renderCardContext(CARD)), owned(2, renderWorldState(STATE))]
    const { session, appended } = fakeSession('a4', seed)
    publishContext(session, projections)
    expect(appended).toHaveLength(0) // fully adopted: nothing re-published
  })

  it('continues replacing the adopted facts message after a restart', () => {
    const seed = [owned(1, renderCardContext(CARD)), owned(2, renderWorldState(STATE))]
    let state: unknown = STATE
    const local = {
      stateOf: (_session: unknown, key: string) => {
        if (key === CARD_KEY) return CARD
        if (key === 'rrpWorldState') return state
        return undefined
      },
    }
    const { session, appended } = fakeSession('a6', seed)
    state = { ...STATE, flags: { 新事实: true } }
    publishContext(session, local)

    expect(appended).toHaveLength(1)
    const intent = appended[0]?.intent as { surfaceOp: { op: string; startSeq: number; endSeq: number } }
    expect(intent.surfaceOp).toEqual({ op: 'replace', startSeq: 2, endSeq: 2 })
  })

  it('does nothing when neither card nor state is present', () => {
    const { session, appended } = fakeSession('a5')
    publishContext(session, { stateOf: () => undefined })
    expect(appended).toHaveLength(0)
  })
})
