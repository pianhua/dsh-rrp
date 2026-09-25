import { draftOf, stateOfDraft, type WorldStateDraft } from './world-state-draft.ts'
import { stableJson, type WorldState, type WorldStateView } from '../world-state.ts'

export interface WorldStateDraftSnapshot {
  draft: WorldStateDraft
  projection: WorldStateView | undefined
  dirtyPaths: readonly string[]
  isDirty: boolean
  isInferring: boolean
  updateNotice: boolean
}

export interface WorldStateDraftStore {
  subscribe(listener: () => void): () => void
  getSnapshot(): WorldStateDraftSnapshot
  setPath(path: string, value: unknown): void
  deletePath(path: string): void
  mergeProjection(projection: WorldStateView | undefined): void
  setInferring(value: boolean): void
  clearUpdateNotice(): void
  discard(): void
  markSaved(): void
}

const STORES = new Map<string, WorldStateDraftStore>()

function pathParts(path: string): string[] {
  return path.split('.').filter((part) => part.length > 0)
}

function setAt(root: unknown, path: string, value: unknown): WorldStateDraft {
  const next = structuredClone(root) as WorldStateDraft
  const parts = pathParts(path)
  if (parts.length === 0) return next
  let target = next as unknown as Record<string, unknown>
  for (const part of parts.slice(0, -1)) {
    const child = target[part]
    if (child === null || typeof child !== 'object') target[part] = {}
    target = target[part] as Record<string, unknown>
  }
  target[parts[parts.length - 1]!] = structuredClone(value)
  return next
}

function deleteAt(root: unknown, path: string): WorldStateDraft {
  const next = structuredClone(root) as WorldStateDraft
  const parts = pathParts(path)
  if (parts.length === 0) return next
  let target = next as unknown as Record<string, unknown>
  for (const part of parts.slice(0, -1)) {
    const child = target[part]
    if (child === null || typeof child !== 'object') return next
    target = child as Record<string, unknown>
  }
  delete target[parts[parts.length - 1]!]
  return next
}

function pathOverlaps(a: string, b: string): boolean {
  return a === b || a.startsWith(b + '.') || b.startsWith(a + '.')
}

function preserveDirty(
  next: WorldStateDraft,
  current: WorldStateDraft,
  dirtyPaths: readonly string[],
) {
  let merged = next
  for (const path of dirtyPaths) {
    const parts = pathParts(path)
    let source: unknown = current
    for (const part of parts) {
      if (source === null || typeof source !== 'object') {
        source = undefined
        break
      }
      source = (source as Record<string, unknown>)[part]
    }
    merged = setAt(merged, path, source)
  }
  return merged
}

function createStore(
  sessionId: string,
  projection: WorldStateView | undefined,
): WorldStateDraftStore {
  let snapshot: WorldStateDraftSnapshot = {
    draft: draftOf(projection),
    projection,
    dirtyPaths: [],
    isDirty: false,
    isInferring: false,
    updateNotice: false,
  }
  const listeners = new Set<() => void>()
  const publish = (next: WorldStateDraftSnapshot): void => {
    snapshot = next
    listeners.forEach((listener) => listener())
  }
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot() {
      return snapshot
    },
    setPath(path, value) {
      if (snapshot.isInferring || path.length === 0) return
      const dirtyPaths = [...snapshot.dirtyPaths.filter((item) => !pathOverlaps(item, path)), path]
      publish({
        ...snapshot,
        draft: setAt(snapshot.draft, path, value),
        dirtyPaths,
        isDirty: true,
        updateNotice: false,
      })
    },
    deletePath(path) {
      if (snapshot.isInferring || path.length === 0) return
      const dirtyPaths = [...snapshot.dirtyPaths.filter((item) => !pathOverlaps(item, path)), path]
      publish({
        ...snapshot,
        draft: deleteAt(snapshot.draft, path),
        dirtyPaths,
        isDirty: true,
        updateNotice: false,
      })
    },
    mergeProjection(projection) {
      if (projection === undefined || stableJson(snapshot.projection) === stableJson(projection))
        return
      const incoming = draftOf(projection)
      const draft = preserveDirty(incoming, snapshot.draft, snapshot.dirtyPaths)
      publish({
        ...snapshot,
        draft,
        projection,
        updateNotice: snapshot.isDirty || snapshot.isInferring,
      })
    },
    setInferring(value) {
      publish({ ...snapshot, isInferring: value })
    },
    clearUpdateNotice() {
      if (!snapshot.updateNotice) return
      publish({ ...snapshot, updateNotice: false })
    },
    discard() {
      publish({
        ...snapshot,
        draft: draftOf(snapshot.projection),
        dirtyPaths: [],
        isDirty: false,
        updateNotice: false,
      })
    },
    markSaved() {
      const state = stateOfDraft(snapshot.draft)
      publish({
        ...snapshot,
        projection: state as WorldStateView,
        dirtyPaths: [],
        isDirty: false,
        updateNotice: false,
      })
    },
  }
}

export function createWorldStateDraftStore(
  sessionId: string,
  projection: WorldStateView | undefined,
): WorldStateDraftStore {
  const store = createStore(sessionId, projection)
  STORES.set(sessionId, store)
  return store
}

export function getWorldStateDraftStore(
  sessionId: string,
  projection: WorldStateView | undefined,
): WorldStateDraftStore {
  const existing = STORES.get(sessionId)
  if (existing !== undefined) {
    existing.mergeProjection(projection)
    return existing
  }
  return createWorldStateDraftStore(sessionId, projection)
}

export function resetWorldStateDraftStore(sessionId: string): void {
  STORES.delete(sessionId)
}

export function stateOfStore(store: WorldStateDraftStore): WorldState {
  return stateOfDraft(store.getSnapshot().draft)
}
