export type { WorldStatePlayerView } from './world-state.ts'

import type {
  ActiveConflict,
  CharacterCognitionEntry,
  CurrentObjective,
  CurrentWorldEventEntry,
  ObjectReference,
  RelationshipEntry,
  TrackedObject,
  WorldState,
  WorldStateAudience,
  WorldStatePlayerView,
  WorldStateScalarField,
  WorldStateVisibilityNotice,
  WorldStateChange,
  WorldStateDiff,
} from './world-state.ts'

export const PROTECTED_WORLD_STATE_NOTICE = '不公开的世界信息' as const
export const PROTECTED_OBJECT_REFERENCE_NAME = '不公开对象' as const

function visibleTo(value: { visibility?: string }, audience: WorldStateAudience): boolean {
  if (audience === 'internal' || audience === 'model') return true
  return value.visibility === undefined || value.visibility === 'player'
}

function notice(
  kind: WorldStateVisibilityNotice['kind'],
  count: number,
): WorldStateVisibilityNotice | undefined {
  return count === 0 ? undefined : { kind, count, message: PROTECTED_WORLD_STATE_NOTICE }
}

function sanitizeReference(
  reference: ObjectReference,
  state: WorldState,
  audience: WorldStateAudience,
): ObjectReference {
  if (audience !== 'player' || reference.objectId === undefined) return reference
  const object = state.trackedObjects[reference.objectId]
  return object !== undefined && visibleTo(object, audience)
    ? reference
    : { external: { name: PROTECTED_OBJECT_REFERENCE_NAME } }
}

function sanitizeField(
  field: WorldStateScalarField,
  audience: WorldStateAudience,
): WorldStateScalarField | undefined {
  return visibleTo(field, audience) ? { ...field } : undefined
}

function sanitizeObject(
  object: TrackedObject,
  state: WorldState,
  audience: WorldStateAudience,
): TrackedObject | undefined {
  if (!visibleTo(object, audience)) return undefined
  const fields: Record<string, WorldStateScalarField> = {}
  for (const [id, field] of Object.entries(object.fields)) {
    const visible = sanitizeField(field, audience)
    if (visible !== undefined) fields[id] = visible
  }
  return { ...object, fields }
}

function sanitizeObjective(
  item: CurrentObjective,
  state: WorldState,
  audience: WorldStateAudience,
): CurrentObjective | undefined {
  if (!visibleTo(item, audience)) return undefined
  return {
    ...item,
    owners: item.owners.map((reference) => sanitizeReference(reference, state, audience)),
  }
}

function sanitizeConflict(
  item: ActiveConflict,
  state: WorldState,
  audience: WorldStateAudience,
): ActiveConflict | undefined {
  if (!visibleTo(item, audience)) return undefined
  return {
    ...item,
    parties: item.parties.map((reference) => sanitizeReference(reference, state, audience)),
  }
}

function sanitizeCognition(
  item: CharacterCognitionEntry,
  state: WorldState,
  audience: WorldStateAudience,
): CharacterCognitionEntry | undefined {
  if (!visibleTo(item, audience)) return undefined
  return { ...item, character: sanitizeReference(item.character, state, audience) }
}

function sanitizeRelation(
  item: RelationshipEntry,
  state: WorldState,
  audience: WorldStateAudience,
): RelationshipEntry | undefined {
  if (!visibleTo(item, audience)) return undefined
  return {
    ...item,
    a: sanitizeReference(item.a, state, audience),
    b: sanitizeReference(item.b, state, audience),
  }
}

function sanitizeEvent(
  item: CurrentWorldEventEntry,
  state: WorldState,
  audience: WorldStateAudience,
): CurrentWorldEventEntry | undefined {
  if (!visibleTo(item, audience)) return undefined
  return {
    ...item,
    relatedObjects: item.relatedObjects.map((reference) =>
      sanitizeReference(reference, state, audience),
    ),
  }
}

function countProtected<T extends { visibility?: string }>(
  items: readonly T[],
  audience: WorldStateAudience,
): number {
  return audience === 'player' ? items.filter((item) => !visibleTo(item, audience)).length : 0
}

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

function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

export function filterWorldState(
  state: WorldState,
  audience: WorldStateAudience,
): WorldState | WorldStatePlayerView {
  if (audience !== 'player') return state

  const trackedObjects: Record<string, TrackedObject> = {}
  let protectedObjects = 0
  let protectedFields = 0
  for (const [id, object] of Object.entries(state.trackedObjects)) {
    if (!visibleTo(object, audience)) {
      protectedObjects += 1
      continue
    }
    protectedFields += Object.values(object.fields).filter(
      (field) => !visibleTo(field, audience),
    ).length
    const visible = sanitizeObject(object, state, audience)
    if (visible !== undefined) trackedObjects[id] = visible
  }

  const globalFields: Record<string, WorldStateScalarField> = {}
  for (const [id, field] of Object.entries(state.globalFields)) {
    const visible = sanitizeField(field, audience)
    if (visible !== undefined) globalFields[id] = visible
    else protectedFields += 1
  }

  const objectives = state.objectives.flatMap((item) => {
    const visible = sanitizeObjective(item, state, audience)
    return visible === undefined ? [] : [visible]
  })
  const conflicts = state.conflicts.flatMap((item) => {
    const visible = sanitizeConflict(item, state, audience)
    return visible === undefined ? [] : [visible]
  })
  const cognition = state.cognition.flatMap((item) => {
    const visible = sanitizeCognition(item, state, audience)
    return visible === undefined ? [] : [visible]
  })
  const relations = state.relations.flatMap((item) => {
    const visible = sanitizeRelation(item, state, audience)
    return visible === undefined ? [] : [visible]
  })
  const currentEvents = state.currentEvents.flatMap((item) => {
    const visible = sanitizeEvent(item, state, audience)
    return visible === undefined ? [] : [visible]
  })

  const notices = [
    notice('tracked-object', protectedObjects),
    notice('field', protectedFields),
    notice('objective', countProtected(state.objectives, audience)),
    notice('conflict', countProtected(state.conflicts, audience)),
    notice('cognition', countProtected(state.cognition, audience)),
    notice('relation', countProtected(state.relations, audience)),
    notice('current-event', countProtected(state.currentEvents, audience)),
  ].filter((item): item is WorldStateVisibilityNotice => item !== undefined)

  return {
    version: state.version,
    trackedObjects,
    globalFields,
    objectives,
    conflicts,
    cognition,
    relations,
    currentEvents,
    visibilityNotices: notices,
  }
}

function protectedStrings(state: WorldState): string[] {
  const values: string[] = []
  const add = (value: unknown): void => {
    if (typeof value === 'string' && value.length > 0) values.push(value)
  }
  for (const object of Object.values(state.trackedObjects)) {
    if (!visibleTo(object, 'player')) {
      add(object.name)
      add(object.character)
      for (const field of Object.values(object.fields)) add(field.value)
    } else {
      for (const field of Object.values(object.fields)) {
        if (!visibleTo(field, 'player')) add(field.value)
      }
    }
  }
  for (const field of Object.values(state.globalFields)) {
    if (!visibleTo(field, 'player')) add(field.value)
  }
  for (const collection of [
    state.objectives,
    state.conflicts,
    state.cognition,
    state.relations,
    state.currentEvents,
  ]) {
    for (const item of collection) {
      if (!visibleTo(item, 'player')) {
        for (const value of Object.values(item)) add(value)
      }
    }
  }
  return [...new Set(values)].sort((a, b) => b.length - a.length)
}

export function mergePlayerVisibleWorldState(prior: WorldState, candidate: WorldState): WorldState {
  const next = structuredClone(candidate)
  for (const [id, object] of Object.entries(prior.trackedObjects)) {
    if (!visibleTo(object, 'player')) {
      next.trackedObjects[id] = structuredClone(object)
      continue
    }
    const candidateObject = next.trackedObjects[id]
    if (candidateObject === undefined) continue
    for (const [fieldId, field] of Object.entries(object.fields)) {
      if (!visibleTo(field, 'player')) candidateObject.fields[fieldId] = structuredClone(field)
    }
  }
  for (const [id, field] of Object.entries(prior.globalFields)) {
    if (!visibleTo(field, 'player')) next.globalFields[id] = structuredClone(field)
  }
  for (const collection of [
    'objectives',
    'conflicts',
    'cognition',
    'relations',
    'currentEvents',
  ] as const) {
    const candidateItems = new Map(next[collection].map((item) => [item.id, item]))
    for (const item of prior[collection]) {
      if (!visibleTo(item, 'player')) {
        candidateItems.set(item.id, structuredClone(item))
      }
    }
    next[collection] = [...candidateItems.values()] as never
  }
  return next
}

export function sanitizePlayerText(text: string, ...states: WorldState[]): string {
  let safe = text
  const protectedValues = [...new Set(states.flatMap(protectedStrings))]
  for (const value of protectedValues) safe = safe.replaceAll(value, PROTECTED_WORLD_STATE_NOTICE)
  return safe
}

function changeIsProtected(change: WorldStateChange, prior: WorldState, next: WorldState): boolean {
  const objectId = change.objectId
  for (const state of [prior, next]) {
    if (objectId !== undefined) {
      const object = state.trackedObjects[objectId]
      if (object !== undefined && !visibleTo(object, 'player')) return true
      const field = change.field?.split('.').at(-2)
      if (object !== undefined && field !== undefined && object.fields[field] !== undefined) {
        if (!visibleTo(object.fields[field], 'player')) return true
      }
    }
    if (change.field?.startsWith('globalFields.')) {
      const field = state.globalFields[change.field.slice('globalFields.'.length).split('.')[0]!]
      if (field !== undefined && !visibleTo(field, 'player')) return true
    }
    const collectionName = change.field?.split('.')[0]
    if (
      objectId !== undefined &&
      (collectionName === 'objectives' ||
        collectionName === 'conflicts' ||
        collectionName === 'cognition' ||
        collectionName === 'relations' ||
        collectionName === 'currentEvents')
    ) {
      const item = state[collectionName].find((entry) => entry.id === objectId)
      if (item !== undefined && !visibleTo(item, 'player')) return true
    }
  }
  const serialized = JSON.stringify(change)
  return [prior, next].some((state) => sanitizePlayerText(serialized, state) !== serialized)
}

export function sanitizeWorldStateDiff(
  diff: WorldStateDiff,
  prior: WorldState,
  next: WorldState,
): WorldStateDiff {
  return {
    changes: diff.changes.map((change) =>
      changeIsProtected(change, prior, next)
        ? {
            type: 'modified',
            field: PROTECTED_WORLD_STATE_NOTICE,
            before: PROTECTED_WORLD_STATE_NOTICE,
            after: PROTECTED_WORLD_STATE_NOTICE,
          }
        : {
            ...change,
            ...(typeof change.before === 'string'
              ? { before: sanitizePlayerText(change.before, prior, next) }
              : {}),
            ...(typeof change.after === 'string'
              ? { after: sanitizePlayerText(change.after, prior, next) }
              : {}),
          },
    ),
  }
}

export function renderWorldStateForAudience(
  state: WorldState,
  audience: WorldStateAudience = 'model',
): string {
  const view = filterWorldState(state, audience)
  return [
    '【世界状态 · 事实基准】',
    audience === 'player'
      ? '以下是当前可公开的 WorldState；受保护内容仅显示不泄密提示。'
      : '以下是当前 WorldState v2 完整切面。',
    '',
    stableJson(view),
  ].join('\n')
}
