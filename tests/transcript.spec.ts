import { describe, expect, it } from 'vitest'
import { latestTurnTranscriptOf, transcriptOf } from '../src/chronicler.ts'

/** A fake session whose only job is to expose a snapshot event list. */
function fakeSession(events: Array<{ type: string; data?: unknown }>) {
  return { id: 's1', append: () => ({}), snapshotEvents: () => events }
}

const text = (value: string) => ({ content: [{ type: 'text', text: value }] })

const MULTI_TURN = [
  { type: 'user/message', data: text('第一轮的玩家行动。') },
  { type: 'assistant/message', data: text('第一轮的叙述。') },
  { type: 'turn/end', data: {} },
  { type: 'user/message', data: text('第二轮的玩家行动。') },
  { type: 'tool/call', data: { name: 'skill' } },
  { type: 'assistant/message', data: text('第二轮的叙述。') },
]

describe('Chronicler transcript selection', () => {
  it('feeds only the latest turn, not the whole tail', () => {
    const latest = latestTurnTranscriptOf(fakeSession(MULTI_TURN))
    expect(latest).toContain('第二轮')
    expect(latest).not.toContain('第一轮')
  })

  it('still lets the Summarizer see the broad tail', () => {
    const broad = transcriptOf(fakeSession(MULTI_TURN))
    expect(broad).toContain('第一轮')
    expect(broad).toContain('第二轮')
  })

  it('falls back to the whole tail when there is no user message', () => {
    const only = latestTurnTranscriptOf(fakeSession([{ type: 'assistant/message', data: text('只有叙述。') }]))
    expect(only).toContain('只有叙述')
  })

  it('supports up to 16000 characters by default and respects custom limit without 8000 cap', () => {
    const longText = 'A'.repeat(10000)
    const session = fakeSession([
      { type: 'user/message', data: text(longText) },
    ])
    // latestTurnTranscriptOf caps at 8000
    const latest = latestTurnTranscriptOf(session)
    expect(latest.length).toBeLessThanOrEqual(8000)

    // transcriptOf supports 16000 by default, so 10000 chars + prefix is NOT capped
    const broad = transcriptOf(session)
    expect(broad).toContain(longText)

    // Custom limit is respected
    const capped = transcriptOf(session, 5000)
    expect(capped.length).toBe(5000)
  })
})

