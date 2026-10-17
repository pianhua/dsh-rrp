/**
 * tests/e2e/support/driver-plugin.mjs — the headless driver the playthrough spec steers by.
 *
 * Test scaffold, never production code: it only ADAPTS host services the composition already
 * has to small JSON routes, so the spec can create a Session, prompt it, and read projection
 * state without a browser and without reverse-engineering the host's RPC wire. The playthrough
 * itself (card start, Chronicler, lanes) runs entirely in the dsh-rrp plugin under test.
 *
 * Like the model stub, this deliberately does not import Cordis: exporting `inject` + `apply`
 * is the whole plugin contract, and it avoids a second Cordis instance in the host process.
 */

export const name = 'dsh-rrp-e2e-driver'
export const inject = [
  'webServer',
  'sessionController',
  'agentPresets',
  'agents',
  'sessions',
  'sessionProjections',
  'sessionQuery',
]

const TAG = '[dsh-rrp-e2e-driver]'

/**
 * The controller's remote-shaped methods expect the transport-injected AbortSignal as their
 * last argument; a direct in-process call must mint one. One minute dwarfs every e2e turn.
 */
const SIGNAL = () => AbortSignal.timeout(60_000)

/** The model-facing render of one WorldState-bearing facts-lane event lives outside the payload. */

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader?.('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function readJsonBody(req) {
  return new Promise((resolveRead, rejectRead) => {
    let text = ''
    req.on('data', (chunk) => {
      text += String(chunk)
      if (text.length > 4 * 1024 * 1024) rejectRead(new Error('request body exceeds 4MB'))
    })
    req.on('end', () => {
      try {
        resolveRead(JSON.parse(text))
      } catch {
        resolveRead(undefined)
      }
    })
    req.on('error', rejectRead)
  })
}

function queryOf(req) {
  if (req.url === undefined) return undefined
  try {
    return new URL(req.url, 'http://localhost').searchParams
  } catch {
    return undefined
  }
}

export function apply(ctx) {
  const webServer = ctx.webServer
  const sessionController = ctx.sessionController
  const agentPresets = ctx.agentPresets
  const agents = ctx.agents
  const sessions = ctx.sessions
  const sessionProjections = ctx.sessionProjections
  const sessionQuery = ctx.sessionQuery

  ctx.effect(() => {
    const disposers = [
      // Create one bare Session (the gallery's ctx.sessions.create step); the preset is
      // selected afterwards through /select, matching the production client order.
      webServer.register({
        kind: 'exact',
        path: '/dsh-rrp-e2e/session',
        handler: async (req, res) => {
          if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
          try {
            const created = await sessionController.create({}, SIGNAL())
            sendJson(res, 200, created)
          } catch (error) {
            sendJson(res, 500, { error: String(error) })
          }
        },
      }),
      // Select the card's RP preset the way the gallery does (remote.agentPresets.select).
      // Composition timing matters: the agent loop freezes its turn counter at COMPOSE time,
      // so selecting AFTER the card start route has written turns 1-2 is what keeps the log's
      // turn numbers sequential and cold-loadable (see the ticket 04 delivery notes).
      webServer.register({
        kind: 'exact',
        path: '/dsh-rrp-e2e/select',
        handler: async (req, res) => {
          if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
          const body = await readJsonBody(req)
          const { sessionId, presetId } = body ?? {}
          if (typeof sessionId !== 'string' || typeof presetId !== 'string') {
            return sendJson(res, 400, { error: 'missing sessionId/presetId' })
          }
          try {
            // In-process there is no remote lookup layer: resolve the live Agent ourselves
            // (the wire face would do exactly this from the sessionId).
            const agent = agents.get(sessionId)
            if (agent === undefined) return sendJson(res, 404, { error: 'agent not attached' })
            const selected = await agentPresets.select(agent, presetId)
            sendJson(res, 200, { ok: true, selected })
          } catch (error) {
            sendJson(res, 500, { error: String(error) })
          }
        },
      }),
      // One queued player prompt. requestId is client-minted and persisted on the accepted
      // user message — the spec mints it deterministically so reruns stay byte-comparable.
      webServer.register({
        kind: 'exact',
        path: '/dsh-rrp-e2e/prompt',
        handler: async (req, res) => {
          if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
          const body = await readJsonBody(req)
          const { sessionId, requestId, text } = body ?? {}
          if (
            typeof sessionId !== 'string' ||
            typeof requestId !== 'string' ||
            typeof text !== 'string' ||
            text.trim().length === 0
          ) {
            return sendJson(res, 400, { error: 'missing sessionId/requestId/text' })
          }
          try {
            const receipt = await sessionController.prompt(
              {
                requestId,
                sessionId,
                mode: 'queue',
                content: [{ type: 'text', text }],
              },
              SIGNAL(),
            )
            sendJson(res, 200, receipt)
          } catch (error) {
            sendJson(res, 500, { error: String(error) })
          }
        },
      }),
      // Durability checkpoint: the persistence layer buffers events; "落盘" assertions read
      // $DSH_HOME/sessions themselves, so the spec flushes the session before the disk fold.
      webServer.register({
        kind: 'exact',
        path: '/dsh-rrp-e2e/flush',
        handler: async (req, res) => {
          const sessionId = queryOf(req)?.get('sessionId') ?? ''
          const session = sessions.get(sessionId)
          if (session === undefined) return sendJson(res, 404, { error: 'session not attached' })
          try {
            const flushed = await sessions.flush(session)
            sendJson(res, 200, { flushed })
          } catch (error) {
            sendJson(res, 500, { error: String(error) })
          }
        },
      }),
      // Live projection read (session attached): raw host state per key, INCLUDING wire-less
      // units such as rrpTranscript that the controller's client snapshot omits. Never the
      // agent/status face — this is the durable fold state.
      webServer.register({
        kind: 'exact',
        path: '/dsh-rrp-e2e/projections',
        handler: (req, res) => {
          const sessionId = queryOf(req)?.get('sessionId') ?? ''
          const session = sessions.get(sessionId)
          if (session === undefined) return sendJson(res, 404, { error: 'session not attached' })
          const values = {}
          for (const key of ['rrpWorldState', 'rrpWorldStateTimeline', 'rrpTranscript']) {
            try {
              values[key] = sessionProjections.stateOf(session, key)
            } catch (error) {
              return sendJson(res, 500, { error: `projection ${key}: ${String(error)}` })
            }
          }
          sendJson(res, 200, { values })
        },
      }),
      // Cold read through the host's own replay path: observeSession loads the persisted log,
      // hydrates every registered projection host-side, and hands back the raw events. The
      // spec folds them independently (its foldEvents) and compares with the live phase —
      // restart-does-not-lose on the data plane. 404 maps SESSION_QUERY_SESSION_NOT_FOUND.
      webServer.register({
        kind: 'exact',
        path: '/dsh-rrp-e2e/observed-events',
        handler: async (req, res) => {
          const sessionId = queryOf(req)?.get('sessionId') ?? ''
          if (sessionId.length === 0) return sendJson(res, 400, { error: 'missing sessionId' })
          let lease
          try {
            lease = await sessionQuery.observeSession(sessionId)
          } catch (error) {
            const notFound = /not found/.test(String(error))
            return sendJson(res, notFound ? 404 : 500, { error: String(error) })
          }
          try {
            sendJson(res, 200, {
              cursor: lease.cursor,
              revision: lease.revision,
              header: lease.header,
              projections: lease.projections ?? null,
              events: lease.events,
            })
          } finally {
            lease[Symbol.dispose]()
          }
        },
      }),
    ]
    console.log(TAG + ' routes armed')
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'dsh-rrp-e2e-driver: routes')
}
