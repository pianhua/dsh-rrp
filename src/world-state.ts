/**
 * dsh-rrp — WorldState v2 domain vocabulary.
 *
 * This module is dependency-free so the host projections and client contracts
 * can share the same whole-snapshot language. Runtime validation lives in the
 * projection module; the functions here are pure domain operations.
 */
import { renderWorldStateForAudience } from './world-state-visibility.ts'

export const WORLD_STATE_VERSION = 2 as const

export type WorldStateVisibility = 'player' | 'model' | 'hidden'
export type TrackedObjectKind = 'character' | 'group' | 'item' | 'scene'
export type ScalarFieldType = 'number' | 'string' | 'boolean'
export type DynamicFieldType = ScalarFieldType
export type ScalarValue = number | string | boolean
export type WorldStateFlag = ScalarValue

export interface ExternalReference {
  name: string
  kind?: TrackedObjectKind
}

export interface ObjectReference {
  objectId?: string
  external?: ExternalReference
}

export type CharacterPresence = 'present' | 'absent' | 'unknown'

export interface CharacterCommonFields {
  presence?: CharacterPresence
  outfit?: string
  emotionalState?: string
  affinity?: number
  appearance?: string
}

export type ScalarFieldDefinition = 'card-defined' | 'undeclared'

export interface WorldStateScalarField {
  type: ScalarFieldType
  value: ScalarValue
  definition: ScalarFieldDefinition
  visibility?: WorldStateVisibility
  min?: number
  max?: number
}

/** Compatibility name for the shared scalar-field vocabulary. */
export type DynamicFieldValue = WorldStateScalarField

export interface TrackedObject {
  id: string
  kind: TrackedObjectKind
  name: string
  archived?: boolean
  isPlayer?: boolean
  visibility?: WorldStateVisibility
  character?: CharacterCommonFields
  fields: Record<string, WorldStateScalarField>
}

/** Names retained as vocabulary aliases while consumers migrate to objects. */
export type WorldStateCharacter = CharacterCommonFields
export type WorldStateItem = TrackedObject
export type WorldStateScene = TrackedObject

export type ObjectiveStatus = 'pending' | 'active' | 'blocked' | 'completed' | 'abandoned'

export interface CurrentObjective {
  id: string
  owners: ObjectReference[]
  desiredOutcome: string
  progress?: string
  status: ObjectiveStatus
  nextStep?: string
  primary?: boolean
  order?: number
  visibility?: WorldStateVisibility
}

export type ConflictStatus = 'active' | 'controlled' | 'resolved' | 'abandoned'

export interface ActiveConflict {
  id: string
  parties: ObjectReference[]
  stakes: string
  pressure: string
  status: ConflictStatus
  visibility?: WorldStateVisibility
}

export type CognitionMarker = 'known' | 'believed' | 'suspected' | 'rumored' | 'misunderstood'

export interface CharacterCognitionEntry {
  id: string
  character: ObjectReference
  proposition: string
  markers: CognitionMarker[]
  visibility?: WorldStateVisibility
}

export interface RelationshipAttitude {
  attitude: string
  value?: number
}

export interface RelationshipEntry {
  id: string
  a: ObjectReference
  b: ObjectReference
  labels: string[]
  aToB?: RelationshipAttitude
  bToA?: RelationshipAttitude
  visibility?: WorldStateVisibility
}

export type WorldStateRelation = RelationshipEntry

export type CurrentWorldEventType = 'promise' | 'secret' | 'discovery' | 'ongoing' | string
export type CurrentWorldEventStatus =
  'pending' | 'active' | 'blocked' | 'completed' | 'invalid' | 'abandoned'

export interface CurrentWorldEventEntry {
  id: string
  type: CurrentWorldEventType
  fact: string
  relatedObjects: ObjectReference[]
  status: CurrentWorldEventStatus
  visibility?: WorldStateVisibility
}

/** Complete v2 snapshot. Every state-bearing payload must carry this shape. */
export interface WorldState {
  version: typeof WORLD_STATE_VERSION
  trackedObjects: Record<string, TrackedObject>
  globalFields: Record<string, WorldStateScalarField>
  objectives: CurrentObjective[]
  conflicts: ActiveConflict[]
  cognition: CharacterCognitionEntry[]
  relations: RelationshipEntry[]
  currentEvents: CurrentWorldEventEntry[]
}

/** Legacy names are intentionally not runtime domains; these keys are reserved by v2. */
export const CORE_DOMAIN_KEYS = [
  'version',
  'trackedObjects',
  'globalFields',
  'objectives',
  'conflicts',
  'cognition',
  'relations',
  'currentEvents',
] as const

export const WORLD_STATE_KEY = 'rrpWorldState'

export function emptyWorldState(): WorldState {
  return {
    version: WORLD_STATE_VERSION,
    trackedObjects: {},
    globalFields: {},
    objectives: [],
    conflicts: [],
    cognition: [],
    relations: [],
    currentEvents: [],
  }
}

export function isCoreKey(key: string): boolean {
  return CORE_DOMAIN_KEYS.includes(key as (typeof CORE_DOMAIN_KEYS)[number])
}

/** Return undeclared global scalar fields; v2 has no flat top-level fallback. */
export function getDynamicKeys(state: WorldState): string[] {
  return Object.keys(state.globalFields).filter(
    (key) => state.globalFields[key]?.definition === 'undeclared',
  )
}

export type WorldStateAudience = 'internal' | 'model' | 'player'

export interface WorldStateVisibilityNotice {
  kind:
    | 'tracked-object'
    | 'field'
    | 'objective'
    | 'conflict'
    | 'cognition'
    | 'relation'
    | 'current-event'
  count: number
  message: '不公开的世界信息'
}

export interface WorldStatePlayerView extends WorldState {
  visibilityNotices?: WorldStateVisibilityNotice[]
}

export type WorldStateView = WorldStatePlayerView

export function isValidFieldId(id: string): boolean {
  return /^[a-zA-Z0-9_]+$/.test(id) && id.length > 0
}

export function createDynamicField(
  type: DynamicFieldType,
  value: ScalarValue,
  constraints: { min?: number; max?: number } = {},
): DynamicFieldValue {
  return applyConstraints({
    type,
    value,
    definition: 'undeclared',
    ...(constraints.min === undefined ? {} : { min: constraints.min }),
    ...(constraints.max === undefined ? {} : { max: constraints.max }),
  })
}

export function applyConstraints(field: WorldStateScalarField): WorldStateScalarField {
  if (field.type !== 'number' || typeof field.value !== 'number') return field
  let value = field.value
  if (field.min !== undefined && value < field.min) value = field.min
  if (field.max !== undefined && value > field.max) value = field.max
  return value === field.value ? field : { ...field, value }
}

/** Diagnostic thresholds only. No writer truncates or deletes to satisfy them. */
export const WORLD_STATE_LIMITS = {
  diagnosticStringChars: 4000,
  diagnosticSerializedChars: 100000,
} as const

export interface WorldStateDiagnostic {
  kind: 'string-length' | 'serialized-budget'
  path: string
  actual: number
  limit: number
}

export type WorldStateDiagnosticLimits = {
  diagnosticStringChars?: number
  diagnosticSerializedChars?: number
}

export function diagnoseWorldState(
  state: WorldState,
  limits: WorldStateDiagnosticLimits = {},
): WorldStateDiagnostic[] {
  const effective = { ...WORLD_STATE_LIMITS, ...limits }
  const diagnostics: WorldStateDiagnostic[] = []
  const visit = (value: unknown, path: string): void => {
    if (typeof value === 'string' && value.length > effective.diagnosticStringChars) {
      diagnostics.push({
        kind: 'string-length',
        path,
        actual: value.length,
        limit: effective.diagnosticStringChars,
      })
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`))
      return
    }
    if (value !== null && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        visit(item, path.length === 0 ? key : `${path}.${key}`)
      }
    }
  }
  visit(state, '')
  const serializedLength = stableJson(state).length
  if (serializedLength > effective.diagnosticSerializedChars) {
    diagnostics.push({
      kind: 'serialized-budget',
      path: '$',
      actual: serializedLength,
      limit: effective.diagnosticSerializedChars,
    })
  }
  return diagnostics
}

/** Normalize numeric constraints without pruning any object, field, or relation. */
export function normalizeWorldState(state: WorldState): WorldState {
  let changed = false
  const trackedObjects: Record<string, TrackedObject> = {}
  for (const [id, object] of Object.entries(state.trackedObjects)) {
    let fields = object.fields
    for (const [fieldId, field] of Object.entries(object.fields)) {
      const normalized = applyConstraints(field)
      if (normalized !== field) {
        if (fields === object.fields) fields = { ...object.fields }
        fields[fieldId] = normalized
        changed = true
      }
    }
    trackedObjects[id] = fields === object.fields ? object : { ...object, fields }
  }
  let globalFields = state.globalFields
  for (const [fieldId, field] of Object.entries(state.globalFields)) {
    const normalized = applyConstraints(field)
    if (normalized !== field) {
      if (globalFields === state.globalFields) globalFields = { ...state.globalFields }
      globalFields[fieldId] = normalized
      changed = true
    }
  }
  return changed ? { ...state, trackedObjects, globalFields } : state
}

/** Historical writer name retained as a non-pruning normalization operation. */
export function pruneWorldState(state: WorldState): WorldState {
  return normalizeWorldState(state)
}

export function objectReferenceFor(object: TrackedObject): ObjectReference {
  return { objectId: object.id }
}

export function externalReferenceFor(object: TrackedObject): ObjectReference {
  return { external: { name: object.name, kind: object.kind } }
}

function referenceUses(reference: ObjectReference, objectId: string): boolean {
  return reference.objectId === objectId
}

export interface WorldStateReferenceUse {
  collection: 'objectives' | 'conflicts' | 'cognition' | 'relations' | 'currentEvents'
  entryId: string
  path: string
}

export function referencesToObject(state: WorldState, objectId: string): WorldStateReferenceUse[] {
  const uses: WorldStateReferenceUse[] = []
  for (const item of state.objectives) {
    item.owners.forEach((reference, index) => {
      if (referenceUses(reference, objectId))
        uses.push({ collection: 'objectives', entryId: item.id, path: `owners[${index}]` })
    })
  }
  for (const item of state.conflicts) {
    item.parties.forEach((reference, index) => {
      if (referenceUses(reference, objectId))
        uses.push({ collection: 'conflicts', entryId: item.id, path: `parties[${index}]` })
    })
  }
  for (const item of state.cognition) {
    if (referenceUses(item.character, objectId))
      uses.push({ collection: 'cognition', entryId: item.id, path: 'character' })
  }
  for (const item of state.relations) {
    if (referenceUses(item.a, objectId))
      uses.push({ collection: 'relations', entryId: item.id, path: 'a' })
    if (referenceUses(item.b, objectId))
      uses.push({ collection: 'relations', entryId: item.id, path: 'b' })
  }
  for (const item of state.currentEvents) {
    item.relatedObjects.forEach((reference, index) => {
      if (referenceUses(reference, objectId))
        uses.push({
          collection: 'currentEvents',
          entryId: item.id,
          path: `relatedObjects[${index}]`,
        })
    })
  }
  return uses
}

export function canDeleteTrackedObject(
  state: WorldState,
  objectId: string,
): { allowed: boolean; references: WorldStateReferenceUse[] } {
  const references = referencesToObject(state, objectId)
  return { allowed: references.length === 0, references }
}

export type DeleteTrackedObjectResult =
  | {
      ok: false
      reason: 'not-found' | 'confirmation-required'
      references: WorldStateReferenceUse[]
    }
  | { ok: true; state: WorldState }

function downgrade(
  reference: ObjectReference,
  object: TrackedObject,
  objectId: string,
): ObjectReference {
  return reference.objectId === objectId ? externalReferenceFor(object) : reference
}

/** Explicit delete: references are preserved as external names, never cascaded away. */
export function deleteTrackedObject(
  state: WorldState,
  objectId: string,
  confirmed = false,
): DeleteTrackedObjectResult {
  const object = state.trackedObjects[objectId]
  if (object === undefined) return { ok: false, reason: 'not-found', references: [] }
  const references = referencesToObject(state, objectId)
  if (!confirmed) return { ok: false, reason: 'confirmation-required', references }
  const trackedObjects = { ...state.trackedObjects }
  delete trackedObjects[objectId]
  return {
    ok: true,
    state: {
      ...state,
      trackedObjects,
      objectives: state.objectives.map((item) => ({
        ...item,
        owners: item.owners.map((reference) => downgrade(reference, object, objectId)),
      })),
      conflicts: state.conflicts.map((item) => ({
        ...item,
        parties: item.parties.map((reference) => downgrade(reference, object, objectId)),
      })),
      cognition: state.cognition.map((item) => ({
        ...item,
        character: downgrade(item.character, object, objectId),
      })),
      relations: state.relations.map((item) => ({
        ...item,
        a: downgrade(item.a, object, objectId),
        b: downgrade(item.b, object, objectId),
      })),
      currentEvents: state.currentEvents.map((item) => ({
        ...item,
        relatedObjects: item.relatedObjects.map((reference) =>
          downgrade(reference, object, objectId),
        ),
      })),
    },
  }
}

export function archiveTrackedObject(state: WorldState, objectId: string): WorldState {
  const object = state.trackedObjects[objectId]
  if (object === undefined || object.archived === true) return state
  return {
    ...state,
    trackedObjects: { ...state.trackedObjects, [objectId]: { ...object, archived: true } },
  }
}

export function restoreTrackedObject(state: WorldState, objectId: string): WorldState {
  const object = state.trackedObjects[objectId]
  if (object === undefined || object.archived !== true) return state
  return {
    ...state,
    trackedObjects: { ...state.trackedObjects, [objectId]: { ...object, archived: false } },
  }
}

export type WorldStateChangeType =
  'added' | 'modified' | 'closed' | 'archived' | 'deleted' | 'restored'

export interface WorldStateChange {
  type: WorldStateChangeType
  objectId?: string
  field?: string
  before?: unknown
  after?: unknown
}

export interface WorldStateDiff {
  changes: WorldStateChange[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function statusOf(value: unknown): string | undefined {
  return isObject(value) && typeof value.status === 'string' ? value.status : undefined
}

function changeType(before: unknown, after: unknown, path = ''): WorldStateChangeType {
  if (path.endsWith('.archived') && after === true) return 'archived'
  if (path.endsWith('.archived') && after === false) return 'restored'
  if (before === undefined) return 'added'
  if (after === undefined) return 'deleted'
  if (isObject(before) && isObject(after) && before.archived !== after.archived) {
    return after.archived === true ? 'archived' : 'restored'
  }
  const afterStatus = statusOf(after)
  if (afterStatus === 'completed' || afterStatus === 'invalid' || afterStatus === 'abandoned') {
    const beforeStatus = statusOf(before)
    if (beforeStatus !== afterStatus || path.endsWith('.status')) return 'closed'
  }
  if (
    path.endsWith('.status') &&
    typeof after === 'string' &&
    ['completed', 'invalid', 'abandoned'].includes(after) &&
    before !== after
  ) {
    return 'closed'
  }
  return 'modified'
}

function compareValue(
  before: unknown,
  after: unknown,
  path: string,
  objectId: string | undefined,
  changes: WorldStateChange[],
): void {
  if (stableJson(before) === stableJson(after)) return
  if (!isObject(before) || !isObject(after) || Array.isArray(before) || Array.isArray(after)) {
    // The change record crosses the session event log, where an explicit
    // undefined side (added/deleted) fails the host's serializability check;
    // the type already carries the direction, so omit the absent side.
    changes.push({
      type: changeType(before, after, path),
      objectId,
      field: path,
      ...(before === undefined ? {} : { before }),
      ...(after === undefined ? {} : { after }),
    })
    return
  }
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  for (const key of keys) {
    compareValue(
      before[key],
      after[key],
      path.length === 0 ? key : `${path}.${key}`,
      objectId,
      changes,
    )
  }
}

function compareCollection(
  before: Array<Record<string, unknown>>,
  after: Array<Record<string, unknown>>,
  collection: string,
  changes: WorldStateChange[],
): void {
  const beforeById = new Map(before.map((item) => [item.id, item]))
  const afterById = new Map(after.map((item) => [item.id, item]))
  const ids = [...new Set([...beforeById.keys(), ...afterById.keys()])].sort()
  for (const id of ids) {
    compareValue(beforeById.get(id), afterById.get(id), collection, String(id), changes)
  }
}

export function diffWorldState(prior: WorldState, next: WorldState): WorldStateDiff {
  const changes: WorldStateChange[] = []
  const beforeObjects = prior.trackedObjects
  const afterObjects = next.trackedObjects
  const objectIds = [
    ...new Set([...Object.keys(beforeObjects), ...Object.keys(afterObjects)]),
  ].sort()
  for (const objectId of objectIds) {
    compareValue(
      beforeObjects[objectId],
      afterObjects[objectId],
      'trackedObjects',
      objectId,
      changes,
    )
  }
  compareValue(prior.globalFields, next.globalFields, 'globalFields', undefined, changes)
  compareCollection(
    prior.objectives as unknown as Array<Record<string, unknown>>,
    next.objectives as unknown as Array<Record<string, unknown>>,
    'objectives',
    changes,
  )
  compareCollection(
    prior.conflicts as unknown as Array<Record<string, unknown>>,
    next.conflicts as unknown as Array<Record<string, unknown>>,
    'conflicts',
    changes,
  )
  compareCollection(
    prior.cognition as unknown as Array<Record<string, unknown>>,
    next.cognition as unknown as Array<Record<string, unknown>>,
    'cognition',
    changes,
  )
  compareCollection(
    prior.relations as unknown as Array<Record<string, unknown>>,
    next.relations as unknown as Array<Record<string, unknown>>,
    'relations',
    changes,
  )
  compareCollection(
    prior.currentEvents as unknown as Array<Record<string, unknown>>,
    next.currentEvents as unknown as Array<Record<string, unknown>>,
    'currentEvents',
    changes,
  )
  return { changes }
}

export const NO_WORLD_STATE_CHANGE = '（无实质变化）'

export function renderWorldStateDiff(diff: WorldStateDiff): string {
  if (diff.changes.length === 0) return NO_WORLD_STATE_CHANGE
  return diff.changes
    .slice(0, 6)
    .map((change) => `${change.type}:${change.objectId ?? change.field ?? 'state'}`)
    .join('；')
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

export function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

export function worldStatesEqual(prior: WorldState, next: WorldState): boolean {
  return stableJson(prior) === stableJson(next)
}

/** Render only the current snapshot; timeline batches are deliberately absent. */
export function renderWorldState(
  state: WorldState,
  audience: WorldStateAudience = 'model',
): string {
  return renderWorldStateForAudience(state, audience)
}

/** Keep the player's self-authored persona as an ordinary tracked-object field. */
export function withPlayerPersona(state: WorldState | null, persona: string): WorldState | null {
  const text = persona.trim()
  if (text.length === 0) return state
  const base = state ?? emptyWorldState()
  const prior = base.trackedObjects.player
  const player: TrackedObject = prior ?? {
    id: 'player',
    kind: 'character',
    name: '玩家',
    isPlayer: true,
    fields: {},
  }
  return {
    ...base,
    trackedObjects: {
      ...base.trackedObjects,
      player: {
        ...player,
        fields: { ...player.fields, persona: createDynamicField('string', text) },
      },
    },
  }
}
