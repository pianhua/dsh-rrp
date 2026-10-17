import { describe, expect, it } from 'vitest'
import { emptyWorldState } from '../../src/world-state/world-state.ts'
import {
  firstSurfaceEvent,
  foldEvents,
  proseEntries,
  type LoggedEvent,
} from '../e2e/support/disk-fold.ts'

/**
 * The independent disk fold (ticket 04): fold `source.rrp` payloads from raw session-log
 * events WITHOUT the projection registry — the discipline that UI-pass ≠ durable-correct.
 * Synthetic events only: no host, no filesystem (the read side is exercised by the e2e).
 */

const event = (seq: number, type: string, data: unknown): LoggedEvent => ({ seq, type, data })

const worldState = (time: string) => ({
  ...emptyWorldState(),
  trackedObjects: {
    inn: {
      id: 'inn',
      kind: 'scene' as const,
      name: '孤灯客栈',
      fields: {
        time: {
          type: 'string' as const,
          value: time,
          definition: 'card-defined' as const,
          visibility: 'player' as const,
        },
      },
    },
  },
})

const HEAD_TEXT = '【DSH-Chronicle】RP 会话：正文由 Author 执笔，设定由卡包与技能按世界状态注入。'

const timelineBatch = {
  kind: 'changes' as const,
  changes: [
    {
      type: 'modified' as const,
      objectId: 'inn',
      field: 'trackedObjects.fields.time.value',
      before: '入夜，封关第一晚',
      after: '入夜渐深，雪声未歇',
    },
  ],
  provenance: { actor: 'chronicler' as const, storyTurn: 3, at: 'volatile', evidence: '雪' },
  origin: 'local' as const,
}

function playthroughLog(): LoggedEvent[] {
  return [
    event(0, 'turn/start', { turn: 1 }),
    event(1, 'step/start', { turn: 1, step: 1 }),
    event(2, 'system/message', {
      turn: 1,
      step: 1,
      message: {
        id: 'head',
        role: 'system',
        content: [{ type: 'text', text: HEAD_TEXT }],
        source: { kind: 'system-prompt' },
      },
    }),
    event(3, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
    // Start route: card lane + facts lane (initial state + baseline batch).
    event(4, 'user/message', {
      id: 'card-1',
      role: 'user',
      content: [{ type: 'text', text: '【卡包】雪夜雁门客栈' }],
      source: { kind: 'rrp', rrp: { card: { id: 'yanmen-inn' } } },
    }),
    event(5, 'user/message', {
      id: 'facts-1',
      role: 'user',
      content: [{ type: 'text', text: '【世界状态 · 事实基准】…初始…' }],
      source: {
        kind: 'rrp',
        rrp: {
          worldState: worldState('入夜，封关第一晚'),
          worldStateTimelineBatch: {
            kind: 'baseline',
            snapshot: 'initial-state',
            provenance: { actor: 'initial-state', at: 'volatile' },
            origin: 'local',
          },
          settings: { summaryEnabled: true, summaryEveryTurns: 8, allowSendMessage: true },
        },
      },
    }),
    // Player prompt turn.
    event(6, 'user/message', {
      id: 'player-1',
      role: 'user',
      content: [{ type: 'text', text: 'E2E-AUTHOR 她推门看了看雪。' }],
      source: { kind: 'user', rpcId: 'e2e-req-1' },
    }),
    event(7, 'assistant/message', {
      turn: 3,
      step: 1,
      message: {
        id: 'author-1',
        role: 'assistant',
        content: [{ type: 'text', text: '炉火把雪光映在窗纸上，她放下笔，望向门外。' }],
        source: { kind: 'model', provider: 'dsh-rrp-e2e', model: 'fixed' },
      },
    }),
    event(8, 'turn/end', { turn: 3, reason: { kind: 'completed' } }),
    // Chronicler commit: full state + fold cursor + changes batch.
    event(9, 'user/message', {
      id: 'facts-2',
      role: 'user',
      content: [{ type: 'text', text: '【世界状态 · 事实基准】…新…' }],
      source: {
        kind: 'rrp',
        rrp: {
          worldState: worldState('入夜渐深，雪声未歇'),
          stateFoldSeq: 7,
          worldStateTimelineBatch: timelineBatch,
          settings: { summaryEnabled: true, summaryEveryTurns: 8, allowSendMessage: true },
        },
      },
    }),
  ]
}

describe('独立读盘折叠（play-e2e 票据 04）', () => {
  it('folds the last worldState, the timeline batches and the fold cursor from raw events', () => {
    const fold = foldEvents(playthroughLog())
    expect(fold.worldState).toEqual(worldState('入夜渐深，雪声未歇'))
    expect(fold.timeline.batches).toHaveLength(2)
    expect(fold.timeline.batches[0]).toMatchObject({ kind: 'baseline', snapshot: 'initial-state' })
    expect(fold.timeline.batches[1]).toMatchObject({
      kind: 'changes',
      provenance: { actor: 'chronicler', storyTurn: 3 },
    })
    expect(fold.lastFoldSeq).toBe(7)
    expect(fold.lastStateSeq).toBe(9)
  })

  it('records every facts-lane text in commit order (metadata-lane guard)', () => {
    const fold = foldEvents(playthroughLog())
    expect(fold.factsTexts.map((entry) => entry.seq)).toEqual([5, 9])
    expect(fold.factsTexts[1]?.text).toBe('【世界状态 · 事实基准】…新…')
  })

  it('V4 head: the first surface event of the session is the protected system/message', () => {
    expect(firstSurfaceEvent(playthroughLog())?.type).toBe('system/message')
    const polluted = [
      event(0, 'user/message', { id: 'early', role: 'user', content: [] }),
      ...playthroughLog(),
    ]
    expect(firstSurfaceEvent(polluted)?.type).toBe('user/message')
    expect(firstSurfaceEvent([])).toBeUndefined()
  })

  it('proseEntries mirrors the transcript fold: rrp lanes and reminders are never prose', () => {
    const entries = proseEntries(playthroughLog())
    expect(entries).toEqual([
      { seq: 6, role: 'user', text: 'E2E-AUTHOR 她推门看了看雪。' },
      { seq: 7, role: 'assistant', text: '炉火把雪光映在窗纸上，她放下笔，望向门外。' },
    ])
  })

  it('finds the accepted prompt by its persisted requestId', () => {
    const fold = foldEvents(playthroughLog())
    const prompt = fold.events.find(
      (entry) =>
        entry.type === 'user/message' &&
        (entry.data as { source?: { rpcId?: string } }).source?.rpcId === 'e2e-req-1',
    )
    expect(prompt?.seq).toBe(6)
  })

  it('stays stable when the log carries no rrp payloads at all', () => {
    const fold = foldEvents([event(0, 'turn/start', { turn: 1 })])
    expect(fold.worldState).toBeUndefined()
    expect(fold.timeline.batches).toEqual([])
    expect(fold.lastFoldSeq).toBe(-1)
    expect(fold.lastStateSeq).toBe(-1)
  })
})
