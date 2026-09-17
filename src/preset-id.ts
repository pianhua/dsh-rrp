/**
 * dsh-rrp — agent-preset ids for the RP mode family.
 *
 * Card skills must be SCOPED to the card being played: the host's skill
 * registry layers contributions by the calling agent preset's scope, and
 * `skill-filesystem` scans one `bundledSkillDir` per preset. Mounting every
 * card's skills into one shared `rp` preset would leak one card's world
 * knowledge into every other card's sessions.
 *
 * So each card gets its own derived preset: `rp` (base, no card lore) plus
 * `rp-<card-id>` (that card's lore only). This module is dependency-free so the
 * browser gallery can derive the same id the host materialized.
 */

/** Base RP preset id; also the fallback for a cardless session. */
export const BASE_PRESET_ID = 'rp'

/** Canonical card ids are already legal, lossless preset-id suffixes. */
const CARD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Whether a value is a canonical card id and therefore a safe directory name. */
export function isCardId(value: string): boolean {
  return CARD_ID.test(value)
}

/** Return the card's lossless preset suffix, rejecting aliases and paths. */
export function cardPresetSuffix(cardId: string): string {
  if (!isCardId(cardId)) throw new Error('invalid card id: ' + cardId)
  return cardId
}

/**
 * Derive the preset id for one card.
 * @param cardId - the card's id (its directory name).
 * @returns `rp-<card-id>`.
 * @throws when the id is not canonical; lossy normalization would allow two
 *   cards to address the same preset directory.
 */
export function presetIdForCard(cardId: string): string {
  return BASE_PRESET_ID + '-' + cardPresetSuffix(cardId)
}

/**
 * Whether a session's `agentPreset` belongs to one preset family.
 * @param id - the session's preset id, or undefined before selection.
 * @param base - the family root (e.g. `rp`).
 * @returns whether the id is the root or a derived `<base>-*` preset.
 */
export function matchesPreset(id: string | undefined, base: string): boolean {
  return id === base || (id !== undefined && id.startsWith(base + '-'))
}

/** Whether a session's preset is any RP-family preset. */
export function belongsToRpPreset(id: string | undefined): boolean {
  return matchesPreset(id, BASE_PRESET_ID)
}
