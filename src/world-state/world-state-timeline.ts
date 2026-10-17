import type { WorldStateChange, WorldStateChangeType } from './world-state.ts'

export const WORLD_STATE_TIMELINE_KEY = 'rrpWorldStateTimeline'
export const WORLD_STATE_TIMELINE_VERSION = 1 as const

export type TimelineActor =
  'initial-state' | 'player' | 'chronicler' | 'copilot' | 'system' | 'unknown'
export type TimelineOrigin = 'inherited' | 'local'

export interface WorldStateTimelineProvenance {
  actor: TimelineActor
  storyTurn?: number
  at?: string
  evidence?: string
}

export interface WorldStateTimelineBaseline {
  kind: 'baseline'
  snapshot: 'initial-state'
  provenance: WorldStateTimelineProvenance
  origin?: TimelineOrigin
}

export interface WorldStateTimelineChangeBatch {
  kind: 'changes'
  changes: WorldStateChange[]
  provenance: WorldStateTimelineProvenance
  origin?: TimelineOrigin
}

export type WorldStateTimelineBatch = WorldStateTimelineBaseline | WorldStateTimelineChangeBatch
export type WorldStateTimelineEntry = WorldStateTimelineBatch

export interface WorldStateTimeline {
  version: typeof WORLD_STATE_TIMELINE_VERSION
  batches: WorldStateTimelineEntry[]
}

export function emptyWorldStateTimeline(): WorldStateTimeline {
  return { version: WORLD_STATE_TIMELINE_VERSION, batches: [] }
}

export function isWorldStateTimelineBatch(value: unknown): value is WorldStateTimelineBatch {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const provenance = record.provenance
  if (typeof provenance !== 'object' || provenance === null) return false
  const actor = (provenance as { actor?: unknown }).actor
  if (
    actor !== 'initial-state' &&
    actor !== 'player' &&
    actor !== 'chronicler' &&
    actor !== 'copilot' &&
    actor !== 'system' &&
    actor !== 'unknown'
  )
    return false
  if (record.origin !== undefined && record.origin !== 'inherited' && record.origin !== 'local')
    return false
  if (record.kind === 'baseline') return record.snapshot === 'initial-state'
  if (record.kind !== 'changes' || !Array.isArray(record.changes) || record.changes.length === 0)
    return false
  return record.changes.every((change) => {
    if (typeof change !== 'object' || change === null) return false
    const type = (change as { type?: unknown }).type
    return (
      type === 'added' ||
      type === 'modified' ||
      type === 'closed' ||
      type === 'archived' ||
      type === 'deleted' ||
      type === 'restored'
    )
  })
}

export function foldWorldStateTimeline(
  state: WorldStateTimeline,
  entry: WorldStateTimelineEntry,
): WorldStateTimeline {
  return { ...state, batches: [...state.batches, entry] }
}

export function timelineChangeTypes(entry: WorldStateTimelineBatch): WorldStateChangeType[] {
  if (entry.kind === 'baseline') return []
  return [...new Set(entry.changes.map((change) => change.type))]
}
