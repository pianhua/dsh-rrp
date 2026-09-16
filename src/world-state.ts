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
 * Safety caps. WorldState is the CURRENT slice, not an unbounded event log:
 * long play must not grow the injected fact baseline forever. Writers order
 * entries by importance, so a cap keeps the head.
 */
export const WORLD_STATE_LIMITS = {
  characters: 24,
  inventory: 40,
  flags: 16,
  /** Longest stored string value for one flag. */
  flagValueChars: 160,
} as const

/** Keep at most `limit` entries of a record, preserving key order. */
function capRecord<T>(record: Record<string, T>, limit: number): Record<string, T> {
  const keys = Object.keys(record)
  if (keys.length <= limit) return record
  const capped: Record<string, T> = {}
  for (const key of keys.slice(0, limit)) capped[key] = record[key] as T
  return capped
}

/** Bound one flag value's length so a single verbose flag cannot dominate. */
function capFlagValue(value: WorldStateFlag): WorldStateFlag {
  if (typeof value !== 'string' || value.length <= WORLD_STATE_LIMITS.flagValueChars) return value
  return value.slice(0, WORLD_STATE_LIMITS.flagValueChars) + '…'
}

/**
 * Bound a state to the safety caps. Pure; returns the SAME reference when the
 * state is already within limits (so the projection's Object.is gate holds).
 * @param state - the state to bound.
 * @returns the bounded state, or the input when nothing changed.
 */
export function pruneWorldState(state: WorldState): WorldState {
  const characters = capRecord(state.characters, WORLD_STATE_LIMITS.characters)
  const inventory = capRecord(state.inventory, WORLD_STATE_LIMITS.inventory)
  const head = capRecord(state.flags, WORLD_STATE_LIMITS.flags)
  let flags = head
  for (const [key, value] of Object.entries(head)) {
    const capped = capFlagValue(value)
    if (capped !== value) {
      if (flags === head) flags = { ...head }
      flags[key] = capped
    }
  }
  if (characters === state.characters && inventory === state.inventory && flags === state.flags) return state
  return { ...state, characters, inventory, flags }
}

/** Recursively sort object keys so only real changes alter the rendered text. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort()) sorted[key] = sortKeys(source[key])
    return sorted
  }
  return value
}

/**
 * Deterministic JSON (sorted keys). Key-order-only churn (the Chronicler
 * re-ordering "by importance") must NOT change the injected text: an unstable
 * rendering would invalidate the provider's prefix KV cache every turn.
 */
function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

/**
 * Render the state as the Author's fact baseline. Dependency-free so the
 * host injector and any client preview can share one wording.
 * The output is deterministic for a given state (see {@link stableJson}) so
 * unchanged state keeps the request prefix cacheable.
 * @param state - the current WorldState.
 * @returns the context text handed to the Author before a step.
 */
export function renderWorldState(state: WorldState): string {
  return [
    '【世界状态 · 事实基准】',
    '以下是你执笔时必须遵守的当前事实（由纪事官维护，玩家可能已就地修正）。不要把它写进正文，也不要输出这段文字。',
    '',
    'characters: ' + stableJson(state.characters),
    'inventory: ' + stableJson(state.inventory),
    'scene: ' + stableJson(state.scene),
    'flags: ' + stableJson(state.flags),
  ].join('\n')
}

/** Placeholder shown when a field had no value. */
const EMPTY_FIELD = '（空）'
/** Shown when a writer pass changed nothing material. */
export const NO_WORLD_STATE_CHANGE = '（无实质变化）'
/** Cap the digest so the panel line stays readable. */
const DIFF_CLAUSE_LIMIT = 6

/** Render one field value for the change digest. */
function showField(value: unknown): string {
  if (value === undefined || value === null || value === '') return EMPTY_FIELD
  return typeof value === 'string' ? value : String(value)
}

/** Every key present on either side, in first-seen order. */
function unionKeys<T>(before: Record<string, T>, after: Record<string, T>): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
}

/**
 * Human-readable digest of the difference between two states. This is what
 * makes a background state write attributable: the ledger stores it beside the
 * writer's name, so the player sees WHAT the Chronicler changed.
 * Dependency-free so host writers and the client panel share one wording.
 * @param prior - the state before the pass.
 * @param next - the state after the pass.
 * @returns a short clause list, or the no-change placeholder.
 */
export function diffWorldState(prior: WorldState, next: WorldState): string {
  const clauses: string[] = []

  const sceneFields: Array<[keyof WorldStateScene, string]> = [
    ['location', '地点'],
    ['time', '时间'],
    ['weather', '天气'],
  ]
  for (const [field, label] of sceneFields) {
    if (prior.scene?.[field] !== next.scene?.[field]) {
      clauses.push(label + ' ' + showField(prior.scene?.[field]) + ' → ' + showField(next.scene?.[field]))
    }
  }

  const characterFields: Array<[keyof WorldStateCharacter, string]> = [
    ['affinity', '好感'],
    ['mood', '情绪'],
    ['appearance', '外貌'],
    ['condition', '状态'],
  ]
  for (const name of unionKeys(prior.characters, next.characters)) {
    const before = prior.characters[name]
    const after = next.characters[name]
    if (before === undefined) {
      clauses.push('新增角色「' + name + '」')
      continue
    }
    if (after === undefined) {
      clauses.push('移除角色「' + name + '」')
      continue
    }
    for (const [field, label] of characterFields) {
      if (before[field] !== after[field]) {
        clauses.push('角色「' + name + '」' + label + ' ' + showField(before[field]) + ' → ' + showField(after[field]))
      }
    }
  }

  const itemFields: Array<[keyof WorldStateItem, string]> = [
    ['quantity', '数量'],
    ['note', '备注'],
  ]
  for (const name of unionKeys(prior.inventory, next.inventory)) {
    const before = prior.inventory[name]
    const after = next.inventory[name]
    if (before === undefined) {
      clauses.push('新增物品「' + name + '」')
      continue
    }
    if (after === undefined) {
      clauses.push('移除物品「' + name + '」')
      continue
    }
    for (const [field, label] of itemFields) {
      if (before[field] !== after[field]) {
        clauses.push('物品「' + name + '」' + label + ' ' + showField(before[field]) + ' → ' + showField(after[field]))
      }
    }
  }

  for (const key of unionKeys(prior.flags, next.flags)) {
    const before = prior.flags[key]
    const after = next.flags[key]
    if (before === undefined) {
      clauses.push('新事件「' + key + '」')
      continue
    }
    if (after === undefined) {
      clauses.push('移除事件「' + key + '」')
      continue
    }
    if (before !== after) clauses.push('事件「' + key + '」' + showField(before) + ' → ' + showField(after))
  }

  if (clauses.length === 0) return NO_WORLD_STATE_CHANGE
  const shown = clauses.slice(0, DIFF_CLAUSE_LIMIT)
  return clauses.length > shown.length
    ? shown.join('；') + '；…共 ' + clauses.length + ' 处变化'
    : shown.join('；')
}
