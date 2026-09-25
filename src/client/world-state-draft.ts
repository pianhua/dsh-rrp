import { emptyWorldState, type WorldState, type WorldStateView } from '../world-state.ts'

/** The editable client draft is the player-safe v2 wire view, including notices. */
export type WorldStateDraft = WorldStateView

export function draftOf(view: WorldStateView | undefined): WorldStateDraft {
  return structuredClone(view ?? emptyWorldState()) as WorldStateDraft
}

export function isEmptyDraft(draft: WorldStateDraft): boolean {
  return (
    Object.keys(draft.trackedObjects).length === 0 &&
    Object.keys(draft.globalFields).length === 0 &&
    draft.objectives.length === 0 &&
    draft.conflicts.length === 0 &&
    draft.cognition.length === 0 &&
    draft.relations.length === 0 &&
    draft.currentEvents.length === 0
  )
}

/** Strip the wire-only notice list before invoking the existing correction contract. */
export function stateOfDraft(draft: WorldStateDraft): WorldState {
  const { visibilityNotices: _visibilityNotices, ...state } = structuredClone(draft)
  return state as WorldState
}
