/**
 * dsh-rrp — durable state publishing (card + facts).
 *
 * Our structured state cannot live in a custom session event: the host refuses
 * to load a log containing an event type it does not know (see
 * `./state-payload.ts`). So the writers call this module directly, and it
 * appends ONE known `user/message` context message per lane whose `source`
 * carries the exact structured payload the projections fold. The message
 * `content` is the model-facing text; `source` never reaches the provider.
 *
 * WHY APPEND (not replace): provider caching is PREFIX caching, so a context
 * message must keep its position across turns for the previous request to stay
 * a prefix of the next. Replacing moved the message to the tail and collapsed
 * the measured hit rate from ~90% to 27%. We therefore append and dedup by
 * content — the session-constant card is published once, and the facts lane is
 * published only when it actually changes.
 */
import { randomUUID } from 'node:crypto'
import { CARD_KEY, renderCardContext, type CardContext } from './card-types.ts'
import { SUMMARY_KEY, renderMacroSummary, type MacroSummary } from './macro-summary.ts'
import { messageTextOf, rrpPayloadOf, rrpStateMessage, type RrpStatePayload } from './state-payload.ts'
import { WORLD_STATE_KEY, renderWorldState, type WorldState } from './world-state.ts'

const TAG = '[dsh-rrp]'

/** The session face this module writes through. */
export interface StateSession {
  readonly id: string
  append(type: string, data: unknown, intent?: unknown): unknown
  snapshotEvents?(): readonly { type?: string; data?: unknown }[]
}
/** The projection read face. */
export interface StateProjections {
  stateOf(session: unknown, key: string): unknown
}

/** One writer's change set; omitted fields keep their projected value. */
export interface RrpStatePatch {
  card?: CardContext
  worldState?: WorldState
  summary?: MacroSummary | null
}

/** Last published text per lane, for content dedup. */
interface Retained {
  cardText?: string
  factsText?: string
}

/** Per-session retained lanes. Bounded by the number of live sessions. */
const RETAINED = new Map<string, Retained>()

/** Append one lane message. Callers wrap; append validates before committing. */
function appendLane(session: StateSession, text: string, payload: RrpStatePayload): void {
  session.append('user/message', rrpStateMessage(randomUUID(), text, payload), { surfaceOp: 'append' })
}

/**
 * Adopt the lanes already present in the log, so a restart/resume does not
 * republish the constant card or duplicate an unchanged facts message.
 */
function adopt(session: StateSession): Retained {
  const retained: Retained = {}
  for (const event of session.snapshotEvents?.() ?? []) {
    const payload = rrpPayloadOf(event)
    if (payload === undefined) continue
    if (payload.card !== undefined) retained.cardText = messageTextOf(event)
    if (payload.worldState !== undefined || payload.summary !== undefined) retained.factsText = messageTextOf(event)
  }
  return retained
}

/**
 * Publish the session's card and/or facts context. Appends only what changed;
 * never throws into the writer's flow.
 * @param session - the RP session receiving context.
 * @param projections - the session-projection read face.
 * @param patch - the writer's change set (omitted fields read from projections).
 */
export function publishState(session: StateSession, projections: StateProjections, patch: RrpStatePatch): void {
  try {
    let retained = RETAINED.get(session.id)
    if (retained === undefined) {
      retained = adopt(session)
      RETAINED.set(session.id, retained)
    }

    const card = patch.card
    if (card !== undefined) {
      const cardText = renderCardContext(card)
      if (retained.cardText !== cardText) {
        appendLane(session, cardText, { card })
        retained.cardText = cardText
      }
    }

    const state = patch.worldState ?? (projections.stateOf(session, WORLD_STATE_KEY) as WorldState | undefined)
    if (state !== undefined) {
      const summary = patch.summary !== undefined
        ? patch.summary
        : (projections.stateOf(session, SUMMARY_KEY) as MacroSummary | null | undefined)
      const parts: string[] = []
      if (summary !== null && summary !== undefined) parts.push(renderMacroSummary(summary))
      parts.push(renderWorldState(state))
      const factsText = parts.join('\n\n')
      if (retained.factsText !== factsText) {
        appendLane(session, factsText, { worldState: state, summary: summary ?? null })
        retained.factsText = factsText
      }
    }
  } catch (error) {
    console.warn(TAG + ' state publish failed:', error)
  }
}

/** Forget one session's retained lanes (called when a session is disposed). */
export function forgetState(sessionId: string): void {
  RETAINED.delete(sessionId)
}
