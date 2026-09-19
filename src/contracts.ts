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
  diffWorldState,
  emptyWorldState,
  renderWorldState,
} from './world-state.ts'
export type {
  WorldState,
  WorldStateCharacter,
  WorldStateFlag,
  WorldStateItem,
  WorldStateRelation,
  WorldStateScene,
  WorldStateView,
} from './world-state.ts'
export {
  SUMMARY_KEY,
  renderMacroSummary,
} from './macro-summary.ts'
export type { MacroSummary } from './macro-summary.ts'
export {
  DEFAULT_RRP_SETTINGS,
  RRP_SETTINGS_KEY,
  rrpSettingsOf,
} from './settings.ts'
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
export type {
  RrpActivity,
  RrpActivityLog,
  RrpActor,
  RrpPhase,
  RrpTarget,
} from './activity.ts'
export {
  CARD_KEY,
  renderCardContext,
} from './card-types.ts'
export type {
  CardContext,
  CardMeta,
  CardOpening,
  CardPack,
  CardPlayer,
  CardSkill,
} from './card-types.ts'
export {
  RRP_PLUGIN,
  messageTextOf,
  rrpPayloadOf,
  rrpStateMessage,
} from './state-payload.ts'
export type { RrpStatePayload } from './state-payload.ts'
