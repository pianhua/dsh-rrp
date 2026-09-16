/**
 * dsh-rrp — durable context publishing (card + facts).
 *
 * WHY: the host persists every \`agent/pre-step\` message with
 * \`surfaceOp:'append'\` (dsh-agent-loop line 1028), so a per-turn state
 * injection accumulated one stale copy per turn. This module publishes the
 * context as durable surface messages and REPLACES the previous facts message,
 * so the model-visible surface always holds exactly one current copy.
 *
 * DSH has no log rollback, and none is needed:
 *   - \`Session.append\` validates BEFORE \`log.push\`, so a rejected replace
 *     writes nothing; we catch it and fall back to a plain append.
 *   - A replace never deletes: the old event stays in the log, shadowed only in
 *     the ordered surface (replayable, auditable).
 *   - \`append\` forbids re-entering during publication, so the event listener
 *     defers through \`queueMicrotask\`.
 */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { CARD_EVENT, CARD_KEY, renderCardContext, type CardContext } from './card-types.ts'
import { SUMMARY_EVENT, SUMMARY_KEY, renderMacroSummary, type MacroSummary } from './macro-summary.ts'
import { WORLD_STATE_EVENT, WORLD_STATE_KEY, renderWorldState, type WorldState } from './world-state.ts'

const TAG = '[dsh-rrp]'
const PLUGIN = 'dsh-rrp'
/** Text prefixes identifying our own durable context messages. */
const CARD_MARKER = '【当前卡包'
const FACTS_MARKER = '【世界状态'

interface SessionEventLike {
  readonly seq?: number
  readonly type?: string
  readonly data?: unknown
}
interface ContextSession {
  readonly id: string
  append(type: string, data: unknown, intent?: unknown): unknown
  snapshotEvents?(): readonly SessionEventLike[]
}
interface ContextProjections {
  stateOf(session: unknown, key: string): unknown
}
interface RuntimeFaces {
  get(name: string): unknown
  on(event: string, listener: (...args: unknown[]) => void): () => void
}

/** Per-session retained lane: last published seq + text (for dedup + replace). */
interface Retained {
  card?: number
  cardText?: string
  facts?: number
  factsText?: string
}
const RETAINED = new Map<string, Retained>()

/** Extract the appended event's seq, when the host returned one. */
function seqOf(appended: unknown): number | undefined {
  const seq = (appended as { seq?: unknown } | undefined)?.seq
  return typeof seq === 'number' ? seq : undefined
}

/**
 * Flatten a logged event's text blocks. \`user/message\` carries the
 * UserMessage DIRECTLY as its data (\`SessionEventMap['user/message'] = UserMessage\`),
 * unlike \`assistant/message\`, which wraps it under \`message\`. Handle both.
 */
function eventText(event: SessionEventLike): string {
  const data = event.data as { content?: unknown; message?: { content?: unknown } } | undefined
  const content = data?.content ?? data?.message?.content
  if (!Array.isArray(content)) return ''
  return content.map((block) => (block as { text?: unknown }).text ?? '').join('')
}

/** Whether one logged event is our own context message for a marker. */
function isOwned(event: SessionEventLike, marker: string): boolean {
  if (event.type !== 'user/message') return false
  const data = event.data as { source?: { plugin?: unknown } } | undefined
  if (data?.source?.plugin !== PLUGIN) return false
  return eventText(event).startsWith(marker)
}

/** Newest owned lane in the log, adopted across a restart/resume. */
function findOwned(session: ContextSession, marker: string): { seq?: number; text: string } {
  const events = session.snapshotEvents?.() ?? []
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event !== undefined && isOwned(event, marker)) {
      return { ...(typeof event.seq === 'number' ? { seq: event.seq } : {}), text: eventText(event) }
    }
  }
  return { text: '' }
}

/** One plugin-role context message. */
function pluginMessage(text: string): Record<string, unknown> {
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'plugin', plugin: PLUGIN },
  }
}

/**
 * Publish one lane: replace its previous message when possible, else append.
 * Never throws. A rejected replace writes nothing (validation precedes commit),
 * so falling back to append is always safe.
 */
function publishLane(session: ContextSession, retained: Retained, text: string, lane: 'card' | 'facts'): void {
  const current = lane === 'card' ? retained.card : retained.facts
  try {
    if (current !== undefined) {
      try {
        const appended = session.append('user/message', pluginMessage(text), {
          surfaceOp: { op: 'replace', startSeq: current, endSeq: current },
          sourceEventSeqs: [current],
        })
        setLane(retained, lane, seqOf(appended) ?? current, text)
        return
      } catch (error) {
        console.warn(TAG + ' context replace rejected; appending instead:', error)
        setLane(retained, lane, undefined, undefined)
      }
    }
    const appended = session.append('user/message', pluginMessage(text), { surfaceOp: 'append' })
    setLane(retained, lane, seqOf(appended), text)
  } catch (error) {
    console.warn(TAG + ' context publish failed:', error)
  }
}

/** Record one lane's retained seq + text. */
function setLane(retained: Retained, lane: 'card' | 'facts', seq: number | undefined, text: string | undefined): void {
  if (lane === 'card') {
    retained.card = seq
    retained.cardText = text
  } else {
    retained.facts = seq
    retained.factsText = text
  }
}

/**
 * Publish the session's card + facts context. The card is session-constant and
 * published once; the facts lane always supersedes its previous message.
 * @param session - the RP session receiving context.
 * @param projections - the session-projection read face.
 */
export function publishContext(session: ContextSession, projections: ContextProjections): void {
  try {
    let retained = RETAINED.get(session.id)
    if (retained === undefined) {
      const card = findOwned(session, CARD_MARKER)
      const facts = findOwned(session, FACTS_MARKER)
      retained = {
        ...(card.seq === undefined ? {} : { card: card.seq }),
        ...(card.seq === undefined ? {} : { cardText: card.text }),
        ...(facts.seq === undefined ? {} : { facts: facts.seq }),
        ...(facts.seq === undefined ? {} : { factsText: facts.text }),
      }
      RETAINED.set(session.id, retained)
    }

    const card = projections.stateOf(session, CARD_KEY) as CardContext | null | undefined
    if (card !== null && card !== undefined) {
      const cardText = renderCardContext(card)
      if (retained.cardText !== cardText) publishLane(session, retained, cardText, 'card')
    }

    const state = projections.stateOf(session, WORLD_STATE_KEY) as WorldState | undefined
    if (state !== undefined) {
      const summary = projections.stateOf(session, SUMMARY_KEY) as MacroSummary | null | undefined
      const factsText = [
        summary === null || summary === undefined ? undefined : renderMacroSummary(summary),
        renderWorldState(state),
      ].filter((part): part is string => part !== undefined).join('\n\n')
      if (retained.factsText !== factsText) publishLane(session, retained, factsText, 'facts')
    }
  } catch (error) {
    console.warn(TAG + ' context publish threw:', error)
  }
}

/**
 * Arm durable context publishing for one preset: on our context-bearing events,
 * defer a publish through a microtask (\`append\` forbids re-entering) and let
 * the projections settle first.
 * @param ctx - the host context owning the registration.
 * @param presetId - only sessions composed from this preset are published.
 */
export function registerContextPublisher(ctx: Context, presetId: string): void {
  const runtime = ctx as unknown as RuntimeFaces
  const projections = runtime.get('sessionProjections') as ContextProjections | undefined
  if (projections === undefined) {
    console.warn(TAG + ' context publisher idle (missing sessionProjections)')
    return
  }
  ctx.effect(() => {
    const dispose = runtime.on('session/event', (...args: unknown[]) => {
      const session = args[0] as ContextSession | undefined
      const event = args[1] as { type?: string } | undefined
      if (session === undefined || event?.type === undefined) return
      if (event.type !== CARD_EVENT && event.type !== WORLD_STATE_EVENT && event.type !== SUMMARY_EVENT) return
      if (projections.stateOf(session, 'agentPreset') !== presetId) return
      queueMicrotask(() => publishContext(session, projections))
    })
    console.log(TAG + ' durable context publisher armed for preset ' + presetId)
    return dispose
  }, 'dsh-rrp: durable context publisher')
}
