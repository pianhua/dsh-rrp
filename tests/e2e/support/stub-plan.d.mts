/**
 * Type surface for tests/e2e/support/stub-plan.mjs. The implementation stays plain .mjs because the
 * host loads the stub plugin without a TypeScript loader.
 */

export interface StubBlock {
  type: 'text'
  text: string
}

export type StubCaller = 'author' | 'chronicler' | 'copilot' | 'unknown'

export const CALLER_SIGNATURES: Record<'author' | 'chronicler' | 'copilot', string>
export const AUTHOR_MARKER: string
export const AUTHOR_GOLD: string
export const CHRONICLER_PLACEHOLDER_GOLD: string
export const NEUTRAL_GOLD: string
export const WRONG_GOLD: string

export function systemTextOf(input: unknown): string
export function callerOf(systemText: string): StubCaller
export function latestUserText(
  messages: ReadonlyArray<{ role?: string; content?: unknown }>,
): string | undefined
export function planBlocks(input: unknown, options?: { wrongGold?: boolean }): StubBlock[]
