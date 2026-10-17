/**
 * Type surface for tests/e2e/support/stub-plan.mjs. The implementation stays plain .mjs because the
 * host loads the stub plugin without a TypeScript loader.
 */

export interface StubBlock {
  type: 'text'
  text: string
}

export const AUTHOR_MARKER: string
export const CHRONICLER_MARKER: string
export const AUTHOR_GOLD: string
export const CHRONICLER_PLACEHOLDER_GOLD: string
export const NEUTRAL_GOLD: string

export function planBlocks(latestUserText: string | undefined): StubBlock[]

export function latestUserText(
  messages: ReadonlyArray<{ role?: string; content?: unknown }>,
): string | undefined
