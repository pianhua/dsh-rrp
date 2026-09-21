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
 * One tracked relation: an undirected pair of endpoints plus a short label
 * (主仆 / 猜忌 / 亏欠 / 同盟 …). Endpoints are normalized character names;
 * the player is always written 「玩家」.
 */
export interface WorldStateRelation {
  a: string
  b: string
  label: string
}

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
  relations: WorldStateRelation[]

  /** D5: Dynamic fields stored as Record<string, DynamicFieldValue> */
  [key: string]:
    | Record<string, WorldStateCharacter>
    | Record<string, WorldStateItem>
    | WorldStateScene
    | Record<string, WorldStateFlag>
    | WorldStateRelation[]
    | DynamicFieldValue
}

/** Core domain keys (reserved). */
export const CORE_DOMAIN_KEYS = ['characters', 'inventory', 'scene', 'flags', 'relations'] as const

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
    flags: {},
    relations: [],
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
  // A string field has a declared length ceiling too, so no write path
  // (Chronicler createFields, 月停 patch, player correction) can grow one.
  if (field.type === 'string' && typeof field.value === 'string') {
    const capped = capString(field.value, WORLD_STATE_LIMITS.dynamicStringChars)
    if (capped !== field.value) return { ...field, value: capped }
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
  /** Ceiling for any string-valued dynamic field (incl. the player persona). */
  dynamicStringChars: 400,
  relations: 16,
} as const

/**
 * Lean targets the Chronicler prompt asks for, deliberately below the caps
 * above: a cap silently drops whatever sits past the tail, so the model is
 * told to stay well inside it. Both numbers are named here so the prompt and
 * the caps cannot drift apart.
 */
export const WORLD_STATE_TARGETS = {
  flags: 12,
  relations: 12,
} as const

/** Keep at most `limit` entries, preserving key order. */
function capRecord<T>(record: Record<string, T>, limit: number): Record<string, T> {
  const keys = Object.keys(record)
  if (keys.length <= limit) return record
  const capped: Record<string, T> = {}
  for (const key of keys.slice(0, limit)) capped[key] = record[key] as T
  return capped
}

/** Bound a stored string's length; the cut tail becomes an ellipsis. */
function capString(value: string, limit: number): string {
  if (value.length <= limit) return value
  return value.slice(0, limit - 1) + '…'
}

/** Player aliases (case-insensitive) that normalize to 「玩家」. */
const PLAYER_ENDPOINT_ALIASES = new Set(['我', '你', '玩家', '主角', 'user', 'player'])

/** Bracketed modifiers stripped from a relation endpoint: （…）(…) […]【…】. */
const BRACKET_MODIFIER = /（[^（）]*）|\([^()]*\)|【[^【】]*】|\[[^[\]]*\]/g

/**
 * Normalize one relation endpoint: trim → drop bracket modifiers (titles,
 * notes, aliases in parentheses) → map player aliases to 「玩家」. Traditional
 * characters and other names pass through untouched.
 */
export function normalizeRelationEndpoint(name: string): string {
  const text = String(name ?? '').replace(BRACKET_MODIFIER, '').trim()
  if (PLAYER_ENDPOINT_ALIASES.has(text.toLowerCase())) return '玩家'
  return text
}

/**
 * Normalize a relation list: endpoints via normalizeRelationEndpoint, drop
 * blank entries, dedupe undirected pairs (key = sorted a+b) with the LAST
 * occurrence winning. Pure; returns the SAME reference when nothing changed.
 */
export function normalizeRelations(relations: WorldStateRelation[]): WorldStateRelation[] {
  const byPair = new Map<string, WorldStateRelation>()
  let changed = false
  for (const rel of relations) {
    const a = normalizeRelationEndpoint(rel.a)
    const b = normalizeRelationEndpoint(rel.b)
    const label = String(rel.label ?? '').trim()
    if (a.length === 0 || b.length === 0 || label.length === 0) {
      changed = true
      continue
    }
    if (a !== rel.a || b !== rel.b || label !== rel.label) changed = true
    const key = [a, b].sort().join(' ')
    if (byPair.has(key)) {
      changed = true
      // Same-key later entry overrides the earlier one (last write wins).
      byPair.set(key, { a, b, label })
    } else {
      byPair.set(key, { a, b, label })
    }
  }
  if (byPair.size === relations.length && !changed) return relations
  return [...byPair.values()]
}

/** Keep at most `limit` relations, preserving order. */
function capRelations(relations: WorldStateRelation[], limit: number): WorldStateRelation[] {
  return relations.length <= limit ? relations : relations.slice(0, limit)
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
    if (typeof value !== 'string') continue
    const capped = capString(value, WORLD_STATE_LIMITS.flagValueChars)
    if (capped !== value) {
      if (flags === head) flags = { ...head }
      flags[key] = capped
    }
  }

  // Relations: normalize endpoints/pairs on every write path, then cap.
  const relations = capRelations(normalizeRelations(state.relations ?? []), WORLD_STATE_LIMITS.relations)

  // Cap dynamic fields count and apply constraints
  const dynamicKeys = getDynamicKeys(state)
  const pruned: WorldState = { ...state, characters, inventory, flags, relations }
  let changed = characters !== state.characters || inventory !== state.inventory || flags !== state.flags
    || relations !== state.relations
  
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

/** Deterministic JSON (sorted keys). Shared so equality never depends on key order. */
export function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

/**
 * Deep equality of two slices, independent of key insertion order. Used by the
 * writers' "did anything actually change" checks — `JSON.stringify` on raw
 * objects would call a reorder a real change and discard good inference.
 */
export function worldStatesEqual(prior: WorldState, next: WorldState): boolean {
  return stableJson(prior) === stableJson(next)
}

/**
 * Render the state as the Author's fact baseline.
 */
export function renderWorldState(state: WorldState): string {
  const lines = [
    '【世界状态 · 事实基准】',
    '以下是你执笔时必须遵守的当前事实（由状态推演维护，玩家可能已就地修正）。不要把它写进正文，也不要输出这段文字。',
    '',
    'characters: ' + stableJson(state.characters),
    'inventory: ' + stableJson(state.inventory),
    'scene: ' + stableJson(state.scene),
    'flags: ' + stableJson(state.flags),
    'relations: ' + stableJson(state.relations ?? []),
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

  // Relations: undirected pairs keyed by sorted endpoints.
  const relationKey = (rel: WorldStateRelation): string => [rel.a, rel.b].sort().join(' ')
  const priorRelations = new Map((prior.relations ?? []).map((rel) => [relationKey(rel), rel] as [string, WorldStateRelation]))
  const nextRelations = new Map((next.relations ?? []).map((rel) => [relationKey(rel), rel] as [string, WorldStateRelation]))
  const allRelationKeys = [...new Set([...priorRelations.keys(), ...nextRelations.keys()])]
  for (const key of allRelationKeys) {
    const before = priorRelations.get(key)
    const after = nextRelations.get(key)
    if (before === undefined && after !== undefined) {
      clauses.push('新增关系「' + after.a + ' × ' + after.b + '（' + after.label + '）」')
      continue
    }
    if (after === undefined && before !== undefined) {
      clauses.push('移除关系「' + before.a + ' × ' + before.b + '（' + before.label + '）」')
      continue
    }
    if (before !== undefined && after !== undefined && before.label !== after.label) {
      clauses.push('「' + after.a + ' × ' + after.b + '」关系 ' + showField(before.label) + ' → ' + showField(after.label))
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

/**
 * P1-B (issue #31): merge the player's self-authored persona (appearance,
 * personality, background) into the initial state as the `player` dynamic
 * string field. It then rides the facts lane the Author already reads every
 * turn, survives Chronicler replays like any D5 field, and stays editable
 * mid-run in the world-state tab's dynamic-field editor — zero schema
 * changes. Empty persona = the state passes through untouched (same ref).
 */
export function withPlayerPersona(state: WorldState | null, persona: string): WorldState | null {
  const text = persona.trim()
  if (text.length === 0) return state
  const base = state ?? emptyWorldState()
  return { ...base, player: createDynamicField('string', text) }
}
