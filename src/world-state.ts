/**
 * dsh-rrp — WorldState: the current factual slice of the world.
 *
 * Dependency-free vocabulary shared by the host projection fold
 * (src/projection/world-state.ts) and the client panel. Keep this module free
 * of node/zod imports: it is part of the CLIENT-reachable bundle.
 *
 * D5: Unified flat model. Core domains (characters/inventory/scene/flags) and
 * dynamic fields share the same Record structure. Use helper functions to
 * distinguish between them.
 */

/** One character's live state. */
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

/**
 * D5: Dynamic field types. Extensible for future types.
 */
export type DynamicFieldType = 'number' | 'string' | 'boolean'

/**
 * D5: A dynamic field value with optional constraints.
 */
export interface DynamicFieldValue {
  type: DynamicFieldType
  value: number | string | boolean
  min?: number  // Only valid for type: 'number'
  max?: number  // Only valid for type: 'number'
}

/**
 * D5: WorldState — unified flat model.
 * Core domains use their original types.
 * Dynamic fields use DynamicFieldValue.
 */
export interface WorldState {
  characters: Record<string, WorldStateCharacter>
  inventory: Record<string, WorldStateItem>
  scene: WorldStateScene
  flags: Record<string, WorldStateFlag>
  
  /** D5: Dynamic fields stored as Record<string, DynamicFieldValue> */
  [key: string]: 
    | Record<string, WorldStateCharacter>
    | Record<string, WorldStateItem>
    | WorldStateScene
    | Record<string, WorldStateFlag>
    | DynamicFieldValue
}

/** Core domain keys (reserved). */
export const CORE_DOMAIN_KEYS = ['characters', 'inventory', 'scene', 'flags'] as const

/** Check if a key is a core domain. */
export function isCoreKey(key: string): boolean {
  return CORE_DOMAIN_KEYS.includes(key as typeof CORE_DOMAIN_KEYS[number])
}

/** Get all dynamic field keys from a WorldState. */
export function getDynamicKeys(state: WorldState): string[] {
  return Object.keys(state).filter(k => !isCoreKey(k))
}

/** The client-visible view. */
export type WorldStateView = WorldState

/** Projection key. */
export const WORLD_STATE_KEY = 'rrpWorldState'

/** A fresh empty state. */
export function emptyWorldState(): WorldState {
  return { 
    characters: {}, 
    inventory: {}, 
    scene: {}, 
    flags: {} 
  }
}

/**
 * D5: Validate dynamic field ID (must be valid identifier, not reserved).
 */
export function isValidFieldId(id: string): boolean {
  if (!/^[a-zA-Z0-9_]+$/.test(id)) return false
  if (isCoreKey(id)) return false
  return true
}

/**
 * D5: Apply constraints to a dynamic field value.
 */
export function applyConstraints(field: DynamicFieldValue): DynamicFieldValue {
  if (field.type === 'number' && typeof field.value === 'number') {
    let value = field.value
    if (field.min !== undefined && value < field.min) value = field.min
    if (field.max !== undefined && value > field.max) value = field.max
    if (value !== field.value) return { ...field, value }
  }
  return field
}

/**
 * Safety caps.
 */
export const WORLD_STATE_LIMITS = {
  characters: 24,
  inventory: 40,
  flags: 16,
  flagValueChars: 160,
  dynamicFields: 32,
} as const

/** Keep at most `limit` entries, preserving key order. */
function capRecord<T>(record: Record<string, T>, limit: number): Record<string, T> {
  const keys = Object.keys(record)
  if (keys.length <= limit) return record
  const capped: Record<string, T> = {}
  for (const key of keys.slice(0, limit)) capped[key] = record[key] as T
  return capped
}

/** Bound one flag value's length, ellipsis included. */
function capFlagValue(value: WorldStateFlag): WorldStateFlag {
  if (typeof value !== 'string' || value.length <= WORLD_STATE_LIMITS.flagValueChars) return value
  return value.slice(0, WORLD_STATE_LIMITS.flagValueChars - 1) + '…'
}

/**
 * Bound a state to the safety caps. Pure; returns SAME reference when within limits.
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
  
  // Cap dynamic fields count and apply constraints
  const dynamicKeys = getDynamicKeys(state)
  let pruned: WorldState = { ...state, characters, inventory, flags }
  let changed = characters !== state.characters || inventory !== state.inventory || flags !== state.flags
  
  if (dynamicKeys.length > WORLD_STATE_LIMITS.dynamicFields) {
    changed = true
    for (const key of dynamicKeys.slice(WORLD_STATE_LIMITS.dynamicFields)) {
      delete pruned[key]
    }
  }
  
  for (const key of dynamicKeys.slice(0, WORLD_STATE_LIMITS.dynamicFields)) {
    const field = state[key] as DynamicFieldValue
    const constrained = applyConstraints(field)
    if (constrained !== field) {
      changed = true
      pruned[key] = constrained
    }
  }
  
  return changed ? pruned : state
}

/** Recursively sort object keys. */
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

/** Deterministic JSON (sorted keys). */
function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

/**
 * Render the state as the Author's fact baseline.
 */
export function renderWorldState(state: WorldState): string {
  const lines = [
    '【世界状态 · 事实基准】',
    '以下是你执笔时必须遵守的当前事实（由纪事官维护，玩家可能已就地修正）。不要把它写进正文，也不要输出这段文字。',
    '',
    'characters: ' + stableJson(state.characters),
    'inventory: ' + stableJson(state.inventory),
    'scene: ' + stableJson(state.scene),
    'flags: ' + stableJson(state.flags),
  ]
  
  // D5: Render dynamic fields
  const dynamicKeys = getDynamicKeys(state).sort()
  if (dynamicKeys.length > 0) {
    lines.push('')
    lines.push('# 自定义状态字段')
    for (const key of dynamicKeys) {
      const field = state[key] as DynamicFieldValue
      lines.push(key + ': ' + stableJson(field.value))
    }
  }
  
  return lines.join('\n')
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
 * Human-readable digest of the difference between two states.
 */
export function diffWorldState(prior: WorldState, next: WorldState): string {
  const clauses: string[] = []

  const sceneFields: Array<[keyof WorldStateScene, string]> = [
    ['location', '地点'],
    ['time', '时间'],
    ['weather', '天气'],
  ]
  for (const [field, label] of sceneFields) {
    if (prior.scene[field] !== next.scene[field]) {
      clauses.push(label + ' ' + showField(prior.scene[field]) + ' → ' + showField(next.scene[field]))
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
    if (before !== after) {
      clauses.push('事件「' + key + '」' + showField(before) + ' → ' + showField(after))
    }
  }
  
  // D5: Diff dynamic fields
  const priorDynamic = getDynamicKeys(prior)
  const nextDynamic = getDynamicKeys(next)
  const allDynamic = [...new Set([...priorDynamic, ...nextDynamic])]
  
  for (const key of allDynamic) {
    const before = prior[key] as DynamicFieldValue | undefined
    const after = next[key] as DynamicFieldValue | undefined
    if (before === undefined) {
      clauses.push('新增字段「' + key + '」')
      continue
    }
    if (after === undefined) {
      clauses.push('移除字段「' + key + '」')
      continue
    }
    if (before.value !== after.value) {
      clauses.push('字段「' + key + '」' + showField(before.value) + ' → ' + showField(after.value))
      continue
    }
    // Value unchanged but bounds retuned (e.g. via createFields min/max):
    // surfaced so a constraints-only change is not silently swallowed.
    if (before.min !== after.min || before.max !== after.max) {
      clauses.push('字段「' + key + '」约束 ' + showField(before.min) + '~' + showField(before.max) + ' → ' + showField(after.min) + '~' + showField(after.max))
    }
  }

  if (clauses.length === 0) return NO_WORLD_STATE_CHANGE
  const shown = clauses.slice(0, DIFF_CLAUSE_LIMIT)
  return clauses.length > shown.length
    ? shown.join('；') + '；…共 ' + clauses.length + ' 处变化'
    : shown.join('；')
}

/**
 * D5: Helper to create a dynamic field.
 */
export function createDynamicField(
  type: DynamicFieldType,
  value: number | string | boolean,
  constraints?: { min?: number; max?: number }
): DynamicFieldValue {
  const field: DynamicFieldValue = { type, value }
  if (constraints?.min !== undefined) field.min = constraints.min
  if (constraints?.max !== undefined) field.max = constraints.max
  return applyConstraints(field)
}
