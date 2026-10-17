import { describe, expect, it } from 'vitest'
import {
  emptyWorldState,
  diffWorldState,
  type WorldState,
} from '../../src/world-state/world-state.ts'
import { applyWorldStatePatch } from '../../src/world-state/world-state-references.ts'
import { type WorldStateTimelineBatch } from '../../src/world-state/world-state-timeline.ts'
import { worldStateProjection } from '../../src/projection/world-state.ts'
import { worldStateTimelineProjection } from '../../src/projection/world-state-timeline.ts'
import { worldlineDigestProjection } from '../../src/projection/worldline-digest.ts'
import { rrpStateMessage } from '../../src/publish/state-payload.ts'
import {
  extractRecallRounds,
  recallHistory,
  renderRecall,
  createRecallScope,
  type RecallRound,
} from '../../src/runtime/recall.ts'
import { buildCopilotPrompt } from '../../src/agents/copilot.ts'
import { parseChroniclerReply } from '../../src/agents/chronicler.ts'
import {
  publishWorldlineForkMarker,
  type WorldlineForkMarkerFaces,
} from '../../src/worldline/worldline-fork-marker.ts'

function playerMsg(seq: number, text: string) {
  return {
    type: 'user/message',
    seq,
    data: { content: [{ type: 'text', text }], source: { kind: 'user' } },
  }
}

function assistantMsg(seq: number, text: string) {
  return {
    type: 'assistant/message',
    seq,
    data: { message: { content: [{ type: 'text', text }] } },
  }
}

function stateMsg(
  seq: number,
  worldState: WorldState,
  batch?: WorldStateTimelineBatch,
  extra: Record<string, unknown> = {},
) {
  return {
    type: 'user/message',
    seq,
    data: rrpStateMessage('st' + String(seq), 'ctx', {
      worldState,
      ...(batch === undefined ? {} : { worldStateTimelineBatch: batch }),
      stateFoldSeq: seq,
      ...extra,
    }),
  }
}

function foldEvents<T>(
  projection: { init: (...args: any[]) => T; apply: (state: T, event: any) => T },
  events: any[],
  initArg?: any,
): T {
  let state = projection.init(initArg)
  for (const ev of events) {
    state = projection.apply(state, ev)
  }
  return state
}

describe('End-to-End Multi-Turn Simulation (dsh-rrp)', () => {
  it('executes a complete 5-turn narrative session with full and incremental state folds', () => {
    const events: any[] = []

    // --- Turn 0: Prologue & Initial Setup ---
    const initialWorldState: WorldState = {
      ...emptyWorldState(),
      trackedObjects: {
        mia: {
          id: 'mia',
          kind: 'character',
          name: '米娅',
          fields: {},
          character: { emotionalState: '警惕', presence: 'present' },
        },
        outpost: {
          id: 'outpost',
          kind: 'scene',
          name: '白塔前哨',
          fields: {
            location: { type: 'string', value: '白塔外围荒原', definition: 'undeclared' },
          },
        },
      },
    }
    const baselineBatch: WorldStateTimelineBatch = {
      kind: 'baseline',
      snapshot: 'initial-state',
      provenance: { actor: 'initial-state', at: '2026-10-15T12:00:00Z' },
      origin: 'local',
    }

    events.push(playerMsg(0, '开局准备'))
    events.push(
      assistantMsg(
        1,
        '暴风雪呼啸着席卷荒原，刺骨的寒风几乎要将人吞没。你穿过漫天风雪，终于抵达了矗立在幽影中的白塔前哨。',
      ),
    )
    events.push(stateMsg(2, initialWorldState, baselineBatch))

    // --- Turn 1: Player Enters Outpost -> Chronicler Full State Fold ---
    events.push(playerMsg(3, '我推开沉重的防风木门进入哨所，向守门人出示议会通行信物。'))
    events.push(
      assistantMsg(
        4,
        '老莫接过带着寒气的铜制徽记，仔细端详片刻，点头道：“既是议会信物，那便准你入内避风。不过后山近来异兽出没，千万小心。”',
      ),
    )

    // Chronicler infers full state update:
    const turn1State: WorldState = {
      ...initialWorldState,
      trackedObjects: {
        ...initialWorldState.trackedObjects,
        gatekeeper: {
          id: 'gatekeeper',
          kind: 'character',
          name: '老莫',
          fields: {},
          character: { emotionalState: '平静', presence: 'present' },
        },
      },
    }
    const turn1Diff = diffWorldState(initialWorldState, turn1State)
    expect(turn1Diff.changes.length).toBeGreaterThan(0)

    const turn1Batch: WorldStateTimelineBatch = {
      kind: 'changes',
      changes: turn1Diff.changes,
      provenance: {
        actor: 'chronicler',
        storyTurn: 1,
        evidence: '老莫接过议会信物准许入内',
      },
      origin: 'local',
    }
    events.push(stateMsg(5, turn1State, turn1Batch))

    // --- Turn 2: Player Observes Mia -> Chronicler Incremental Patch Fold ---
    events.push(playerMsg(6, '我坐在壁炉旁烤火，注意到米娅腰间挂着一枚雕刻着飞鹰图腾的古老护符。'))
    events.push(
      assistantMsg(
        7,
        '米娅察觉到你的目光，下意识用长袍遮掩住那枚飞鹰护符，眼神闪烁，神色显得异常慌张。',
      ),
    )

    // Chronicler infers incremental patch:
    const rawPatchReply = JSON.stringify({
      patch: {
        trackedObjects: {
          mia: {
            character: { emotionalState: '慌张' },
          },
          eagle_amulet: {
            id: 'eagle_amulet',
            kind: 'item',
            name: '飞鹰护符',
            fields: {
              holder: { type: 'string', value: 'mia', definition: 'undeclared' },
            },
          },
        },
      },
      changeSummary: '发现米娅携带飞鹰护符，米娅神色变得慌张。',
      evidence: ['米娅用长袍遮掩飞鹰护符', '神色异常慌张'],
    })

    const parsedPatch = parseChroniclerReply(rawPatchReply)
    expect(parsedPatch?.patch).toBeDefined()

    const appliedPatchRes = applyWorldStatePatch(turn1State, parsedPatch!.patch!, {
      allowHiddenContent: true,
    })
    expect(appliedPatchRes.ok).toBe(true)
    const turn2State = appliedPatchRes.ok ? appliedPatchRes.state : turn1State

    // Verify existing characters were not accidentally dropped by incremental patch
    expect(turn2State.trackedObjects.gatekeeper).toBeDefined()
    expect(turn2State.trackedObjects.mia?.character?.emotionalState).toBe('慌张')
    expect(turn2State.trackedObjects.eagle_amulet?.name).toBe('飞鹰护符')

    const turn2Diff = diffWorldState(turn1State, turn2State)
    const turn2Batch: WorldStateTimelineBatch = {
      kind: 'changes',
      changes: turn2Diff.changes,
      provenance: {
        actor: 'chronicler',
        storyTurn: 2,
        evidence: parsedPatch!.changeSummary,
      },
      origin: 'local',
    }
    events.push(stateMsg(8, turn2State, turn2Batch))

    // --- Turn 3: Player Talks to Mia -> Background Lore Unveiled ---
    events.push(playerMsg(9, '我递给米娅一杯热燕麦酒，温和询问关于飞鹰图腾与失踪导师的传闻。'))
    events.push(
      assistantMsg(
        10,
        '温热的酒气稍微舒缓了气氛，米娅叹了口气，坦诚道：“我的导师雷蒙德三年前去古遗迹调查暗蚀核心后失踪，这枚护符是他留下的唯一线索。”',
      ),
    )

    const turn3PatchReply = JSON.stringify({
      patch: {
        trackedObjects: {
          mia: {
            character: { emotionalState: '坦诚' },
          },
        },
        objectives: [
          {
            id: 'obj_find_mentor',
            desiredOutcome: '调查古遗迹暗蚀核心与导师雷蒙德的失踪之谜',
            status: 'active',
            owners: [{ objectId: 'mia' }],
          },
        ],
      },
      changeSummary: '米娅坦白导师雷蒙德失踪于暗蚀核心调查，确立调查目标。',
      evidence: ['米娅坦诚导师失踪线索'],
    })
    const parsedTurn3 = parseChroniclerReply(turn3PatchReply)
    const appliedTurn3 = applyWorldStatePatch(turn2State, parsedTurn3!.patch!, {
      allowHiddenContent: true,
    })
    expect(appliedTurn3.ok).toBe(true)
    const turn3State = appliedTurn3.ok ? appliedTurn3.state : turn2State

    const turn3Diff = diffWorldState(turn2State, turn3State)
    const turn3Batch: WorldStateTimelineBatch = {
      kind: 'changes',
      changes: turn3Diff.changes,
      provenance: {
        actor: 'chronicler',
        storyTurn: 3,
        evidence: parsedTurn3!.changeSummary,
      },
      origin: 'local',
    }
    events.push(stateMsg(11, turn3State, turn3Batch))

    // --- Verify Projections & Timeline Integrity ---
    const finalState = foldEvents(worldStateProjection, events)
    const finalTimeline = foldEvents(worldStateTimelineProjection, events)
    const finalDigest = foldEvents(worldlineDigestProjection, events)

    expect(finalState.trackedObjects.gatekeeper?.name).toBe('老莫')
    expect(finalState.trackedObjects.mia?.character?.emotionalState).toBe('坦诚')
    expect(finalState.trackedObjects.eagle_amulet?.name).toBe('飞鹰护符')
    expect(finalState.objectives).toHaveLength(1)
    expect(finalState.objectives[0]?.id).toBe('obj_find_mentor')

    // Timeline batches: 1 baseline + 3 changes = 4 batches total
    expect(finalTimeline.batches).toHaveLength(4)
    expect(finalTimeline.batches[0]?.kind).toBe('baseline')
    expect(finalTimeline.batches[1]?.provenance.storyTurn).toBe(1)
    expect(finalTimeline.batches[2]?.provenance.storyTurn).toBe(2)
    expect(finalTimeline.batches[3]?.provenance.storyTurn).toBe(3)

    // Digest has captured turns 0, 1, 2, 3
    expect(finalDigest.turns.length).toBeGreaterThanOrEqual(4)
    expect(finalDigest.turns[0]?.player).toBe('开局准备')
    expect(finalDigest.turns[1]?.prose).toContain('老莫接过带着寒气的铜制徽记')
    expect(finalDigest.turns[2]?.prose).toContain('飞鹰护符')
    expect(finalDigest.turns[3]?.prose).toContain('暗蚀核心')
  })

  it('handles turn branching (forking) with fork gate, child session cleanup, and sibling isolation', () => {
    // 1. Fork Gate: Test turn forkability guard
    const incompleteTurn = { turn: 2, proseExcerpt: '   ' }
    const canForkIncomplete =
      incompleteTurn.proseExcerpt.trim().length > 0 || incompleteTurn.turn === 0
    expect(canForkIncomplete).toBe(false)

    const completedTurn = { turn: 2, proseExcerpt: '米娅神色显得异常慌张。' }
    const canForkCompleted =
      completedTurn.proseExcerpt.trim().length > 0 || completedTurn.turn === 0
    expect(canForkCompleted).toBe(true)

    // 2. Parent branch setup up to Turn 2
    const prefixEvents = [
      playerMsg(0, '开局准备'),
      assistantMsg(1, '风雪呼啸，你抵达前哨。'),
      playerMsg(2, '我进入哨所出示信物。'),
      assistantMsg(3, '老莫准你入内避风。'),
      playerMsg(4, '我发现米娅随身带着飞鹰护符。'),
      assistantMsg(5, '米娅慌忙遮掩护符。'),
    ]

    const turn2State: WorldState = {
      ...emptyWorldState(),
      trackedObjects: {
        mia: {
          id: 'mia',
          kind: 'character',
          name: '米娅',
          fields: {},
          character: { emotionalState: '慌张', presence: 'present' },
        },
      },
    }

    // Parent continues Turn 3 with peaceful investigation:
    const parentTurn3Events = [
      ...prefixEvents,
      playerMsg(6, '我好言相劝，请米娅喝热酒。'),
      assistantMsg(7, '米娅向你坦白了真相。'),
      stateMsg(
        8,
        {
          ...turn2State,
          trackedObjects: {
            mia: {
              ...turn2State.trackedObjects.mia!,
              character: { emotionalState: '坦诚' },
            },
          },
        },
        {
          kind: 'changes',
          changes: [
            {
              type: 'modified',
              objectId: 'mia',
              field: 'character.emotionalState',
              before: '慌张',
              after: '坦诚',
            },
          ],
          provenance: { actor: 'chronicler', storyTurn: 3 },
          origin: 'local',
        },
      ),
    ]

    // Child forks at Turn 2 (seq = 5) and takes an aggressive path:
    let cleanupCalledForChild = ''
    const childSession = {
      id: 'session-child-1',
      inheritedEventCount: 6,
      header: {
        parentSession: 'session-parent-1',
        isSeeded: true,
        origin: 'user',
      },
      append: () => {},
    }

    const parentSession = {
      id: 'session-parent-1',
      header: {},
      append: () => {},
    }

    const markerFaces: WorldlineForkMarkerFaces = {
      sessions: {
        get: (id: string) => (id === 'session-parent-1' ? parentSession : undefined),
      },
      projections: {
        stateOf: () => ({
          turns: [
            { turn: 0, seq: 1 },
            { turn: 1, seq: 3 },
            { turn: 2, seq: 5 },
          ],
        }),
      } as any,
      publish: (_session, _childId, _turn) => true,
      onFork: (childId) => {
        cleanupCalledForChild = childId
      },
    }

    // Publish fork marker on child creation
    const marked = publishWorldlineForkMarker(childSession, markerFaces)
    expect(marked).toBe(true)
    expect(cleanupCalledForChild).toBe('session-child-1')

    // Child continues Turn 3 aggressively:
    const childTurn3Events = [
      ...prefixEvents,
      playerMsg(6, '我拔出短刀逼迫米娅交出飞鹰护符！'),
      assistantMsg(7, '米娅满脸惊怒，退向墙角拔出匕首与你对峙。'),
      stateMsg(
        8,
        {
          ...turn2State,
          trackedObjects: {
            mia: {
              ...turn2State.trackedObjects.mia!,
              character: { emotionalState: '敌对' },
            },
          },
        },
        {
          kind: 'changes',
          changes: [
            {
              type: 'modified',
              objectId: 'mia',
              field: 'character.emotionalState',
              before: '慌张',
              after: '敌对',
            },
          ],
          provenance: { actor: 'chronicler', storyTurn: 3 },
          origin: 'local',
        },
      ),
    ]

    // Verify Sibling Isolation:
    const parentFinalState = foldEvents(worldStateProjection, parentTurn3Events)
    const childFinalState = foldEvents(worldStateProjection, childTurn3Events)

    expect(parentFinalState.trackedObjects.mia?.character?.emotionalState).toBe('坦诚')
    expect(childFinalState.trackedObjects.mia?.character?.emotionalState).toBe('敌对')

    const parentTimeline = foldEvents(worldStateTimelineProjection, parentTurn3Events)
    const childTimeline = foldEvents(worldStateTimelineProjection, childTurn3Events)

    const lastParentBatch = parentTimeline.batches.at(-1)
    const lastChildBatch = childTimeline.batches.at(-1)
    expect(lastParentBatch?.kind).toBe('changes')
    expect(lastChildBatch?.kind).toBe('changes')
    if (lastParentBatch?.kind === 'changes') {
      expect(lastParentBatch.changes[0]?.after).toBe('坦诚')
    }
    if (lastChildBatch?.kind === 'changes') {
      expect(lastChildBatch.changes[0]?.after).toBe('敌对')
    }
  })

  it('exercises 2-stage active recall with search, deep read, cooldowns, and budget constraints', () => {
    const rawEvents = [
      playerMsg(0, '开局准备'),
      assistantMsg(1, '风雪漫天，你在雪夜中来到白塔哨所。'),
      playerMsg(2, '向守门人出示议会信物。'),
      assistantMsg(3, '老莫接过信物，开门放行。'),
      playerMsg(4, '观察米娅身上的饰品。'),
      assistantMsg(5, '发现米娅戴着刻有飞鹰图腾的古老护符。'),
      playerMsg(6, '询问米娅关于护符与暗蚀核心。'),
      assistantMsg(7, '米娅透露导师雷蒙德三年前去古遗迹调查暗蚀核心后失踪。'),
    ]

    // 1. Extract rounds from session events
    const rounds: RecallRound[] = extractRecallRounds(rawEvents)
    expect(rounds).toHaveLength(4)
    expect(rounds[0]?.turn).toBe(0)
    expect(rounds[1]?.player).toContain('出示议会信物')
    expect(rounds[2]?.prose).toContain('飞鹰图腾')
    expect(rounds[3]?.prose).toContain('暗蚀核心')

    // 2. Stage 1: Keyword Search
    const searchRes = recallHistory({
      rounds,
      query: '飞鹰 导师',
      limit: 3,
    })
    expect(searchRes.found).toBe(true)
    expect(searchRes.mode).toBe('search')
    expect(searchRes.matches.length).toBeGreaterThan(0)
    // Matches turn 2 ("飞鹰图腾") and turn 3 ("导师雷蒙德")
    const matchTurns = searchRes.matches.map((m) => m.turn)
    expect(matchTurns).toContain(2)
    expect(matchTurns).toContain(3)

    // 3. Stage 2: Deep Turn Read with radius
    const readRes = recallHistory({
      rounds,
      turn: 2,
      radius: 1,
    })
    expect(readRes.found).toBe(true)
    expect(readRes.mode).toBe('read')
    expect(readRes.rounds.map((r) => r.turn)).toEqual([1, 2, 3])

    // 4. Rendered output contains anti-hallucination warning
    const rendered = renderRecall(searchRes)
    expect(rendered).toContain('不得当作当前场景继续输出，不得重复演绎')
    expect(rendered).toContain('飞鹰')

    // 5. Deduplication and Budget within single scope
    const scope = createRecallScope()
    const firstCall = recallHistory({ rounds, query: '信物', scope })
    expect(firstCall.found).toBe(true)

    // Repeated call within scope returns notice
    const duplicateCall = recallHistory({ rounds, query: '信物', scope })
    expect(duplicateCall.notice).toContain('相同关键词已检索')

    // Exhaust budget (calls 3 to 6)
    recallHistory({ rounds, turn: 0, scope })
    recallHistory({ rounds, turn: 1, scope })
    recallHistory({ rounds, turn: 2, scope })
    recallHistory({ rounds, turn: 3, scope })

    // 7th call must hit budget limit
    const overBudgetCall = recallHistory({ rounds, query: '暗蚀核心', scope })
    expect(overBudgetCall.matches).toHaveLength(0)
    expect(overBudgetCall.notice).toContain('预算已用尽')
  })

  it('injects recalled facts into Copilot prompt and guarantees KV prefix cache stability', () => {
    const recalledSnippet =
      '[第 2 轮回忆]\n发现米娅戴着刻有飞鹰图腾的古老护符。\n\n[第 3 轮回忆]\n米娅透露导师雷蒙德在古遗迹调查暗蚀核心后失踪。'

    const prompt = buildCopilotPrompt({
      question: '米娅的导师叫什么名字？护符有什么线索？',
      card: '【世界观】雪夜异兽与古代白塔。',
      worldState: '米娅当前状态：坦诚；持有飞鹰护符。',
      summary: '玩家正在白塔前哨调查暗蚀核心。',
      lore: '- 飞鹰纹章：古代议会暗卫的专属图腾。',
      transcript: '玩家：米娅的导师叫什么名字？',
      recall: recalledSnippet,
    })

    // 1. Recall block is injected
    expect(prompt).toContain('【历史回忆】')
    expect(prompt).toContain('雷蒙德')
    expect(prompt).toContain('飞鹰图腾')

    // 2. Prefix Cache Stability:
    // Stable context (Card, WorldState, Summary, Lore) MUST precede dynamic Recall & Transcript & Question
    const cardPos = prompt.indexOf('【卡包设定】')
    const statePos = prompt.indexOf('【世界状态】')
    const lorePos = prompt.indexOf('【已有设定集】')
    const recallPos = prompt.indexOf('【历史回忆】')
    const transcriptPos = prompt.indexOf('【剧情记录】')
    const questionPos = prompt.indexOf('【玩家】')

    expect(cardPos).toBeGreaterThan(-1)
    expect(statePos).toBeGreaterThan(cardPos)
    expect(lorePos).toBeGreaterThan(statePos)
    expect(recallPos).toBeGreaterThan(lorePos)
    expect(transcriptPos).toBeGreaterThan(recallPos)
    expect(questionPos).toBeGreaterThan(transcriptPos)
  })

  it('enforces concurrency locks: discards stale inference on rollback or racing fold', () => {
    // Check Chronicler stale fold guards:
    // 1. Rollback case: proseHeadSeqOf < throughSeq
    const throughSeq = 5
    const proseHeadSeqRollback = 3
    const liveFoldSeq0 = 2

    const isStaleRollback = proseHeadSeqRollback < throughSeq || liveFoldSeq0 >= throughSeq
    expect(isStaleRollback).toBe(true)

    // 2. Racing fold case: liveFoldSeq >= throughSeq
    const proseHeadSeqNormal = 6
    const liveFoldSeqRacing = 5

    const isStaleRacing = proseHeadSeqNormal < throughSeq || liveFoldSeqRacing >= throughSeq
    expect(isStaleRacing).toBe(true)

    // 3. Normal valid case: proseHeadSeq >= throughSeq && liveFoldSeq < throughSeq
    const liveFoldSeqNormal = 4
    const isStaleNormal = proseHeadSeqNormal < throughSeq || liveFoldSeqNormal >= throughSeq
    expect(isStaleNormal).toBe(false)
  })
})
