/**
 * dsh-rrp — in-memory staging store for unconfirmed knowledge lore drafts.
 *
 * Separated as a leaf module to break the circular dependency between
 * lore-route.ts and lore-runtime.ts.
 */
import type { LoreEntry } from './lore-state.ts'

/** Staged drafts, one per session; never durable — the player confirms or drops. */
export const PENDING = new Map<string, LoreEntry>()
/** Sessions with a Scribe pass in flight (one at a time). */
export const DRAFTING = new Set<string>()

/** Forget staged drafts and in-flight drafting state when a session is disposed. */
export function forgetLore(sessionId: string): void {
  PENDING.delete(sessionId)
  DRAFTING.delete(sessionId)
}

/** Drop every staged draft (plugin unload must not leave stale sessions behind). */
export function forgetAllLore(): void {
  PENDING.clear()
  DRAFTING.clear()
}

/** Check whether a session has pending or drafting state (for testing / inspection). */
export function hasLoreDraft(sessionId: string): boolean {
  return PENDING.has(sessionId) || DRAFTING.has(sessionId)
}

/** Set staged draft for testing. */
export function stageLoreDraftForTesting(sessionId: string, entry: LoreEntry): void {
  PENDING.set(sessionId, entry)
}
