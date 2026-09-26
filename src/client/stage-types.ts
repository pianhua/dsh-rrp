/**
 * dsh-rrp — shared types for the Stage panel and card iframe sandbox.
 *
 * Separated as a leaf module to break the circular dependency between
 * stage-tab.tsx and stage-frame.tsx.
 */
import type { LoreEntry } from '../lore-state.ts'
import type { UiManifest } from '../ui-schema.ts'
import type { WorldState } from '../world-state.ts'

export type Translate = (key: string) => string

/** Narrow structural face of the host input machine that Stage uses for send_message. */
export interface StageInputActions {
  /** Replace the composer draft. */
  setDraft(text: string): void
  /** Submit the current draft. */
  submit(): void
}

/** Everything the stage panel and frame need from the host wiring. */
export interface StageApi {
  /** Load one card's validated UI declaration (cached; null = the card declares none). */
  loadManifest(cardId: string): Promise<UiManifest | null>
  /** Post a whole corrected slice through the player-correction channel. */
  correctState(sessionId: string, state: WorldState): Promise<void>
  /** Reveal 月停 and pre-fill one question (never auto-sent). */
  askCopilot(question: string): void
  /** Send one message as the player through the host input machine. */
  sendMessage(sessionId: string, text: string): Promise<void>
  /** Stage one lore entry for player confirmation. */
  draftLore(sessionId: string, entry: LoreEntry): Promise<void>
  /** Drop one card's cached declaration so the next load re-reads the disk. */
  forget(cardId: string): void
}
