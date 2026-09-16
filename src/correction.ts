/**
 * dsh-rrp — player correction write path (D6, natural-time, no locks).
 *
 * The right-sidebar panel posts the player's edited WorldState here. We
 * validate it and append it as a whole-value `rrp/world-state` event: the
 * correction is simply the last write, and the next Author step consumes the
 * newest slice. No lock, no arbitration, no conflict matrix.
 *
 * The route rides the host webserver (HOST_ALIGNMENT: only register an
 * endpoint when one is genuinely needed; never `createServer`).
 */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { recordActivity } from './activity.ts'
import { worldStateSchema } from './projection/world-state.ts'
import { WORLD_STATE_EVENT } from './world-state.ts'

const TAG = '[dsh-rrp]'
/** Same-origin exact route the panel posts to. */
const CORRECTION_PATH = '/dsh-rrp/world-state'

interface SessionLike {
  append(type: string, data: unknown): unknown
}
interface SessionsService {
  get(id: string): SessionLike | undefined
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

/**
 * Register the player-correction route.
 * @param ctx - the host context owning the registration.
 */
export function registerCorrectionRoute(ctx: Context): void {
  const runtime = ctx as unknown as RuntimeFaces
  const webServer = runtime.get('webServer') as WebServerService | undefined
  const sessions = runtime.get('sessions') as SessionsService | undefined
  if (webServer === undefined || sessions === undefined) {
    console.warn(TAG + ' player correction idle (missing webServer/sessions)')
    return
  }

  ctx.effect(() => {
    const dispose = webServer.register({
      kind: 'exact',
      path: CORRECTION_PATH,
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
        const request = parsed as { sessionId?: unknown; state?: unknown }
        if (typeof request.sessionId !== 'string' || request.sessionId.length === 0) {
          send(res, 400, { error: 'missing sessionId' })
          return
        }
        const state = worldStateSchema.safeParse(request.state)
        if (!state.success) {
          send(res, 400, { error: 'invalid WorldState' })
          return
        }
        const session = sessions.get(request.sessionId)
        if (session === undefined) {
          send(res, 404, { error: 'unknown session' })
          return
        }
        session.append(WORLD_STATE_EVENT, state.data)
        recordActivity(session, {
          id: randomUUID(),
          at: new Date().toISOString(),
          actor: 'player',
          target: 'world-state',
          phase: 'corrected',
          detail: '玩家就地矫正',
        })
        console.log(TAG + ' player correction committed for session ' + request.sessionId)
        send(res, 200, { ok: true })
      },
    })
    console.log(TAG + ' player correction route armed at ' + CORRECTION_PATH)
    return dispose
  }, 'dsh-rrp: player correction route')
}
