/**
 * dsh-rrp — stable read contract for external plugins.
 *
 * Extension layer (D12): memory / analysis plugins live ABOVE this plugin.
 * They must not reach into session internals; they read our projected state
 * through the host projection registry using these stable keys and shapes,
 * and contribute their own capabilities through the HOST's own seams
 * (`ctx.sessionQuery` for retrieval, an `agent/pre-step` listener or an
 * RP-preset row for context).
 *
 * Durable state rides inside ordinary `user/message` events (a session event
 * type the host knows); `RrpStatePayload` / `rrpPayloadOf` is the supported
 * way to read it back, since inventing a session event type makes the whole log
 * unreadable to the host.
 *
 * This module is the only supported import surface for that. It is deliberately
 * dependency-free so both a host plugin and a browser bundle can import it.
 */
export {
  NO_WORLD_STATE_CHANGE,
  WORLD_STATE_KEY,
  WORLD_STATE_VERSION,
  diagnoseWorldState,
  diffWorldState,
  renderWorldStateDiff,
  emptyWorldState,
  renderWorldState,
} from './world-state.ts'
export {
  PROTECTED_OBJECT_REFERENCE_NAME,
  PROTECTED_WORLD_STATE_NOTICE,
  filterWorldState,
  mergePlayerVisibleWorldState,
  renderWorldStateForAudience,
  sanitizePlayerText,
  sanitizeWorldStateDiff,
} from './world-state-visibility.ts'
export type {
  ActiveConflict,
  CharacterCognitionEntry,
  CharacterCommonFields,
  CharacterPresence,
  CognitionMarker,
  ConflictStatus,
  CurrentObjective,
  CurrentWorldEventEntry,
  CurrentWorldEventStatus,
  CurrentWorldEventType,
  DynamicFieldType,
  DynamicFieldValue,
  ExternalReference,
  ObjectReference,
  ObjectiveStatus,
  RelationshipAttitude,
  RelationshipEntry,
  WorldStateChangeType,
  ScalarFieldDefinition,
  ScalarFieldType,
  ScalarValue,
  TrackedObject,
  TrackedObjectKind,
  WorldState,
  WorldStateChange,
  WorldStateCharacter,
  WorldStateDiagnostic,
  WorldStateDiagnosticLimits,
  WorldStateDiff,
  WorldStateFlag,
  WorldStateItem,
  WorldStateRelation,
  WorldStateScalarField,
  WorldStateScene,
  WorldStateView,
  WorldStateVisibility,
  WorldStateAudience,
  WorldStatePlayerView,
  WorldStateVisibilityNotice,
} from './world-state.ts'
export {
  WORLD_STATE_TIMELINE_KEY,
  WORLD_STATE_TIMELINE_VERSION,
  emptyWorldStateTimeline,
} from './world-state-timeline.ts'
export type {
  TimelineActor,
  TimelineOrigin,
  WorldStateTimeline,
  WorldStateTimelineBaseline,
  WorldStateTimelineBatch,
  WorldStateTimelineChangeBatch,
  WorldStateTimelineEntry,
  WorldStateTimelineProvenance,
} from './world-state-timeline.ts'
export { SUMMARY_KEY, renderMacroSummary } from './macro-summary.ts'
export type { MacroSummary } from './macro-summary.ts'
export { DEFAULT_RRP_SETTINGS, RRP_SETTINGS_KEY, rrpSettingsOf } from './settings.ts'
export type { RrpSettings } from './settings.ts'
export {
  RRP_LORE_KEY,
  LORE_LIMITS,
  applyLoreChange,
  isLoreName,
  loreEntriesOf,
  validateLoreEntry,
} from './lore-state.ts'
export type { LoreChange, LoreEntry, LoreValidation } from './lore-state.ts'
export {
  ACTIVITY_LIMIT,
  appendActivity,
  emptyActivityLog,
  lastActivity,
  pendingActivity,
} from './activity.ts'
export type { RrpActivity, RrpActivityLog, RrpActor, RrpPhase, RrpTarget } from './activity.ts'
export { CARD_KEY, renderCardContext, toPlayerSafeCardPack } from './card-types.ts'
export type {
  CardContext,
  CardMeta,
  CardOpening,
  CardPack,
  CardPackPlayerView,
  CardPlayer,
  CardSkill,
  CardSkillPlayerView,
} from './card-types.ts'
export type {
  CardStateAlias,
  CardStateField,
  CardStateFieldStatus,
  CardStateMigration,
  CardStateSchema,
} from './card-state-schema.ts'
export { RRP_PLUGIN, messageTextOf, rrpPayloadOf, rrpStateMessage } from './state-payload.ts'
export type { RrpStatePayload } from './state-payload.ts'
