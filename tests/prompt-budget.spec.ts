import { describe, expect, it } from 'vitest'
import type { CardContext } from '../src/card-types.ts'
import { renderCardContext } from '../src/card-types.ts'
import type { MacroSummary } from '../src/macro-summary.ts'
import { renderMacroSummary } from '../src/macro-summary.ts'
import { PROMPT_BUDGET_WINDOW_TOKENS, estimateTokens, promptBudgetReport } from '../src/prompt-budget.ts'
import { emptyWorldState, renderWorldState, type WorldState } from '../src/world-state.ts'

const CARD: CardContext = { id: 'c', name: '测试卡', persona: '人设', worldCore: '世界核心' }
const SUMMARY: MacroSummary = { goal: '目标', conflict: '矛盾', turningPoints: [], threads: [] }

/** A state whose rendered size measures exactly `tokens` tokens. */
function stateWithTokens(tokens: number): WorldState {
  const probe = emptyWorldState()
  probe.characters = { 占位角色: { mood: '' } }
  const baseChars = renderWorldState(probe).length
  const targetChars = Math.floor(tokens * 3.2)
  probe.characters['占位角色'] = { mood: 'x'.repeat(Math.max(0, targetChars - baseChars)) }
  return probe
}

describe('estimateTokens', () => {
  it('estimates ~3.2 chars per token, rounded up', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('x')).toBe(1)
    expect(estimateTokens('x'.repeat(320))).toBe(100)
    expect(estimateTokens('x'.repeat(321))).toBe(101)
  })
})

describe('promptBudgetReport', () => {
  it('computes one section per present channel from the rendered texts', () => {
    const state = emptyWorldState()
    const report = promptBudgetReport({ card: CARD, summary: SUMMARY, state })
    expect(report.sections.map((section) => section.id)).toEqual(['card', 'summary', 'state'])
    const byId = Object.fromEntries(report.sections.map((section) => [section.id, section]))
    expect(byId.card?.chars).toBe(renderCardContext(CARD).length)
    expect(byId.summary?.chars).toBe(renderMacroSummary(SUMMARY).length)
    expect(byId.state?.chars).toBe(renderWorldState(state).length)
    expect(report.totalTokens).toBe(
      (byId.card?.tokens ?? 0) + (byId.summary?.tokens ?? 0) + (byId.state?.tokens ?? 0),
    )
  })

  it('omits sections for absent channels', () => {
    const withState = promptBudgetReport({ card: null, summary: undefined, state: emptyWorldState() })
    expect(withState.sections.map((section) => section.id)).toEqual(['state'])

    const empty = promptBudgetReport({ card: null, summary: undefined, state: undefined })
    expect(empty.sections).toEqual([])
    expect(empty.totalTokens).toBe(0)
    expect(empty.pct).toBe(0)
    expect(empty.level).toBe('ok')
  })

  it('treats a null card as absent', () => {
    const report = promptBudgetReport({ card: null, summary: SUMMARY, state: undefined })
    expect(report.sections.map((section) => section.id)).toEqual(['summary'])
  })

  it('adds the conditional-injection segment only for a positive injectedChars', () => {
    const absent = promptBudgetReport({ card: null, summary: undefined, state: undefined })
    expect(absent.sections).toEqual([])

    const zero = promptBudgetReport({ card: null, summary: undefined, state: undefined, injectedChars: 0 })
    expect(zero.sections).toEqual([])

    const sized = promptBudgetReport({ card: null, summary: undefined, state: undefined, injectedChars: 320 })
    expect(sized.sections).toEqual([{ id: 'triggers', chars: 320, tokens: 100 }])
    expect(sized.totalTokens).toBe(100)
  })

  it('levels at the 60% / 90% thresholds', () => {
    const justBelowWarn = Math.floor(PROMPT_BUDGET_WINDOW_TOKENS * 0.6) - 1 // 59.9%
    const atWarn = Math.floor(PROMPT_BUDGET_WINDOW_TOKENS * 0.6) // 60.0%
    const justBelowDanger = Math.ceil(PROMPT_BUDGET_WINDOW_TOKENS * 0.9) - 1 // 89.9%
    const atDanger = Math.ceil(PROMPT_BUDGET_WINDOW_TOKENS * 0.9) // 90.0%

    const levelOf = (tokens: number): string =>
      promptBudgetReport({ card: null, summary: undefined, state: stateWithTokens(tokens) }).level

    expect(levelOf(justBelowWarn)).toBe('ok')
    expect(levelOf(atWarn)).toBe('warn')
    expect(levelOf(justBelowDanger)).toBe('warn')
    expect(levelOf(atDanger)).toBe('danger')
  })

  it('reports the exact share with one decimal (floor)', () => {
    const tokens59 = Math.floor(PROMPT_BUDGET_WINDOW_TOKENS * 0.6) - 1
    const report = promptBudgetReport({ card: null, summary: undefined, state: stateWithTokens(tokens59) })
    expect(report.totalTokens).toBe(tokens59)
    expect(report.pct).toBe(59.9)
    expect(report.level).toBe('ok')
  })
})
