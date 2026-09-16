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
})
