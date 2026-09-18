import { describe, expect, it } from 'vitest'
import { latestTurnTranscriptOf, transcriptOf } from '../src/chronicler.ts'
import { transcriptProjections } from './stubs/transcript-projections.ts'

/** Projections face folding the given fake event log through the transcript unit. */
const fakeProjections = (events: Array<{ type: string; data?: unknown }>) => transcriptProjections(events)

const SESSION = { id: 's1' }

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
    const latest = latestTurnTranscriptOf(fakeProjections(MULTI_TURN), SESSION)
    expect(latest).toContain('第二轮')
    expect(latest).not.toContain('第一轮')
  })

  it('still lets the Summarizer see the broad tail', () => {
    const broad = transcriptOf(fakeProjections(MULTI_TURN), SESSION)
    expect(broad).toContain('第一轮')
    expect(broad).toContain('第二轮')
  })

  it('falls back to the whole tail when there is no user message', () => {
    const only = latestTurnTranscriptOf(fakeProjections([{ type: 'assistant/message', data: text('只有叙述。') }]), SESSION)
    expect(only).toContain('只有叙述')
  })

  it('supports up to 16000 characters by default and respects custom limit without 8000 cap', () => {
    const longText = 'A'.repeat(10000)
    const projections = fakeProjections([
      { type: 'user/message', data: text(longText) },
    ])
    // latestTurnTranscriptOf caps at 8000
    const latest = latestTurnTranscriptOf(projections, SESSION)
    expect(latest.length).toBeLessThanOrEqual(8000)

    // transcriptOf supports 16000 by default, so 10000 chars + prefix is NOT capped
    const broad = transcriptOf(projections, SESSION)
    expect(broad).toContain(longText)

    // Custom limit is respected and cuts only at entry boundaries (never
    // mid-text) so the retained head stays byte-identical across runs.
    const capped = transcriptOf(projections, SESSION, 5000)
    expect(capped.length).toBeLessThanOrEqual(5000)
    // One oversized entry under the limit: dropped whole, nothing partial.
    expect(capped).toBe('')
  })

  it('cuts at entry boundaries so the surviving head is byte-stable', () => {
    const first = 'A'.repeat(3000)
    const second = 'B'.repeat(3000)
    const projections = fakeProjections([
      { type: 'user/message', data: text(first) },
      { type: 'assistant/message', data: text(second) },
    ])
    const capped = transcriptOf(projections, SESSION, 5000)
    // Keeping both parts would be 6002 chars; entry-aligned drop removes the
    // first part whole and keeps the second byte-identical.
    expect(capped).toBe('【叙述】\n' + second)
  })
})
