/**
 * dsh-rrp — the card start route (Stage 6 / P2).
 *
 * The gallery creates the Session client-side
 * (ctx.sessions.create -> ctx.remote.agentPresets.select('rp-<card>') -> open), then
 * POSTs here so the HOST writes the card's durable context and its opening as
 * the Author's first message.
 *
 * Both are ordinary known events: the context rides `user/message` (structured
 * payload hidden in the message source, see ./state-payload.ts) and the opening
 * is a real `assistant/message` surface event. The opening is appended LAST so
 * the live follow stream ends on it, which is what makes it appear without a
 * manual refresh. If the host rejects the assistant shape, we fall back to a
 * plugin-source user/message notice, so a start never hard-fails.
 */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { recordActivity } from './activity.ts'
import { interpolateCardText, type CardContext } from './card-types.ts'
import { readCard } from './cards.ts'
import { isCardId, presetIdForCard } from './preset-id.ts'
import { worldStateSchema } from './projection/world-state.ts'
import { publishState } from './state-publisher.ts'
import type { WorldState } from './world-state.ts'
import { mergePlayerVisibleWorldState } from './world-state-visibility.ts'
import type { WorldStateTimelineBatch } from './world-state-timeline.ts'

const TAG = '[dsh-rrp]'
import { RRP_ROUTES } from './route-contract.ts'
const START_PATH = RRP_ROUTES.start

import {
  type AgentsService,
  type ProjectionsService,
  type RuntimeFaces,
  type SessionLike,
  type SessionsService,
  type WebServerService,
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
 * Append the opening. Prefers a real assistant message; degrades to a plugin
 * notice when the host rejects the assistant shape.
 * @returns which form landed.
 */
function appendOpening(
  session: SessionLike,
  text: string,
  route: { provider: string; model: string } | undefined,
  lastTurn: number,
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
        { turn: lastTurn, step: 0, message, stream: [] },
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
      source: { kind: 'plugin', plugin: 'dsh-rrp', form: 'notice', summary: '序章' },
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
 * Register the card start route.
 * @param ctx - the host context owning the registration.
 */
export function registerStartRoute(ctx: Context): void {
  const runtime = ctx as unknown as RuntimeFaces
  const webServer = runtime.get('webServer') as WebServerService | undefined
  const sessions = runtime.get('sessions') as SessionsService | undefined
  const projections = runtime.get('sessionProjections') as ProjectionsService | undefined
  if (webServer === undefined || sessions === undefined || projections === undefined) {
    console.warn(TAG + ' card start route idle (missing webServer/sessions/sessionProjections)')
    return
  }
  const agents = runtime.get('agents') as AgentsService | undefined

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

        // Publish the durable context FIRST (card lane + facts lane).
        if (card !== undefined || state !== undefined) {
          const published = publishState(session, projections, {
            ...(card === undefined ? {} : { card }),
            ...(state === undefined ? {} : { worldState: state }),
            ...(baseline === undefined ? {} : { worldStateTimelineBatch: baseline }),
          })
          if (!published) {
            send(res, 500, { error: 'initial RP state write failed' })
            return
          }
        }
        if (state !== undefined) {
          recordActivity(session.id, {
            id: randomUUID(),
            at: nowIso(),
            actor: 'card',
            target: 'world-state',
            phase: 'committed',
            detailKey: 'detail.cardInitialState',
          })
        }

        // Opening LAST: the live follow stream then ends on the opening line.
        let openingWritten: 'assistant' | 'notice' | 'none' = 'none'
        if (typeof request.opening === 'string' && request.opening.trim().length > 0) {
          const boundary = projections.stateOf(session, 'turnBoundary') as
            { lastTurn?: number } | undefined
          const lastTurn = boundary?.lastTurn ?? 0
          const opening = interpolateCardText(request.opening.trim(), card?.player)
          openingWritten = appendOpening(session, opening, routeOf(agents, session.id), lastTurn)
        }

        console.log(
          TAG +
            ' card start ' +
            session.id +
            ' (card=' +
            String(card !== undefined) +
            ', state=' +
            String(state !== undefined) +
            ', opening=' +
            openingWritten +
            ')',
        )
        send(res, 200, {
          ok: true,
          cardWritten: card !== undefined,
          stateWritten: state !== undefined,
          openingWritten,
        })
      },
    })
    console.log(TAG + ' card start route armed at ' + START_PATH)
    return dispose
  }, 'dsh-rrp: card start route')
}
