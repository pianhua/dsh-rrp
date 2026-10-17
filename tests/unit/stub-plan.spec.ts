import { describe, expect, it } from 'vitest'
import { parseChroniclerReply } from '../../src/agents/chronicler.ts'
import type { WorldState } from '../../src/world-state.ts'
import { emptyWorldState } from '../../src/world-state.ts'
import {
  AUTHOR_GOLD,
  AUTHOR_MARKER,
  CALLER_SIGNATURES,
  NEUTRAL_GOLD,
  WRONG_GOLD,
  applyChroniclerChange,
  callerOf,
  chroniclerEnvelope,
  latestPlayerText,
  latestUserText,
  planBlocks,
  systemTextOf,
} from '../e2e/support/stub-plan.mjs'

/**
 * The stub script is ground truth for every later E2E assertion, so it is pinned here as a pure
 * function: no host, no child process, no clock, no environment.
 */

const authorRequest = (playerText: string) => ({
  messages: [
    {
      role: 'system',
      content: [{ type: 'text', text: CALLER_SIGNATURES.author + ' 后续六层……' }],
    },
    { role: 'user', content: [{ type: 'text', text: playerText }] },
  ],
})

const chroniclerRequest = () => ({
  messages: [
    { role: 'system', content: `${CALLER_SIGNATURES.chronicler}：只写状态，不写正文。` },
    { role: 'user', content: [{ type: 'text', text: '转录与上一版状态' }] },
  ],
})

describe('E2E 模型桩剧本（play-e2e 票据 03）', () => {
  it('reads the system prompt from both request shapes', () => {
    expect(systemTextOf({ system: 'one-shot 提示词' })).toBe('one-shot 提示词')
    expect(systemTextOf(authorRequest('x'))).toContain(CALLER_SIGNATURES.author)
    expect(systemTextOf({ messages: [{ role: 'user', content: '没有系统消息' }] })).toBe('')
    expect(systemTextOf(undefined)).toBe('')
  })

  it('identifies the caller from its contract-guarded identity line', () => {
    expect(callerOf(systemTextOf(chroniclerRequest()))).toBe('chronicler')
    expect(callerOf(systemTextOf(authorRequest('x')))).toBe('author')
    expect(callerOf(CALLER_SIGNATURES.copilot)).toBe('copilot')
    expect(callerOf('完全不认识的调用方')).toBe('unknown')
  })

  it('dispatches by caller first, then by the player marker', () => {
    expect(planBlocks(chroniclerRequest())).toEqual([{ type: 'text', text: chroniclerEnvelope() }])
    expect(planBlocks(authorRequest(`玩家推门而入 ${AUTHOR_MARKER}`))).toEqual([
      { type: 'text', text: AUTHOR_GOLD },
    ])
    // Author without a scene marker, and any unknown caller, both fall back to neutral prose.
    expect(planBlocks(authorRequest('随便一句'))).toEqual([{ type: 'text', text: NEUTRAL_GOLD }])
    expect(planBlocks({ messages: [{ role: 'user', content: AUTHOR_MARKER }] })).toEqual([
      { type: 'text', text: NEUTRAL_GOLD },
    ])
  })

  it('the negative control overrides the Author scene, never the Chronicler script', () => {
    expect(planBlocks(authorRequest(`推进 ${AUTHOR_MARKER}`), { wrongGold: true })).toEqual([
      { type: 'text', text: WRONG_GOLD },
    ])
    expect(planBlocks(chroniclerRequest(), { wrongGold: true })).toEqual([
      { type: 'text', text: chroniclerEnvelope() },
    ])
  })

  it('is deterministic: the same request always yields the same blocks', () => {
    const request = authorRequest(`${AUTHOR_MARKER} 输入`)
    const first = JSON.stringify(planBlocks(request))
    for (let run = 0; run < 5; run++) {
      expect(JSON.stringify(planBlocks(request))).toBe(first)
    }
  })

  it('reads the newest user message from both string and block content', () => {
    const messages = [
      { role: 'user', content: '最早的一条' },
      { role: 'assistant', content: '正文' },
      {
        role: 'user',
        content: [
          { type: 'text', text: '中间' },
          { type: 'text', text: '段' },
        ],
      },
      { role: 'system', content: '系统提示不应被选中' },
    ]
    expect(latestUserText(messages)).toBe('中间段')
    expect(latestUserText([{ role: 'assistant', content: '只有正文' }])).toBeUndefined()
    expect(latestUserText([])).toBeUndefined()
  })

  it('latestPlayerText skips trailing <system-reminder> bookkeeping to find the player voice', () => {
    const loopRequest = [
      { role: 'user', content: 'E2E-AUTHOR 她推门看了看雪。' },
      { role: 'assistant', content: '正文' },
      { role: 'user', content: '<system-reminder>宿主在回合后追加的提醒</system-reminder>' },
    ]
    expect(latestPlayerText(loopRequest)).toBe('E2E-AUTHOR 她推门看了看雪。')
    expect(latestUserText(loopRequest)).toBe(
      '<system-reminder>宿主在回合后追加的提醒</system-reminder>',
    )
    expect(
      latestPlayerText([{ role: 'user', content: '<system-reminder>只有提醒</system-reminder>' }]),
    ).toBeUndefined()
  })
})

describe('E2E Chronicler 剧本信封（play-e2e 票据 04）', () => {
  /**
   * The envelope is the contract ticket 04 asserts with: it must be accepted by the real
   * parseChroniclerReply (not just "look like JSON"), and the scripted change must be the
   * single source of truth both the stub (host side) and the spec (assert side) apply to
   * the card's initial state.
   */
  const cardState = (): WorldState => ({
    ...emptyWorldState(),
    trackedObjects: {
      inn: {
        id: 'inn',
        kind: 'scene',
        name: '孤灯客栈',
        fields: {
          time: {
            type: 'string',
            value: '入夜，封关第一晚',
            definition: 'card-defined',
            visibility: 'player',
          },
        },
      },
    },
    globalFields: {},
    objectives: [],
    conflicts: [],
    cognition: [],
    relations: [],
    currentEvents: [],
  })

  it('change envelope parses against the real chroniclerReplySchema', () => {
    const reply = parseChroniclerReply(chroniclerEnvelope(cardState()))
    expect(reply).toBeDefined()
    expect(reply?.state).toEqual(applyChroniclerChange(cardState()))
    expect(reply?.patch).toBeUndefined()
    expect(reply?.changeSummary).not.toContain(AUTHOR_MARKER)
  })

  it('change keeps every untouched part of the base state byte-identical', () => {
    const base = cardState()
    const changed = applyChroniclerChange(base) as unknown as WorldState
    expect(changed.trackedObjects.inn?.fields.time?.value).not.toBe(
      base.trackedObjects.inn?.fields.time?.value,
    )
    expect(changed.currentEvents).toHaveLength(1)
    expect(changed.trackedObjects.inn?.fields.time?.definition).toBe('card-defined')
  })

  it('no-op envelope (opening fold, no marker in evidence) parses and carries an empty patch', () => {
    const reply = parseChroniclerReply(chroniclerEnvelope())
    expect(reply).toBeDefined()
    expect(reply?.patch).toEqual({})
    expect(reply?.state).toBeUndefined()
  })

  it('planBlocks selects change vs no-op by the marker inside the Chronicler evidence', () => {
    const base = cardState()
    const marked = {
      messages: [
        { role: 'system', content: `${CALLER_SIGNATURES.chronicler}：只写状态。` },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `【本轮明确剧情证据】\n【玩家】\n${AUTHOR_MARKER} 她推门看了看雪。`,
            },
          ],
        },
      ],
    }
    const unmarked = {
      messages: [
        { role: 'system', content: `${CALLER_SIGNATURES.chronicler}：只写状态。` },
        { role: 'user', content: [{ type: 'text', text: '【本轮明确剧情证据】\n【叙述】\n序章' }] },
      ],
    }
    expect(planBlocks(marked, { cardState: base })).toEqual([
      { type: 'text', text: chroniclerEnvelope(base) },
    ])
    expect(planBlocks(unmarked, { cardState: base })).toEqual([
      { type: 'text', text: chroniclerEnvelope() },
    ])
  })

  it('envelopes are deterministic across repeated renders', () => {
    const first = chroniclerEnvelope(cardState())
    for (let run = 0; run < 5; run++) {
      expect(chroniclerEnvelope(cardState())).toBe(first)
    }
  })
})
