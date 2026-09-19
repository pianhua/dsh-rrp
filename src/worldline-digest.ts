/**
 * dsh-rrp — WorldlineDigest: per-turn save-slot facts for the map (issue #28).
 *
 * The map's node IS a player turn (every turn is an autosave). This slice
 * folds, turn by turn, what a save slot must show: the player's line, the
 * prose opening, and the state badge at that moment ("a save is only a save
 * if everything rolls back"). Dependency-free vocabulary shared by the host
 * projection fold (src/projection/worldline-digest.ts) and the map client;
 * the seq stamp lets the collector convert the host's inheritedEventCount
 * into seed turns without reading the log.
 */

/** Projection key for the worldline digest. */
export const WORLDLINE_DIGEST_KEY = 'rrpWorldlineDigest'

/** The save-slot badge: what the world looked like at this turn. */
export interface WorldlineBadge {
  location?: string
  time?: string
  /** Up to three tracked characters by affinity, highest first. */
  affinity?: Array<{ name: string; value: number }>
  /** One macro-summary line once the compass has produced one. */
  summary?: string
}

/** One turn as a save slot. */
export interface WorldlineTurnDigest {
  /** 0-based turn index over this session's FULL log (inherited prefix included). */
  turn: number
  /** Seq of the player message — the fork boundary for "reroll from here". */
  seq: number
  /** Player line, cut to the slot width. */
  player: string
  /** Prose opening of this turn (first assistant message), cut for hover. */
  prose: string
  badge?: WorldlineBadge
}

/** The incremental digest slice. */
export interface WorldlineDigest {
  turns: WorldlineTurnDigest[]
  /** Latest state watermark; written forward onto new turns and back onto the tail. */
  pending?: WorldlineBadge
}

/** The empty digest: no turns folded yet. */
export function emptyWorldlineDigest(): WorldlineDigest {
  return { turns: [] }
}
