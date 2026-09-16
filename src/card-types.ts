/**
 * dsh-rrp — card-pack vocabulary, shared by the host loader and the client
 * gallery. Dependency-free: no node imports, so the browser bundle can import
 * it (\`src/cards.ts\` adds filesystem parsing on top).
 */
import type { WorldState } from './world-state.ts'

/** Declared player character (solves "the Author does not know who you are"). */
export interface CardPlayer {
  name: string
  description?: string
}

/** Card-level metadata from \`card.md\` frontmatter. */
export interface CardMeta {
  id: string
  name: string
  summary?: string
  tags: string[]
  /** Default opening file id (without extension). */
  opening: string
  version?: string
  author?: string
  player?: CardPlayer
}

/** One opening greeting. */
export interface CardOpening {
  id: string
  body: string
}

/** One world-knowledge skill bundled by the card. */
export interface CardSkill {
  id: string
  name?: string
  description?: string
  dir: string
}

/** A fully parsed card. */
export interface CardPack {
  id: string
  dir: string
  meta: CardMeta
  /** Persona/rules appended to the Author for sessions using this card. */
  persona: string
  /** The card.md body: the always-on world core. */
  worldCore: string
  openings: CardOpening[]
  initialState: WorldState | null
  skills: CardSkill[]
}
