/**
 * dsh-rrp — the activity-ledger read route.
 *
 * The right-sidebar panel polls this while it is mounted, so the "最近变更"
 * line (and the running indicator) update without touching the session log.
 * Read-only; rides the host webserver, never `createServer`.
 */
import type { Context } from '@deepseek-ai/cordis'
import { readActivity } from './activity.ts'

const TAG = '[dsh-rrp]'
const ACTIVITY_PATH = '/dsh-rrp/activity'

interface RequestLike {
  method?: string
  url?: string
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

/** Respond with a JSON body. */
function send(res: ResponseLike, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader?.('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

/**
 * Register the read-only activity route.
 * @param ctx - the host context owning the registration.
 */
export function registerActivityRoute(ctx: Context): void {
  const runtime = ctx as unknown as RuntimeFaces
  const webServer = runtime.get('webServer') as WebServerService | undefined
  if (webServer === undefined) {
    console.warn(TAG + ' activity route idle (missing webServer)')
    return
  }

  ctx.effect(() => {
    const dispose = webServer.register({
      kind: 'exact',
      path: ACTIVITY_PATH,
      handler: (req, res) => {
        if (req.method !== undefined && req.method !== 'GET') {
          send(res, 405, { error: 'method not allowed' })
          return
        }
        try {
          const sessionId = new URL(req.url ?? '', 'http://localhost').searchParams.get('sessionId')
          if (sessionId === null || sessionId.length === 0) {
            send(res, 400, { error: 'missing sessionId' })
            return
          }
          send(res, 200, readActivity(sessionId))
        } catch (error) {
          send(res, 500, { error: String(error) })
        }
      },
    })
    console.log(TAG + ' activity route armed at ' + ACTIVITY_PATH)
    return dispose
  }, 'dsh-rrp: activity route')
}
