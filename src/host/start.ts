/**
 * dsh-rrp — the card start route (Stage 6 / P2), lazy-opening edition (ADR 0028).
 *
 * The gallery creates the Session client-side
 * (ctx.sessions.create -> ctx.remote.agentPresets.select('rp-<card>') -> open), then
 * POSTs here. The start payload (card context, initial WorldState, timeline
 * baseline, opening prose) is NOT written to the session log: any pre-written
 * turn collides with the host loop's frozen turn counter at cold read (issue 06),
 * and any surface append before the first system commit breaks the protected-head
 * rule. Instead the payload waits in the start-pending store and the opening
 * materializer writes it inside the first turn, right after the loop's own
 * system commit and before the player's message — the only position that
 * satisfies the host v4 relationships (turn 1 strictly consecutive, system head
 * the first surface event).
 */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { recordActivity } from '../publish/activity.ts'
import { interpolateCardText, type CardContext } from '../cards/card-types.ts'
import { readCard } from '../cards/cards.ts'
import { isCardId, presetIdForCard } from './preset-id.ts'
import { worldStateSchema } from '../projection/world-state.ts'
import { buildOpeningFactsMessages } from '../publish/state-publisher.ts'
import type { WorldState } from '../world-state/world-state.ts'
import { mergePlayerVisibleWorldState } from '../world-state/world-state-visibility.ts'
import type { WorldStateTimelineBatch } from '../world-state/world-state-timeline.ts'
import type { StartPendingHandle } from './start-pending.ts'

const TAG = '[dsh-rrp]'
import { RRP_ROUTES } from '../route-contract.ts'
const START_PATH = RRP_ROUTES.start

import {
  type AgentsService,
  type ProjectionsService,
  type RuntimeFaces,
  type SessionLike,
  type SessionsService,
  type WebServerService,
  face,
  nowIso,
  readJsonBody,
  routeOf,
  send,
} from './host-faces.ts'

/** Coerce a loose request value into a card context, or undefined when unusable. */
function parseCardContext(value: unknown): CardContext | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || !isCardId(record.id)) return undefined
  if (typeof record.name !== 'string' || record.name.length === 0) return undefined
  const player = record.player
  const context: CardContext = {
    id: record.id,
    name: record.name,
    persona: typeof record.persona === 'string' ? record.persona : '',
    worldCore: typeof record.worldCore === 'string' ? record.worldCore : '',
  }
  if (player !== null && typeof player === 'object') {
    const fields = player as Record<string, unknown>
    if (typeof fields.name === 'string' && fields.name.length > 0) {
      context.player = {
        name: fields.name,
        ...(typeof fields.description === 'string' ? { description: fields.description } : {}),
      }
    }
  }
  return context
}

/**
 * Append the opening INSIDE the currently open step (the step that carries the
 * first system commit). Prefers a real assistant message; degrades to a plugin
 * notice when the host rejects the assistant shape, so materialization never
 * hard-fails. Returns which form landed.
 */
export function appendOpeningInStep(
  session: SessionLike,
  text: string,
  route: { provider: string; model: string } | undefined,
  turn: number,
  step: number,
): 'assistant' | 'notice' | 'none' {
  if (route !== undefined) {
    try {
      const message = {
        id: randomUUID(),
        role: 'assistant',
        content: [{ type: 'text', text }],
        source: { kind: 'model', provider: route.provider, model: route.model },
      }
      session.append(
        'assistant/message',
        { turn, step, message, stream: [] },
        { surfaceOp: 'append' },
      )
      return 'assistant'
    } catch (error) {
      console.warn(TAG + ' assistant opening rejected; falling back to a notice:', error)
    }
  }
  try {
    const message = {
      id: randomUUID(),
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: 'rrp', form: 'notice', summary: '序章' },
    }
    // `user/message` data IS the UserMessage (no `{turn,step,message}` wrapper).
    session.append('user/message', message, { surfaceOp: 'append' })
    return 'notice'
  } catch (error) {
    console.warn(TAG + ' opening notice rejected:', error)
    return 'none'
  }
}

/**
 * One-shot materializer (ADR 0028). Two host constraints shape the design:
 *
 * 1. Appending from inside a `session/event` listener is forbidden — the host
 *    rejects reentrant appends ("cannot reenter while another append is being
 *    published"). So the FACTS (card/state/baseline) never append ourselves:
 *    the `agent/pre-step` waterfall lets us prepend prebuilt messages to the
 *    step's decision, and the LOOP appends them right after its own system
 *    commit (the protected head) and before the player's message.
 * 2. The opening must be Author prose (assistant role) — a user message would
 *    corrupt transcript/novel roles — so it cannot ride the decision either.
 *    It is appended from a microtask queued by the first `system/message`
 *    event: by then the loop's synchronous append burst (commits + player
 *    messages) has finished, the step is still open, and the reply has not
 *    been appended yet. Log order: head → facts → player → reminder →
 *    opening → reply. The opening's position AFTER the player's first
 *    message is the accepted semantic change (ADR 0028).
 */
interface PreStepPayload {
  agent?: { session?: SessionLike }
  messages: Array<Record<string, unknown>>
  turn?: number
  step?: number
}
interface PreStepDecision {
  kind: 'enter' | 'reject'
  messages: Array<Record<string, unknown>>
}
type PreStepNext = () => Promise<PreStepDecision>

const OPENING_DUE = new Map<string, { text: string; turn: number; step: number }>()

export function registerOpeningMaterializer(ctx: Context, pending: StartPendingHandle): void {
  const runtime = ctx as unknown as RuntimeFaces & {
    on?: (event: string, listener: (...args: unknown[]) => unknown) => () => void
  }
  if (typeof runtime.on !== 'function') return
  const projections = face<ProjectionsService>(runtime, 'sessionProjections')
  const agents = runtime.get('agents') as AgentsService | undefined
  ctx.effect(() => {
    const disposePreStep = runtime.on!(
      'agent/pre-step',
      async (rawPayload: unknown, rawNext: unknown) => {
        const payload = rawPayload as PreStepPayload
        const next = rawNext as PreStepNext
        try {
          const session = payload?.agent?.session
          const sessionId = session?.id
          if (session === undefined || typeof sessionId !== 'string') return next()
          const value = pending.peek(sessionId)
          if (value === undefined) return next()
          const decision = await next()
          if (decision.kind === 'reject') return decision
          // Arm the opening append: the current step's system commit (or the
          // next one) will schedule the microtask. Re-armed every step until it
          // lands, so a restart between arming and append self-heals.
          if (typeof value.opening === 'string' && value.opening.trim().length > 0) {
            if (typeof payload.turn === 'number' && typeof payload.step === 'number') {
              OPENING_DUE.set(sessionId, {
                text: interpolateCardText(value.opening.trim(), value.card?.player),
                turn: payload.turn,
                step: payload.step,
              })
            }
          }
          if (value.factsInjected === true) {
            if (value.opening === undefined) pending.clear(sessionId)
            return decision
          }
          // No claimed player input → do not materialize into an empty step.
          if (!Array.isArray(payload.messages) || payload.messages.length === 0) return decision
          const built =
            projections === undefined ? [] : buildOpeningFactsMessages(session, projections, value)
          if (built.length > 0) {
            value.factsInjected = true
            void pending.save(sessionId, value).catch(() => {})
            recordActivity(sessionId, {
              id: randomUUID(),
              at: nowIso(),
              actor: 'card',
              target: 'world-state',
              phase: 'committed',
              detailKey: 'detail.cardInitialState',
            })
            decision.messages = [...built, ...decision.messages]
          }
          return decision
        } catch (cause) {
          console.warn(TAG + ' lazy opening pre-step failed: ' + String(cause))
          return next()
        }
      },
    )
    const disposeSystem = runtime.on!('session/event', (...args: unknown[]) => {
      try {
        const session = args[0] as SessionLike | undefined
        const event = args[1] as { type?: string } | undefined
        if (session === undefined || event?.type !== 'system/message') return
        const due = OPENING_DUE.get(session.id)
        if (due === undefined) return
        OPENING_DUE.delete(session.id)
        // The loop is between its synchronous append burst and the reply
        // stream: the step is open, so the append lands inside it. Appending
        // directly in this listener would violate the reentrancy guard.
        queueMicrotask(() => {
          try {
            appendOpeningInStep(session, due.text, routeOf(agents, session.id), due.turn, due.step)
            pending.clear(session.id)
          } catch (cause) {
            console.warn(TAG + ' lazy opening append failed: ' + String(cause))
          }
        })
      } catch (cause) {
        console.warn(TAG + ' lazy opening system-event failed: ' + String(cause))
      }
    })
    const disposeDisposed = runtime.on!('session/disposed', (...args: unknown[]) => {
      const session = args[0] as SessionLike | undefined
      if (session !== undefined) {
        pending.clear(session.id)
        OPENING_DUE.delete(session.id)
      }
    })
    return () => {
      disposePreStep()
      disposeSystem()
      disposeDisposed()
    }
  }, 'dsh-rrp: lazy opening materializer')
}

/**
 * Register the card start route.
 * @param ctx - the host context owning the registration.
 * @param pending - the restart-safe pending store (ADR 0028).
 */
export function registerStartRoute(ctx: Context, pending: StartPendingHandle): void {
  const runtime = ctx as unknown as RuntimeFaces
  const webServer = runtime.get('webServer') as WebServerService | undefined
  const sessions = runtime.get('sessions') as SessionsService | undefined
  const projections = runtime.get('sessionProjections') as ProjectionsService | undefined
  if (webServer === undefined || sessions === undefined || projections === undefined) {
    console.warn(TAG + ' card start route idle (missing webServer/sessions/sessionProjections)')
    return
  }

  ctx.effect(() => {
    const dispose = webServer.register({
      kind: 'exact',
      path: START_PATH,
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          send(res, 405, { error: 'method not allowed' })
          return
        }
        const result = await readJsonBody(req)
        if (!result.ok) {
          send(res, result.status, { error: result.error })
          return
        }
        const request = result.body as {
          sessionId?: unknown
          state?: unknown
          opening?: unknown
          card?: unknown
        }
        if (typeof request.sessionId !== 'string' || request.sessionId.length === 0) {
          send(res, 400, { error: 'missing sessionId' })
          return
        }
        const session = sessions.get(request.sessionId)
        if (session === undefined) {
          send(res, 404, { error: 'unknown session' })
          return
        }

        let card: CardContext | undefined
        if (request.card !== undefined && request.card !== null) {
          card = parseCardContext(request.card)
          if (card === undefined) {
            send(res, 400, { error: 'invalid card' })
            return
          }
          // Preset selection is a durable event after Session creation. The
          // immutable header is only the creation fact and is often empty.
          const preset = projections.stateOf(session, 'agentPreset')
          if (preset !== presetIdForCard(card.id)) {
            send(res, 400, { error: 'card does not match Session preset' })
            return
          }
        }

        let state: WorldState | undefined
        if (request.state !== undefined && request.state !== null) {
          const validated = worldStateSchema.safeParse(request.state)
          if (!validated.success) {
            send(res, 400, { error: 'invalid WorldState' })
            return
          }
          const submitted = validated.data as WorldState
          const cardInitial = card === undefined ? undefined : readCard(card.id)?.initialState
          state =
            cardInitial === undefined || cardInitial === null
              ? submitted
              : mergePlayerVisibleWorldState(cardInitial, submitted)
        } else if (card !== undefined) {
          state = readCard(card.id)?.initialState ?? undefined
        }

        const baseline: WorldStateTimelineBatch | undefined =
          state === undefined
            ? undefined
            : {
                kind: 'baseline',
                snapshot: 'initial-state',
                provenance: { actor: 'initial-state', at: nowIso() },
                origin: 'local',
              }

        // Lazy opening (ADR 0028): nothing hits the log here. The payload waits
        // in the pending store until the first turn's system commit opens the
        // protected-head position.
        const opening =
          typeof request.opening === 'string' && request.opening.trim().length > 0
            ? request.opening.trim()
            : undefined
        if (card !== undefined || state !== undefined || opening !== undefined) {
          try {
            await pending.save(session.id, {
              ...(card === undefined ? {} : { card }),
              ...(state === undefined ? {} : { state }),
              ...(baseline === undefined ? {} : { baseline }),
              ...(opening === undefined ? {} : { opening }),
            })
          } catch (error) {
            console.warn(TAG + ' start pending save failed:', error)
            send(res, 500, { error: 'start pending failed' })
            return
          }
        }

        console.log(
          TAG +
            ' card start ' +
            session.id +
            ' (card=' +
            String(card !== undefined) +
            ', state=' +
            String(state !== undefined) +
            ', opening=deferred)',
        )
        send(res, 200, {
          ok: true,
          // The log stays empty until the first turn materializes the payload;
          // the honest report is "not written yet" (ADR 0028).
          cardWritten: false,
          stateWritten: false,
          openingWritten:
            card !== undefined || state !== undefined || opening !== undefined
              ? 'deferred'
              : 'none',
        })
      },
    })
    console.log(TAG + ' card start route armed at ' + START_PATH)
    return dispose
  }, 'dsh-rrp: card start route')
}
