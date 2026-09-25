import type { Context } from '@deepseek-ai/cordis'
import { RRP_ROUTES } from './route-contract.ts'
import { WORLD_STATE_KEY, type WorldState } from './world-state.ts'
import { sanitizePlayerText, sanitizeWorldStateDiff } from './world-state-visibility.ts'
import { WORLD_STATE_TIMELINE_KEY, type WorldStateTimeline } from './world-state-timeline.ts'
import type {
  ProjectionsService,
  RuntimeFaces,
  SessionsService,
  WebServerService,
} from './host-faces.ts'
import { acceptsRrpWrites, face, queryOf, send } from './host-faces.ts'

const TAG = '[dsh-rrp]'

export function registerWorldStateTimelineRoute(ctx: Context): void {
  const runtime = ctx as unknown as RuntimeFaces
  const webServer = face<WebServerService>(runtime, 'webServer')
  const sessions = face<SessionsService>(runtime, 'sessions')
  const projections = face<ProjectionsService>(runtime, 'sessionProjections')
  if (webServer === undefined || sessions === undefined || projections === undefined) {
    console.warn(TAG + ' WorldState timeline route idle (missing host seam)')
    return
  }
  ctx.effect(() => {
    const dispose = webServer.register({
      kind: 'exact',
      path: RRP_ROUTES.worldStateTimeline,
      handler: async (req, res) => {
        if (req.method !== 'GET') {
          send(res, 405, { error: 'method not allowed' })
          return
        }
        const sessionId = queryOf(req)?.get('sessionId')
        if (sessionId === null || sessionId === undefined || sessionId.length === 0) {
          send(res, 400, { error: 'missing sessionId' })
          return
        }
        const session = sessions.get(sessionId)
        if (session === undefined) {
          send(res, 404, { error: 'unknown session' })
          return
        }
        if (!acceptsRrpWrites(projections, session)) {
          send(res, 403, { error: 'not an RP session' })
          return
        }
        const state = projections.stateOf(session, WORLD_STATE_KEY) as WorldState | undefined
        const timeline = projections.stateOf(session, WORLD_STATE_TIMELINE_KEY) as
          WorldStateTimeline | undefined
        if (state === undefined || timeline === undefined) {
          send(res, 200, { timeline: { version: 1, batches: [] } })
          return
        }
        const safeTimeline: WorldStateTimeline = {
          version: timeline.version,
          batches: timeline.batches.map((batch) => {
            if (batch.kind === 'baseline') return batch
            const changes = sanitizeWorldStateDiff({ changes: batch.changes }, state, state).changes
            const protectedChange = changes.some((change) => change.field === '不公开的世界信息')
            const provenance = {
              ...batch.provenance,
              ...(batch.provenance.evidence === undefined
                ? {}
                : {
                    evidence: protectedChange
                      ? '不公开的世界信息'
                      : sanitizePlayerText(batch.provenance.evidence, state),
                  }),
            }
            return { ...batch, provenance, changes }
          }),
        }
        send(res, 200, { timeline: safeTimeline })
      },
    })
    return dispose
  }, 'dsh-rrp: WorldState timeline route')
}
