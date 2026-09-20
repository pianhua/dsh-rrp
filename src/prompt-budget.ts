/**
 * dsh-rrp — prompt-budget gauge vocabulary.
 *
 * The Author sees exactly card context + macro summary + world state (see
 * src/state-publisher.ts); this module sizes that injected text against a
 * nominal context window so the client can show a compact gauge. The figure
 * is an ESTIMATE for orientation only — it does not account for the system
 * prompt, skills, or transcript. Dependency-free: host and client share it.
 */
import type { CardContext } from './card-types.ts'
import { renderCardContext } from './card-types.ts'
import type { MacroSummary } from './macro-summary.ts'
import { renderMacroSummary } from './macro-summary.ts'
import type { WorldState } from './world-state.ts'
import { renderWorldState } from './world-state.ts'

/**
 * Gauge baseline: a common 128K-token context window. Only a yardstick for
 * the estimate, not a provider-reported limit.
 */
export const PROMPT_BUDGET_WINDOW_TOKENS = 128_000

/** Rough token estimate: Chinese text averages ~3.2 chars per token. */
const CHARS_PER_TOKEN = 3.2

/**
 * Tokens for a text that is not in hand — the same estimate, rounded UP,
 * without materializing a stand-in string.
 * @param charCount - characters to size.
 */
export function estimateTokensOfChars(charCount: number): number {
  return Math.ceil(charCount / CHARS_PER_TOKEN)
}

/**
 * Rough token estimate for a text (any language; tuned for Chinese).
 * @param chineseText - the text to size.
 */
export function estimateTokens(chineseText: string): number {
  return estimateTokensOfChars(chineseText.length)
}

/** One gauge segment: the rendered text of one injection channel. */
export interface BudgetSection {
  id: 'card' | 'summary' | 'state' | 'triggers'
  chars: number
  tokens: number
}

/** The gauge reading: per-section sizes, total, share and severity level. */
export interface BudgetReport {
  sections: BudgetSection[]
  totalTokens: number
  /** Share of the window in percent, one decimal (floor). */
  pct: number
  level: 'ok' | 'warn' | 'danger'
}

/**
 * Size the injection channels the model actually sees.
 * Absent channels contribute no section (card null, summary/state undefined).
 * `injectedChars` is the conditional-injection block's payload size served by
 * the lore route (issue #16); zero/undefined adds no segment.
 */
export function promptBudgetReport(input: {
  card: CardContext | null
  summary: MacroSummary | undefined
  state: WorldState | undefined
  injectedChars?: number
}): BudgetReport {
  const sections: BudgetSection[] = []
  const push = (id: BudgetSection['id'], text: string): void => {
    sections.push({ id, chars: text.length, tokens: estimateTokens(text) })
  }
  if (input.card !== null && input.card !== undefined) push('card', renderCardContext(input.card))
  if (input.summary !== undefined) push('summary', renderMacroSummary(input.summary))
  if (input.state !== undefined) push('state', renderWorldState(input.state))
  if (input.injectedChars !== undefined && input.injectedChars > 0) {
    sections.push({ id: 'triggers', chars: input.injectedChars, tokens: estimateTokensOfChars(input.injectedChars) })
  }

  const totalTokens = sections.reduce((sum, section) => sum + section.tokens, 0)
  const pct = Math.floor((totalTokens * 1000) / PROMPT_BUDGET_WINDOW_TOKENS) / 10
  const level = pct < 60 ? 'ok' : pct < 90 ? 'warn' : 'danger'
  return { sections, totalTokens, pct, level }
}
