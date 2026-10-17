/**
 * dsh-rrp — WorldlineDigest: per-turn save-slot facts for the map (issue #28).
 *
 * The map's node IS a player turn (every turn is an autosave). This slice
 * folds, turn by turn, what a save slot must show: the player's line, the
 * prose opening, the state badge at that moment ("a save is only a save
 * if everything rolls back"), and WHO booked that state (the WorldState v2
 * timeline provenance). Dependency-free vocabulary shared by the host
 * projection fold (src/projection/worldline-digest.ts) and the map client.
 *
 * v2 (D24): turn numbers are ABSOLUTE across the lineage (a child continues
 * the parent's numbering) and survive the tail cap via the nextTurn counter;
 * the inherited-prefix length (seedTurns) freezes on the first LOCAL player
 * message, so topology never derives from how many entries the cap kept.
 */

/** Projection key for the worldline digest. */
export const WORLDLINE_DIGEST_KEY = 'rrpWorldlineDigest'

/** The save-slot badge: what the world looked like at this turn. Rebuilt WHOLE
 * from each state publish — a field that disappears disappears (WorldState v2
 * delete semantics), never carried over from the previous badge. */
export interface WorldlineBadge {
  location?: string
  time?: string
  /** Up to three tracked characters by affinity, highest first. */
  affinity?: Array<{ name: string; value: number }>
  /** One macro-summary line once the compass has produced one. */
  summary?: string
}

/** Per-turn state attribution, folded from the WorldState v2 timeline batch
 * that booked this turn's state (D24). Absent when no batch is attached. */
export interface WorldlineTurnMeta {
  /** Who booked this turn's state. */
  actor?: 'initial-state' | 'player' | 'chronicler' | 'copilot' | 'system' | 'unknown'
  /** Whether that batch is inherited prefix or produced by this line itself. */
  origin?: 'inherited' | 'local'
  /** Number of changes in the batch (baseline: 0/absent). */
  changeCount?: number
}

/** One turn as a save slot. */
export interface WorldlineTurnDigest {
  /** ABSOLUTE turn number: continuous across the lineage (the inherited prefix
   * included), monotonic via nextTurn, independent of the tail cap. */
  turn: number
  /** Seq of the player message — the fork boundary for "fork from here". */
  seq: number
  /** Player line, cut to the slot width. */
  player: string
  /** Prose opening of this turn (last assistant message), cut for hover. */
  prose: string
  badge?: WorldlineBadge
  meta?: WorldlineTurnMeta
}

/** The incremental digest slice. */
export interface WorldlineDigest {
  turns: WorldlineTurnDigest[]
  /** Next absolute turn number to allocate. Monotone; the tail cap never
   * rewinds it, so long histories keep exact turn coordinates. */
  nextTurn: number
  /**
   * Turn number of this line's FIRST LOCAL player message — all earlier turns
   * are the inherited prefix (= the fork cut, seedTurns). Frozen once; absent
   * until then, in which case seedTurnsOf() reads nextTurn (a pending fork
   * whose inherited length is "everything folded so far").
   */
  firstLocalTurn?: number
  /** Fork-cut turn numbers of children forked FROM this session (D24). The
   * tail cap must never drop these nodes nor their predecessor: they are the
   * mount points every child tree attaches to. */
  forkCuts: number[]
  /** Latest state badge watermark; forwarded onto the next new turn. */
  pending?: WorldlineBadge
}

/** The fork cut: how many full turns of the parent this line inherited. */
export function seedTurnsOf(digest: WorldlineDigest): number {
  return digest.firstLocalTurn ?? digest.nextTurn
}

/** The empty digest: no turns folded yet. */
export function emptyWorldlineDigest(): WorldlineDigest {
  return { turns: [], nextTurn: 0, forkCuts: [] }
}
