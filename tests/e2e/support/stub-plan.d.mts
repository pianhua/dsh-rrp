/**
 * Type surface for tests/e2e/support/stub-plan.mjs. The implementation stays plain .mjs because the
 * host loads the stub plugin without a TypeScript loader.
 */

export interface StubBlock {
  type: 'text'
  text: string
}

export type StubCaller = 'author' | 'chronicler' | 'copilot' | 'unknown'

/** The single scripted Chronicler change (ticket 04): both sides derive the expected state from it. */
export interface ChroniclerGoldChange {
  timeValue: string
  event: {
    id: string
    type: string
    fact: string
    relatedObjects: Array<{ objectId: string }>
    status: string
  }
  changeSummary: string
  evidence: string[]
}

export const CALLER_SIGNATURES: Record<'author' | 'chronicler' | 'copilot', string>
export const STUB_PROVIDER: string
export const AUTHOR_MARKER: string
export const AUTHOR_GOLD: string
export const CHRONICLER_GOLD_CHANGE: ChroniclerGoldChange
export const NEUTRAL_GOLD: string
export const WRONG_GOLD: string

export function systemTextOf(input: unknown): string
export function callerOf(systemText: string): StubCaller
export function latestUserText(
  messages: ReadonlyArray<{ role?: string; content?: unknown }>,
): string | undefined
/** Newest user text that is not a `<system-reminder>` bookkeeping message (the player's voice). */
export function latestPlayerText(
  messages: ReadonlyArray<{ role?: string; content?: unknown }>,
): string | undefined
/** Apply the scripted change to a complete WorldState v2 snapshot; throws when the shape is unusable. */
export function applyChroniclerChange(baseState: unknown): Record<string, unknown>
/** Render the Chronicler reply envelope; omit baseState for the no-op (empty patch) envelope. */
export function chroniclerEnvelope(baseState?: unknown): string
export function planBlocks(
  input: unknown,
  options?: { wrongGold?: boolean; cardState?: unknown },
): StubBlock[]
