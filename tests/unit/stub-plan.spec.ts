import { describe, expect, it } from 'vitest'
import {
  AUTHOR_GOLD,
  AUTHOR_MARKER,
  CHRONICLER_MARKER,
  CHRONICLER_PLACEHOLDER_GOLD,
  NEUTRAL_GOLD,
  latestUserText,
  planBlocks,
} from '../e2e/support/stub-plan.mjs'

/**
 * The stub script is the ground truth for every later E2E assertion, so it is pinned here as a pure
 * function: no host, no child process, no clock.
 */
describe('E2E 模型桩剧本（play-e2e 票据 02）', () => {
  it('selects gold by marker and falls back to neutral text', () => {
    expect(planBlocks(`请继续 ${AUTHOR_MARKER} 玩家推门而入`)).toEqual([
      { type: 'text', text: AUTHOR_GOLD },
    ])
    expect(planBlocks(`${CHRONICLER_MARKER} 结算本回合`)).toEqual([
      { type: 'text', text: CHRONICLER_PLACEHOLDER_GOLD },
    ])
    expect(planBlocks('随便一句')).toEqual([{ type: 'text', text: NEUTRAL_GOLD }])
    expect(planBlocks(undefined)).toEqual([{ type: 'text', text: NEUTRAL_GOLD }])
  })

  it('is deterministic: the same request always yields the same blocks', () => {
    const first = JSON.stringify(planBlocks(`${AUTHOR_MARKER} 输入`))
    for (let run = 0; run < 5; run++) {
      expect(JSON.stringify(planBlocks(`${AUTHOR_MARKER} 输入`))).toBe(first)
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
