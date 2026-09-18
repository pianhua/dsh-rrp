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

/** The active card's model-facing setting (projected; never player-facing). */
export interface CardContext {
  id: string
  name: string
  persona: string
  worldCore: string
  player?: CardPlayer
}

/** Projection key for the active card. */
export const CARD_KEY = 'rrpCard'

/**
 * Substitute the minimal card template variables in a free-text field.
 * Supported: `{{player.name}}`, `{{player.description}}` (empty string when
 * the card declares no player). Unknown variables are left untouched.
 * @param text - card-authored text (opening, persona, world core).
 * @param player - the declared player character, if any.
 * @returns the text with player variables resolved.
 */
export function interpolateCardText(text: string, player: CardPlayer | undefined): string {
  if (!text.includes('{{')) return text
  return text
    .replaceAll('{{player.name}}', player?.name ?? '')
    .replaceAll('{{player.description}}', player?.description ?? '')
}

/**
 * Render the card setting as the Author's immutable world baseline.
 * Dependency-free so host and any client preview share one wording.
 * @param card - the active card context.
 * @returns the context text handed to the Author before a step.
 */
export function renderCardContext(card: CardContext): string {
  const lines = ['【当前卡包 · 设定基准】', '卡包：' + card.name]
  if (card.player !== undefined) {
    lines.push('玩家角色：' + card.player.name + (card.player.description === undefined ? '' : ' — ' + card.player.description))
  }
  if (card.worldCore.length > 0) lines.push('', '—— 世界核心 ——', interpolateCardText(card.worldCore, card.player))
  if (card.persona.length > 0) lines.push('', '—— 人设与规则 ——', interpolateCardText(card.persona, card.player))
  lines.push('', '以上是本次游玩的既定设定，必须遵守；不要把它们当作正文输出。')
  return lines.join('\n')
}

