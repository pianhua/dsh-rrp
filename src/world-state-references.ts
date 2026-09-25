import {
  archiveTrackedObject,
  canDeleteTrackedObject,
  deleteTrackedObject,
  diffWorldState,
  diagnoseWorldState,
  normalizeWorldState,
  referencesToObject,
  restoreTrackedObject,
  stableJson,
  type ObjectReference,
  type TrackedObject,
  type WorldState,
  type WorldStateChange,
  type WorldStateDiff,
} from './world-state.ts'
import { worldStateSchema } from './projection/world-state.ts'

export {
  archiveTrackedObject,
  canDeleteTrackedObject,
  deleteTrackedObject,
  referencesToObject,
  restoreTrackedObject,
}

export interface SafeWorldStateWrite {
  state: WorldState
  diff: WorldStateDiff
  diagnostics: ReturnType<typeof diagnoseWorldState>
  deletedObjectIds: string[]
}

export type SafeWorldStateWriteFailure =
  | { ok: false; reason: 'invalid-state'; message: string }
  | {
      ok: false
      reason: 'hidden-content'
      message: string
      path: string
    }
  | {
      ok: false
      reason: 'references'
      message: string
      objectId: string
      references: ReturnType<typeof referencesToObject>
    }

export type SafeWorldStateWriteResult =
  ({ ok: true } & SafeWorldStateWrite) | SafeWorldStateWriteFailure

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function referenceUsesObject(reference: ObjectReference, objectId: string): boolean {
  return reference.objectId === objectId
}

function externalReference(object: TrackedObject): ObjectReference {
  return { external: { name: object.name, kind: object.kind } }
}

function downgradeReference(reference: ObjectReference, object: TrackedObject, objectId: string) {
  return referenceUsesObject(reference, objectId) ? externalReference(object) : reference
}

function downgradeDeletedObjectReferences(
  candidate: WorldState,
  prior: WorldState,
  objectId: string,
): WorldState {
  const object = prior.trackedObjects[objectId]
  if (object === undefined) return candidate
  const next = clone(candidate)
  const priorObjectives = new Map(prior.objectives.map((item) => [item.id, item]))
  const priorConflicts = new Map(prior.conflicts.map((item) => [item.id, item]))
  const priorCognition = new Map(prior.cognition.map((item) => [item.id, item]))
  const priorRelations = new Map(prior.relations.map((item) => [item.id, item]))
  const priorEvents = new Map(prior.currentEvents.map((item) => [item.id, item]))

  next.objectives = [...next.objectives]
  for (const priorItem of priorObjectives.values()) {
    if (!priorItem.owners.some((reference) => referenceUsesObject(reference, objectId))) continue
    const index = next.objectives.findIndex((item) => item.id === priorItem.id)
    const current = index < 0 ? clone(priorItem) : clone(next.objectives[index]!)
    current.owners = priorItem.owners.map((reference, ownerIndex) => {
      const replacement = current.owners[ownerIndex]
      return replacement === undefined || referenceUsesObject(replacement, objectId)
        ? downgradeReference(reference, object, objectId)
        : replacement
    })
    if (index < 0) next.objectives.push(current)
    else next.objectives[index] = current
  }

  next.conflicts = [...next.conflicts]
  for (const priorItem of priorConflicts.values()) {
    if (!priorItem.parties.some((reference) => referenceUsesObject(reference, objectId))) continue
    const index = next.conflicts.findIndex((item) => item.id === priorItem.id)
    const current = index < 0 ? clone(priorItem) : clone(next.conflicts[index]!)
    current.parties = priorItem.parties.map((reference, partyIndex) => {
      const replacement = current.parties[partyIndex]
      return replacement === undefined || referenceUsesObject(replacement, objectId)
        ? downgradeReference(reference, object, objectId)
        : replacement
    })
    if (index < 0) next.conflicts.push(current)
    else next.conflicts[index] = current
  }

  next.cognition = [...next.cognition]
  for (const priorItem of priorCognition.values()) {
    if (!referenceUsesObject(priorItem.character, objectId)) continue
    const index = next.cognition.findIndex((item) => item.id === priorItem.id)
    const current = index < 0 ? clone(priorItem) : clone(next.cognition[index]!)
    if (referenceUsesObject(current.character, objectId))
      current.character = downgradeReference(priorItem.character, object, objectId)
    if (index < 0) next.cognition.push(current)
    else next.cognition[index] = current
  }

  next.relations = [...next.relations]
  for (const priorItem of priorRelations.values()) {
    if (!referenceUsesObject(priorItem.a, objectId) && !referenceUsesObject(priorItem.b, objectId))
      continue
    const index = next.relations.findIndex((item) => item.id === priorItem.id)
    const current = index < 0 ? clone(priorItem) : clone(next.relations[index]!)
    if (referenceUsesObject(current.a, objectId))
      current.a = downgradeReference(priorItem.a, object, objectId)
    if (referenceUsesObject(current.b, objectId))
      current.b = downgradeReference(priorItem.b, object, objectId)
    if (index < 0) next.relations.push(current)
    else next.relations[index] = current
  }

  next.currentEvents = [...next.currentEvents]
  for (const priorItem of priorEvents.values()) {
    if (!priorItem.relatedObjects.some((reference) => referenceUsesObject(reference, objectId)))
      continue
    const index = next.currentEvents.findIndex((item) => item.id === priorItem.id)
    const current = index < 0 ? clone(priorItem) : clone(next.currentEvents[index]!)
    current.relatedObjects = priorItem.relatedObjects.map((reference, objectIndex) => {
      const replacement = current.relatedObjects[objectIndex]
      return replacement === undefined || referenceUsesObject(replacement, objectId)
        ? downgradeReference(reference, object, objectId)
        : replacement
    })
    if (index < 0) next.currentEvents.push(current)
    else next.currentEvents[index] = current
  }
  return next
}

function hiddenValueAt(state: WorldState, path: string): unknown {
  const parts = path.split('.')
  if (parts[0] === 'trackedObjects') {
    const object = state.trackedObjects[parts[1]!]
    if (parts.length === 2) return object
    if (parts[2] === 'fields') return object?.fields[parts.slice(3).join('.')]
  }
  if (parts[0] === 'globalFields') return state.globalFields[parts.slice(1).join('.')]
  const collectionName = parts[0] as
    'objectives' | 'conflicts' | 'cognition' | 'relations' | 'currentEvents'
  const collection = state[collectionName]
  if (Array.isArray(collection))
    return collection.find((item) => item.id === parts.slice(1).join('.'))
  return undefined
}

function protectedPaths(state: WorldState): string[] {
  const paths: string[] = []
  for (const [id, object] of Object.entries(state.trackedObjects)) {
    if (object.visibility !== undefined && object.visibility !== 'player')
      paths.push(`trackedObjects.${id}`)
    for (const [fieldId, field] of Object.entries(object.fields)) {
      if (field.visibility !== undefined && field.visibility !== 'player')
        paths.push(`trackedObjects.${id}.fields.${fieldId}`)
    }
  }
  for (const [fieldId, field] of Object.entries(state.globalFields)) {
    if (field.visibility !== undefined && field.visibility !== 'player')
      paths.push(`globalFields.${fieldId}`)
  }
  const collections = [
    'objectives',
    'conflicts',
    'cognition',
    'relations',
    'currentEvents',
  ] as const
  for (const collection of collections) {
    for (const item of state[collection]) {
      if (item.visibility !== undefined && item.visibility !== 'player')
        paths.push(`${collection}.${item.id}`)
    }
  }
  return paths
}

/**
 * Best-effort restore of one hidden path from the prior snapshot into the
 * candidate. A missing parent (e.g. the player deleted the visible object that
 * carries a hidden field) leaves nothing to restore; that deletion is handled
 * by the reference-confirmation flow instead of the hidden-content guard.
 */
function restoreHiddenValueAt(next: WorldState, path: string, before: unknown): void {
  const parts = path.split('.')
  if (parts[0] === 'trackedObjects' && parts.length === 2) {
    next.trackedObjects[parts[1]!] = clone(before as TrackedObject)
    return
  }
  if (parts[0] === 'trackedObjects' && parts[2] === 'fields') {
    const object = next.trackedObjects[parts[1]!]
    if (object !== undefined)
      object.fields[parts[3]!] = clone(before as TrackedObject['fields'][string])
    return
  }
  if (parts[0] === 'globalFields') {
    next.globalFields[parts[1]!] = clone(before as WorldState['globalFields'][string])
    return
  }
  const collectionName = parts[0] as
    'objectives' | 'conflicts' | 'cognition' | 'relations' | 'currentEvents'
  const collection = next[collectionName]
  const id = parts.slice(1).join('.')
  if (collection.find((item) => item.id === id) === undefined) {
    collection.push(clone(before) as never)
  }
}

function preserveAndCheckHiddenContent(
  prior: WorldState,
  candidate: WorldState,
): SafeWorldStateWriteFailure | WorldState {
  const next = clone(candidate)
  const priorHiddenPaths = new Set(protectedPaths(prior))
  for (const path of protectedPaths(next)) {
    if (!priorHiddenPaths.has(path)) {
      return {
        ok: false,
        reason: 'hidden-content',
        message: '玩家不能直接创建不可见世界信息',
        path,
      }
    }
  }
  for (const path of protectedPaths(prior)) {
    const before = hiddenValueAt(prior, path)
    const after = hiddenValueAt(next, path)
    if (after === undefined) {
      // 客户端投影按 player 受众过滤，玩家候选态天然不携带 hidden 内容；
      // 缺失一律从 prior 恢复而非拒绝——删除/修改 hidden 的企图都不会生效。
      restoreHiddenValueAt(next, path, before)
      continue
    }
    if (stableJson(before) !== stableJson(after)) {
      return {
        ok: false,
        reason: 'hidden-content',
        message: '玩家不能直接编辑隐藏世界信息',
        path,
      }
    }
    restoreHiddenValueAt(next, path, before)
  }
  return next
}

export interface WorldStateWriteOptions {
  confirmedDeleteIds?: readonly string[]
  allowHiddenContent?: boolean
}

export function prepareWorldStateWrite(
  prior: WorldState,
  candidate: WorldState,
  options: WorldStateWriteOptions = {},
): SafeWorldStateWriteResult {
  const parsed = worldStateSchema.safeParse(candidate)
  if (!parsed.success) return { ok: false, reason: 'invalid-state', message: 'invalid WorldState' }
  const protectedResult = options.allowHiddenContent
    ? (parsed.data as WorldState)
    : preserveAndCheckHiddenContent(prior, parsed.data as WorldState)
  if ('ok' in protectedResult && protectedResult.ok === false) return protectedResult
  let next = normalizeWorldState(protectedResult as WorldState)
  const confirmed = new Set(options.confirmedDeleteIds ?? [])
  const deletedObjectIds = Object.keys(prior.trackedObjects).filter(
    (id) => next.trackedObjects[id] === undefined,
  )
  for (const objectId of deletedObjectIds) {
    const uses = referencesToObject(prior, objectId)
    if (uses.length > 0 && !confirmed.has(objectId)) {
      return {
        ok: false,
        reason: 'references',
        message: '对象仍被引用，删除前必须确认引用降级',
        objectId,
        references: uses,
      }
    }
    if (uses.length > 0) next = downgradeDeletedObjectReferences(next, prior, objectId)
  }
  const parsedNext = worldStateSchema.safeParse(next)
  if (!parsedNext.success)
    return { ok: false, reason: 'invalid-state', message: 'invalid WorldState' }
  const finalState = parsedNext.data as WorldState
  return {
    ok: true,
    state: finalState,
    diff: diffWorldState(prior, finalState),
    diagnostics: diagnoseWorldState(finalState),
    deletedObjectIds,
  }
}

export function preparePlayerWorldState(
  prior: WorldState,
  candidate: WorldState,
  confirmedDeleteIds: readonly string[] = [],
): SafeWorldStateWriteResult {
  return prepareWorldStateWrite(prior, candidate, { confirmedDeleteIds })
}

export interface WorldStatePatchOptions {
  confirmedDeleteIds?: readonly string[]
  /** Copilot/Chronicler writes may operate on model-visible hidden state. */
  allowHiddenContent?: boolean
}

function mergeRecord(
  prior: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...prior }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key]
    else if (isRecord(value) && isRecord(next[key]))
      next[key] = mergeRecord(next[key] as Record<string, unknown>, value)
    else next[key] = clone(value)
  }
  return next
}

export function applyWorldStatePatch(
  prior: WorldState,
  patch: Record<string, unknown>,
  options: WorldStatePatchOptions = {},
): SafeWorldStateWriteResult {
  if (!isRecord(patch)) return { ok: false, reason: 'invalid-state', message: 'patch 必须是对象' }
  const allowedKeys = new Set([
    'trackedObjects',
    'globalFields',
    'objectives',
    'conflicts',
    'cognition',
    'relations',
    'currentEvents',
    'archiveObjectIds',
    'restoreObjectIds',
    'deleteObjectIds',
  ])
  const unknownKey = Object.keys(patch).find((key) => !allowedKeys.has(key))
  if (unknownKey !== undefined)
    return {
      ok: false,
      reason: 'invalid-state',
      message: '不支持的 WorldState patch 字段：' + unknownKey,
    }
  let next = clone(prior)
  const objectPatch = patch.trackedObjects
  if (objectPatch !== undefined) {
    if (!isRecord(objectPatch))
      return { ok: false, reason: 'invalid-state', message: 'patch.trackedObjects 必须是对象' }
    const merged = mergeRecord(next.trackedObjects, objectPatch)
    next.trackedObjects = merged as WorldState['trackedObjects']
  }
  const globalPatch = patch.globalFields
  if (globalPatch !== undefined) {
    if (!isRecord(globalPatch))
      return { ok: false, reason: 'invalid-state', message: 'patch.globalFields 必须是对象' }
    next.globalFields = mergeRecord(next.globalFields, globalPatch) as WorldState['globalFields']
  }
  for (const collection of [
    'objectives',
    'conflicts',
    'cognition',
    'relations',
    'currentEvents',
  ] as const) {
    if (patch[collection] !== undefined) {
      if (!Array.isArray(patch[collection]))
        return { ok: false, reason: 'invalid-state', message: `patch.${collection} 必须是数组` }
      next[collection] = clone(patch[collection]) as never
    }
  }
  const archiveIds = Array.isArray(patch.archiveObjectIds) ? patch.archiveObjectIds : []
  const restoreIds = Array.isArray(patch.restoreObjectIds) ? patch.restoreObjectIds : []
  const deleteIds = Array.isArray(patch.deleteObjectIds) ? patch.deleteObjectIds : []
  for (const id of archiveIds) if (typeof id === 'string') next = archiveTrackedObject(next, id)
  for (const id of restoreIds) if (typeof id === 'string') next = restoreTrackedObject(next, id)
  for (const id of deleteIds) {
    if (typeof id !== 'string') continue
    const result = deleteTrackedObject(next, id, true)
    if (result.ok) next = result.state
  }
  return prepareWorldStateWrite(prior, next, {
    confirmedDeleteIds:
      options.confirmedDeleteIds ?? deleteIds.filter((id): id is string => typeof id === 'string'),
    allowHiddenContent: options.allowHiddenContent,
  })
}

export function changesForWorldStateWrite(
  before: WorldState,
  after: WorldState,
): WorldStateChange[] {
  return diffWorldState(before, after).changes
}
