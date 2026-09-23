/**
 * dsh-rrp — durable Session publishing for RP context and hidden domain state.
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
 * content — the session-constant card is published once, rendered facts are
 * deduplicated, and hidden settings/lore operations share the facts event.
 */
import { randomUUID } from 'node:crypto'
import type { ProjectionsService, SessionLike } from './host-faces.ts'
import { CARD_KEY, renderCardContext, type CardContext } from './card-types.ts'
import {
  hitSet,
  renderTriggerBlock,
  TRIGGER_BLOCK_HEADER,
  type TriggerHit,
} from './lore-condition.ts'
import { triggersOfCard } from './cards.ts'
import { SUMMARY_KEY, renderMacroSummary, type MacroSummary } from './macro-summary.ts'
import { RRP_SETTINGS_KEY, rrpSettingsOf, type RrpSettings } from './settings.ts'
import type { LoreChange } from './lore-state.ts'
import { rrpStateMessage, type RrpStatePayload } from './state-payload.ts'
import { TRANSCRIPT_KEY, type TranscriptSlice } from './transcript.ts'
import { WORLD_STATE_KEY, renderWorldState, type WorldState } from './world-state.ts'

const TAG = '[dsh-rrp]'

/** Model-facing breadcrumb for metadata-only facts publishes (see publishState). */
const LORE_ONLY_NOTICE = '【dsh-rrp】世界知识条目已更新（内容经系统技能注入，上文状态未变）。'

/** Compatibility names backed by the shared host faces. */
export type StateSession = SessionLike
export type StateProjections = ProjectionsService

/** One writer's change set; omitted fields keep their projected value. */
export interface RrpStatePatch {
  card?: CardContext
  worldState?: WorldState
  /** Seq of the newest prose this fold covered (the Chronicler's cursor). */
  stateFoldSeq?: number
  summary?: MacroSummary | null
  /** Turn that produced `summary`; persisted as the durable Summarizer watermark. */
  summaryTurn?: number
  settings?: RrpSettings
  sediment?: LoreChange
}

/** Last published text per lane, for content dedup. */
interface Retained {
  cardFingerprint?: string
  factsFingerprint?: string
  /** Chronicler fold cursor at the last publish (must never be deduped away). */
  factsFoldSeq?: number
  /** Conditional-injection hits at the last publish (revoke diff baseline). */
  triggerHits?: TriggerHit[]
  /**
   * True when this process adopted a facts lane that already carries an
   * injection block but cannot know which skills that block listed: the hit
   * set is a diff baseline, not a folded fact, so a restart/resume loses it.
   * The next publish then revokes blanketly instead of silently leaving the
   * unreferenced old block standing in the prefix.
   */
  triggerBaselineUnknown?: boolean
}

/** Per-session retained lanes. Bounded by the number of live sessions. */
const RETAINED = new Map<string, Retained>()

/** Append one lane message. Callers wrap; append validates before committing. */
function appendLane(session: StateSession, text: string, payload: RrpStatePayload): void {
  session.append('user/message', rrpStateMessage(randomUUID(), text, payload), {
    surfaceOp: 'append',
  })
}

/**
 * Facts-lane content key. The settings are folded in because a cadence-only
 * change must still republish — otherwise `/summary every N` never reaches the
 * log and is lost on restart.
 */
function factsFingerprint(text: string, settings: RrpSettings): string {
  return (
    text +
    '\u0000summary=' +
    String(settings.summaryEnabled) +
    '\u0000every=' +
    String(settings.summaryEveryTurns)
  )
}

/** Card-lane content key: the rendered text plus which card produced it. */
function cardFingerprint(text: string, card: CardContext): string {
  return text + '\u0000card=' + card.id
}

/**
 * Adopt the lanes the transcript slice already folded, so a restart/resume
 * does not republish the constant card or duplicate an unchanged facts
 * message. The projection read may throw (racing disposal) — same outcome as
 * the old missing snapshot: nothing is retained.
 */
function adopt(session: StateSession, projections: StateProjections): Retained {
  const retained: Retained = {}
  let slice: TranscriptSlice | undefined
  try {
    slice = projections.stateOf(session, TRANSCRIPT_KEY) as TranscriptSlice | undefined
  } catch {
    slice = undefined
  }
  if (slice?.card !== undefined) retained.cardFingerprint = slice.card.fingerprint
  if (slice?.facts !== undefined) {
    retained.factsFingerprint = factsFingerprint(
      slice.facts.text,
      rrpSettingsOf(projections.stateOf(session, RRP_SETTINGS_KEY)),
    )
    // The hit set is a diff baseline, never a folded fact, so it cannot come
    // back from the log: an adopted block means "unknown what it listed".
    retained.triggerBaselineUnknown = slice.facts.text.includes(TRIGGER_BLOCK_HEADER)
    retained.factsFoldSeq = slice.lastFoldSeq
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
export function publishState(
  session: StateSession,
  projections: StateProjections,
  patch: RrpStatePatch,
): boolean {
  try {
    let retained = RETAINED.get(session.id)
    if (retained === undefined) {
      retained = adopt(session, projections)
      RETAINED.set(session.id, retained)
    }

    const card = patch.card
    if (card !== undefined) {
      const cardText = renderCardContext(card)
      if (retained.cardFingerprint !== cardFingerprint(cardText, card)) {
        appendLane(session, cardText, { card })
        retained.cardFingerprint = cardFingerprint(cardText, card)
      }
    }

    const state =
      patch.worldState ?? (projections.stateOf(session, WORLD_STATE_KEY) as WorldState | undefined)
    if (
      state !== undefined ||
      patch.summary !== undefined ||
      patch.settings !== undefined ||
      patch.sediment !== undefined
    ) {
      const summary =
        patch.summary !== undefined
          ? patch.summary
          : (projections.stateOf(session, SUMMARY_KEY) as MacroSummary | null | undefined)
      const settings =
        patch.settings ?? rrpSettingsOf(projections.stateOf(session, RRP_SETTINGS_KEY))
      const parts: string[] = []
      if (summary !== null && summary !== undefined) parts.push(renderMacroSummary(summary))
      if (state !== undefined) parts.push(renderWorldState(state))
      // Conditional injection (issue #16): evaluate the card's skill triggers
      // against the post-change state. The block is keyed only by the hit SET,
      // so within-band state wobble renders byte-identical text and the
      // fingerprint below suppresses the append; a set change (incl. shrinking
      // to empty) renders a new block with the revocation sentence.
      if (state !== undefined) {
        const activeCard =
          card ?? (projections.stateOf(session, CARD_KEY) as CardContext | null | undefined) ?? null
        if (activeCard !== null) {
          const triggers = triggersOfCard(activeCard.id)
          if (triggers.length > 0) {
            // One publish can only supersede the log's last block, so the
            // unknown-baseline flag is consumed here either way.
            const baselineUnknown = retained.triggerBaselineUnknown === true
            retained.triggerBaselineUnknown = false
            const prevHits = retained.triggerHits ?? []
            const hits = hitSet(triggers, state)
            retained.triggerHits = hits
            if (hits.length > 0 || prevHits.length > 0 || baselineUnknown) {
              parts.push(renderTriggerBlock(hits, prevHits, baselineUnknown))
            }
          }
        }
      }
      const factsText = parts.join('\n\n')
      const fingerprint = factsFingerprint(factsText, settings)
      // The cursor always travels with its state: a fold that rendered
      // byte-identical facts still has to be booked, or the Chronicler would
      // re-read the same prose forever.
      const foldMoved =
        patch.stateFoldSeq !== undefined && retained.factsFoldSeq !== patch.stateFoldSeq
      if (patch.sediment !== undefined || retained.factsFingerprint !== fingerprint || foldMoved) {
        // Metadata-only publish (e.g. a confirmed lore entry whose state text is
        // unchanged): keep the model-visible content to one breadcrumb line
        // instead of re-rendering the full state — the lore data itself
        // rides the hidden source.rrp payload and reaches the model via skills.
        const text =
          patch.sediment !== undefined && retained.factsFingerprint === fingerprint
            ? LORE_ONLY_NOTICE
            : factsText
        appendLane(session, text, {
          ...(state === undefined ? {} : { worldState: state }),
          ...(state !== undefined || patch.summary !== undefined
            ? { summary: summary ?? null }
            : {}),
          ...(patch.summaryTurn === undefined ? {} : { summaryTurn: patch.summaryTurn }),
          settings,
          ...(patch.sediment === undefined ? {} : { sediment: patch.sediment }),
          ...(patch.stateFoldSeq === undefined ? {} : { stateFoldSeq: patch.stateFoldSeq }),
        })
        retained.factsFingerprint = fingerprint
        if (patch.stateFoldSeq !== undefined) retained.factsFoldSeq = patch.stateFoldSeq
      }
    }
    return true
  } catch (error) {
    console.warn(TAG + ' state publish failed:', error)
    return false
  }
}

/** Forget one session's retained lanes (called when a session is disposed). */
export function forgetState(sessionId: string): void {
  RETAINED.delete(sessionId)
}

/** Drop every retained lane (plugin unload must not leave stale sessions behind). */
export function forgetAllState(): void {
  RETAINED.clear()
}
