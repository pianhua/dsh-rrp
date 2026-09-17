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
import type { CardContext } from './card-types.ts'
import { isCardId, presetIdForCard } from './preset-id.ts'
import { worldStateSchema } from './projection/world-state.ts'
import { publishState } from './state-publisher.ts'
import type { WorldState } from './world-state.ts'

const TAG = '[dsh-rrp]'
const START_PATH = '/dsh-rrp/start'

interface SessionLike {
  readonly id: string
  append(type: string, data: unknown, intent?: unknown): unknown
}
interface SessionsService {
  get(id: string): SessionLike | undefined
}
interface AgentLike {
  options?: { provider?: string; model?: string }
}
interface AgentsService {
  get(id: string): AgentLike | undefined
}
interface ProjectionsService {
  stateOf(session: unknown, key: string): unknown
}
interface RequestLike {
  method?: string
  [Symbol.asyncIterator](): AsyncIterator<string | Uint8Array>
}
interface ResponseLike {
  statusCode: number
  setHeader?(name: string, value: string): void
  end(body?: string): void
}
interface WebServerService {
  register(route: {
    kind: 'exact'
    path: string
    handler: (req: RequestLike, res: ResponseLike) => void | Promise<void>
  }): () => void
}
interface RuntimeFaces {
  get(name: string): unknown
}

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

/** Read the whole request body as UTF-8 text. */
async function readBody(req: RequestLike): Promise<string> {
  let text = ''
  for await (const chunk of req) {
    text += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
  }
  return text
}

/** Respond with a JSON body. */
function send(res: ResponseLike, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader?.('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

/** Resolve the provider/model route of the session's live agent. */
function routeOf(agents: AgentsService | undefined, sessionId: string): { provider: string; model: string } | undefined {
  const owner = agents?.get(sessionId)
  const provider = owner?.options?.provider
  const model = owner?.options?.model
  if (provider === undefined || provider.length === 0) return undefined
  if (model === undefined || model.length === 0) return undefined
  return { provider, model }
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
        let parsed: unknown
        try {
          parsed = JSON.parse(await readBody(req))
        } catch {
          send(res, 400, { error: 'invalid JSON body' })
          return
        }
        const request = parsed as {
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
          state = validated.data
        }

        // Publish the durable context FIRST (card lane + facts lane).
        if (card !== undefined || state !== undefined) {
          const published = publishState(session, projections, {
            ...(card === undefined ? {} : { card }),
            ...(state === undefined ? {} : { worldState: state }),
          })
          if (!published) {
            send(res, 500, { error: 'initial RP state write failed' })
            return
          }
        }
        if (state !== undefined) {
          recordActivity(session.id, {
            id: randomUUID(),
            at: new Date().toISOString(),
            actor: 'card',
            target: 'world-state',
            phase: 'committed',
            detail: '卡包初始状态',
          })
        }

        // Opening LAST: the live follow stream then ends on the opening line.
        let openingWritten: 'assistant' | 'notice' | 'none' = 'none'
        if (typeof request.opening === 'string' && request.opening.trim().length > 0) {
          const boundary = projections.stateOf(session, 'turnBoundary') as { lastTurn?: number } | undefined
          const lastTurn = boundary?.lastTurn ?? 0
          openingWritten = appendOpening(session, request.opening.trim(), routeOf(agents, session.id), lastTurn)
        }

        console.log(
          TAG + ' card start ' + session.id
          + ' (card=' + String(card !== undefined) + ', state=' + String(state !== undefined) + ', opening=' + openingWritten + ')',
        )
        send(res, 200, { ok: true, cardWritten: card !== undefined, stateWritten: state !== undefined, openingWritten })
      },
    })
    console.log(TAG + ' card start route armed at ' + START_PATH)
    return dispose
  }, 'dsh-rrp: card start route')
}
