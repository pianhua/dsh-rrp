/**
 * dsh-rrp — WorldState: the current factual slice of the world.
 *
 * Dependency-free vocabulary shared by the host projection fold
 * (src/projection/world-state.ts) and the client panel. Keep this module free
 * of node/zod imports: it is part of the CLIENT-reachable bundle.
 */

/** One character's live state. The Chronicler may add keys over time (D5). */
export interface WorldStateCharacter {
  affinity?: number
  mood?: string
  appearance?: string
  condition?: string
}

/** One inventory item. */
export interface WorldStateItem {
  quantity?: number
  note?: string
}

/** The current scene. */
export interface WorldStateScene {
  location?: string
  time?: string
  weather?: string
}

/** A flag: a secret learned, a promise made, an event triggered. */
export type WorldStateFlag = string | number | boolean

/** The world's factual slice — the player's correction surface (D6). */
export interface WorldState {
  characters: Record<string, WorldStateCharacter>
  inventory: Record<string, WorldStateItem>
  scene: WorldStateScene
  flags: Record<string, WorldStateFlag>
}

/** The client-visible view. Identical today; a separate name allows versioning. */
export type WorldStateView = WorldState

/** Session event type carrying a complete post-change WorldState (whole-value rule). */
export const WORLD_STATE_EVENT = 'rrp/world-state'

/** Projection key, also the client `useProjection(key)` lookup key. */
export const WORLD_STATE_KEY = 'rrpWorldState'

/** A fresh empty state (never share one object across sessions). */
export function emptyWorldState(): WorldState {
  return { characters: {}, inventory: {}, scene: {}, flags: {} }
}

/**
 * Render the state as the Author's fact baseline. Dependency-free so the
 * host injector and any client preview can share one wording.
 * @param state - the current WorldState.
 * @returns the context text handed to the Author before a step.
 */
export function renderWorldState(state: WorldState): string {
  return [
    '【世界状态 · 事实基准】',
    '以下是你执笔时必须遵守的当前事实（由纪事官维护，玩家可能已就地修正）。不要把它写进正文，也不要输出这段文字。',
    '',
    'characters: ' + JSON.stringify(state.characters),
    'inventory: ' + JSON.stringify(state.inventory),
    'scene: ' + JSON.stringify(state.scene),
    'flags: ' + JSON.stringify(state.flags),
  ].join('\n')
}
