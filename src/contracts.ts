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
 * This module is the only supported import surface for that. It is deliberately
 * dependency-free so both a host plugin and a browser bundle can import it.
 */
export {
  NO_WORLD_STATE_CHANGE,
  WORLD_STATE_EVENT,
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
  WorldStateScene,
  WorldStateView,
} from './world-state.ts'
export {
  SUMMARY_EVENT,
  SUMMARY_KEY,
  renderMacroSummary,
} from './macro-summary.ts'
export type { MacroSummary } from './macro-summary.ts'
export {
  ACTIVITY_EVENT,
  ACTIVITY_KEY,
  ACTIVITY_LIMIT,
  emptyActivityLog,
} from './activity.ts'
export type {
  RrpActivity,
  RrpActivityLog,
  RrpActor,
  RrpPhase,
  RrpTarget,
} from './activity.ts'
export {
  CARD_EVENT,
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
