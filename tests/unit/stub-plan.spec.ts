import { describe, expect, it } from 'vitest'
import {
  AUTHOR_GOLD,
  AUTHOR_MARKER,
  CALLER_SIGNATURES,
  CHRONICLER_PLACEHOLDER_GOLD,
  NEUTRAL_GOLD,
  WRONG_GOLD,
  callerOf,
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
    expect(planBlocks(chroniclerRequest())).toEqual([
      { type: 'text', text: CHRONICLER_PLACEHOLDER_GOLD },
    ])
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
      { type: 'text', text: CHRONICLER_PLACEHOLDER_GOLD },
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
})
