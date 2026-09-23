import {
  createDynamicField,
  getDynamicKeys,
  isValidFieldId,
  type DynamicFieldValue,
  type WorldState,
  type WorldStateCharacter,
  type WorldStateItem,
  type WorldStateRelation,
  type WorldStateView,
} from '../world-state.ts'

export interface CharacterDraftRow {
  name: string
  affinity: string
  mood: string
  appearance: string
  condition: string
}

export interface InventoryDraftRow {
  name: string
  quantity: string
  note: string
}

export interface FlagDraftRow {
  key: string
  value: string
}

export interface SceneDraft {
  location: string
  time: string
  weather: string
}

export interface DynamicFieldDraftRow {
  id: string
  type: DynamicFieldValue['type']
  value: string
  min?: string
  max?: string
}

export interface WorldStateDraft {
  characters: CharacterDraftRow[]
  inventory: InventoryDraftRow[]
  flags: FlagDraftRow[]
  scene: SceneDraft
  relations: WorldStateRelation[]
  dynamicFields: DynamicFieldDraftRow[]
}

export function draftOf(view: WorldStateView | undefined): WorldStateDraft {
  const dynamicKeys = view ? getDynamicKeys(view) : []
  const dynamicFields: DynamicFieldDraftRow[] = dynamicKeys.map((id) => {
    const field = view![id] as DynamicFieldValue
    return {
      id,
      type: field.type,
      value: String(field.value),
      min: field.min !== undefined ? String(field.min) : undefined,
      max: field.max !== undefined ? String(field.max) : undefined,
    }
  })

  return {
    characters: Object.entries(view?.characters ?? {}).map(([name, value]) => ({
      name,
      affinity: value.affinity === undefined ? '' : String(value.affinity),
      mood: value.mood ?? '',
      appearance: value.appearance ?? '',
      condition: value.condition ?? '',
    })),
    inventory: Object.entries(view?.inventory ?? {}).map(([name, value]) => ({
      name,
      quantity: value.quantity === undefined ? '' : String(value.quantity),
      note: value.note ?? '',
    })),
    flags: Object.entries(view?.flags ?? {}).map(([key, value]) => ({ key, value: String(value) })),
    scene: {
      location: view?.scene?.location ?? '',
      time: view?.scene?.time ?? '',
      weather: view?.scene?.weather ?? '',
    },
    relations: (view?.relations ?? []).map((rel) => ({ ...rel })),
    dynamicFields,
  }
}

export function isEmptyDraft(draft: WorldStateDraft): boolean {
  return (
    draft.characters.length === 0 &&
    draft.inventory.length === 0 &&
    draft.flags.length === 0 &&
    draft.relations.length === 0 &&
    draft.scene.location.length === 0 &&
    draft.scene.time.length === 0 &&
    draft.scene.weather.length === 0 &&
    draft.dynamicFields.length === 0
  )
}

export function parseFlagValue(raw: string): string | number | boolean {
  const text = raw.trim()
  if (text === 'true') return true
  if (text === 'false') return false
  if (text.length > 0 && !Number.isNaN(Number(text))) return Number(text)
  return raw
}

export function stateOfDraft(draft: WorldStateDraft): WorldState {
  const characters: Record<string, WorldStateCharacter> = {}
  for (const row of draft.characters) {
    const name = row.name.trim()
    if (name.length === 0) continue
    const entry: WorldStateCharacter = {}
    const affinity = row.affinity.trim()
    if (affinity.length > 0 && !Number.isNaN(Number(affinity))) entry.affinity = Number(affinity)
    if (row.mood.trim().length > 0) entry.mood = row.mood.trim()
    if (row.appearance.trim().length > 0) entry.appearance = row.appearance.trim()
    if (row.condition.trim().length > 0) entry.condition = row.condition.trim()
    characters[name] = entry
  }
  const inventory: Record<string, WorldStateItem> = {}
  for (const row of draft.inventory) {
    const name = row.name.trim()
    if (name.length === 0) continue
    const entry: WorldStateItem = {}
    const quantity = row.quantity.trim()
    if (quantity.length > 0 && !Number.isNaN(Number(quantity))) entry.quantity = Number(quantity)
    if (row.note.trim().length > 0) entry.note = row.note.trim()
    inventory[name] = entry
  }
  const flags: WorldState['flags'] = {}
  for (const row of draft.flags) {
    const key = row.key.trim()
    if (key.length === 0) continue
    flags[key] = parseFlagValue(row.value)
  }
  const scene: WorldState['scene'] = {}
  if (draft.scene.location.trim().length > 0) scene.location = draft.scene.location.trim()
  if (draft.scene.time.trim().length > 0) scene.time = draft.scene.time.trim()
  if (draft.scene.weather.trim().length > 0) scene.weather = draft.scene.weather.trim()

  const state: WorldState = {
    characters,
    inventory,
    flags,
    scene,
    relations: draft.relations.map((rel) => ({ ...rel })),
  }

  for (const row of draft.dynamicFields) {
    const id = row.id.trim()
    if (id.length === 0 || !isValidFieldId(id)) continue

    let value: number | string | boolean
    const valueStr = row.value.trim()

    if (row.type === 'number') {
      value = Number(valueStr)
      if (Number.isNaN(value)) value = 0
    } else if (row.type === 'boolean') {
      value = valueStr === 'true' || valueStr === '1'
    } else {
      value = valueStr
    }

    const constraints: { min?: number; max?: number } = {}
    if (row.min !== undefined && row.min.trim().length > 0) {
      const min = Number(row.min)
      if (!Number.isNaN(min)) constraints.min = min
    }
    if (row.max !== undefined && row.max.trim().length > 0) {
      const max = Number(row.max)
      if (!Number.isNaN(max)) constraints.max = max
    }

    state[id] = createDynamicField(row.type, value, constraints)
  }

  return state
}
