/**
 * dsh-rrp — the activity-ledger read route.
 *
 * The right-sidebar panel polls this while it is mounted, so the "最近变更"
 * line (and the running indicator) update without touching the session log.
 * Read-only; rides the host webserver, never `createServer`.
 */
import type { Context } from '@deepseek-ai/cordis'
import { readActivity } from './activity.ts'
import { type RuntimeFaces, type WebServerService, queryOf, face, send } from './host-faces.ts'

const TAG = '[dsh-rrp]'
import { RRP_ROUTES } from './route-contract.ts'
const ACTIVITY_PATH = RRP_ROUTES.activity

/**
 * Register the read-only activity route.
 * @param ctx - the host context owning the registration.
 */
export function registerActivityRoute(ctx: Context): void {
  const runtime = ctx as unknown as RuntimeFaces
  const webServer = face<WebServerService>(runtime, 'webServer')
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
          const sessionId = queryOf(req)?.get('sessionId') ?? ''
          if (sessionId.length === 0) {
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
