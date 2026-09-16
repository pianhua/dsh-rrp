/**
 * dsh-rrp — the card start route (Stage 6 / P2).
 *
 * The gallery creates the session client-side
 * (ctx.sessions.create -> ctx.remote.agentPresets.select('rp') -> open), then
 * POSTs here so the HOST writes the two things the browser cannot: the card's
 * initial WorldState event and its opening as the Author's first message.
 *
 * The opening is appended as a real \`assistant/message\` surface event (the
 * supported Session.append path). If the host rejects that shape, we fall back
 * to a plugin-source user/message notice, so a start never hard-fails.
 */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { recordActivity } from './activity.ts'
import { CARD_EVENT, type CardContext } from './card-types.ts'
import { worldStateSchema } from './projection/world-state.ts'
import { WORLD_STATE_EVENT } from './world-state.ts'

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
  if (typeof record.id !== 'string' || record.id.length === 0) return undefined
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
    session.append('user/message', { turn: lastTurn, step: 0, message }, { surfaceOp: 'append' })
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
  if (webServer === undefined || sessions === undefined) {
    console.warn(TAG + ' card start route idle (missing webServer/sessions)')
    return
  }
  const agents = runtime.get('agents') as AgentsService | undefined
  const projections = runtime.get('sessionProjections') as ProjectionsService | undefined

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

        let cardWritten = false
        if (request.card !== undefined && request.card !== null) {
          const card = parseCardContext(request.card)
          if (card === undefined) {
            send(res, 400, { error: 'invalid card' })
            return
          }
          session.append(CARD_EVENT, card)
          cardWritten = true
        }

        let stateWritten = false
        if (request.state !== undefined && request.state !== null) {
          const state = worldStateSchema.safeParse(request.state)
          if (!state.success) {
            send(res, 400, { error: 'invalid WorldState' })
            return
          }
          session.append(WORLD_STATE_EVENT, state.data)
          recordActivity(session, {
            id: randomUUID(),
            at: new Date().toISOString(),
            actor: 'card',
            target: 'world-state',
            phase: 'committed',
            detail: '卡包初始状态',
          })
          stateWritten = true
        }

        let openingWritten: 'assistant' | 'notice' | 'none' = 'none'
        if (typeof request.opening === 'string' && request.opening.trim().length > 0) {
          const boundary = projections?.stateOf(session, 'turnBoundary') as { lastTurn?: number } | undefined
          const lastTurn = boundary?.lastTurn ?? 0
          openingWritten = appendOpening(session, request.opening.trim(), routeOf(agents, session.id), lastTurn)
        }

        console.log(
          TAG + ' card start ' + session.id
          + ' (card=' + String(cardWritten) + ', state=' + String(stateWritten) + ', opening=' + openingWritten + ')',
        )
        send(res, 200, { ok: true, cardWritten, stateWritten, openingWritten })
      },
    })
    console.log(TAG + ' card start route armed at ' + START_PATH)
    return dispose
  }, 'dsh-rrp: card start route')
}
