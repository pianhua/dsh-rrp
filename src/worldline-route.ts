/**
 * dsh-rrp — the worldline map read/write routes (issue #28).
 *
 * Two small endpoints feed the save map: per-session turn FACTS (digest +
 * seed-turn conversion, so the client can fold the tree with the host's own
 * lineage and never scan logs), and the soft-hide ledger. The tree fold
 * itself lives client-side (src/worldline-tree.ts is shared vocabulary);
 * lineage (parentId/title) comes from the host's own sessions list, which
 * is the most Host-First source there is.
 */
import type { Context } from '@deepseek-ai/cordis'
import { CARD_KEY, type CardContext } from './card-types.ts'
import { belongsToRpPreset } from './preset-id.ts'
import { RRP_ROUTES, type WorldlineFactsResponse, type WorldlineHiddenResponse } from './route-contract.ts'
import { WORLDLINE_DIGEST_KEY, type WorldlineDigest } from './worldline-digest.ts'
import { openWorldlineStore, type WorldlineStoreHandle } from './worldline-store.ts'

const TAG = '[dsh-rrp]'
const FACTS_PATH = RRP_ROUTES.worldlineFacts
const HIDDEN_PATH = RRP_ROUTES.worldlineHidden

interface SessionLike {
  readonly id: string
  readonly header?: { inheritedEventCount?: number; meta?: { parentSession?: string } }
}
interface SessionsService {
  get(id: string): SessionLike | undefined
}
interface ProjectionsService {
  stateOf(session: unknown, key: string): unknown
}
interface RequestLike {
  method?: string
  url?: string
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

function sendJson(res: ResponseLike, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader?.('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

async function readBody(req: RequestLike): Promise<string> {
  let text = ''
  for await (const chunk of req) {
    text += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
  }
  return text
}

/** RP-family guard shared with every write/read lane; unknown presets pass. */
function rpSession(projections: ProjectionsService, session: SessionLike): boolean {
  const preset = projections.stateOf(session, 'agentPreset')
  return typeof preset !== 'string' || belongsToRpPreset(preset)
}

/**
 * Register the worldline routes.
 * @param ctx - the host context owning the registration.
 */
export function registerWorldlineRoute(ctx: Context): void {
  const runtime = ctx as unknown as RuntimeFaces
  const webServer = runtime.get('webServer') as WebServerService | undefined
  const sessions = runtime.get('sessions') as SessionsService | undefined
  const projections = runtime.get('sessionProjections') as ProjectionsService | undefined
  if (webServer === undefined || sessions === undefined || projections === undefined) {
    console.warn(TAG + ' worldline route idle (missing webServer/sessions/sessionProjections)')
    return
  }

  ctx.effect(() => {
    let disposed = false
    const storeReady = openWorldlineStore((name) => runtime.get(name)).then(({ handle }) => {
      if (disposed) {
        void handle.close()
        throw new Error('worldline store disposed before open')
      }
      return handle
    })
    const takeStore = async (): Promise<WorldlineStoreHandle | undefined> => {
      try {
        return await storeReady
      } catch {
        return undefined
      }
    }

    const disposeFacts = webServer.register({
      kind: 'exact',
      path: FACTS_PATH,
      handler: (req, res) => {
        if (req.method !== undefined && req.method !== 'GET') {
          sendJson(res, 405, { error: 'method not allowed' })
          return
        }
        const sessionId = new URL(req.url ?? '', 'http://localhost').searchParams.get('sessionId') ?? ''
        const session = sessions.get(sessionId)
        if (session === undefined) {
          sendJson(res, 404, { error: 'unknown session' })
          return
        }
        if (!rpSession(projections, session)) {
          sendJson(res, 403, { error: 'not an RP session' })
          return
        }
        const card = projections.stateOf(session, CARD_KEY) as CardContext | null | undefined
        const digest = (projections.stateOf(session, WORLDLINE_DIGEST_KEY) as WorldlineDigest | undefined) ?? { turns: [] }
        // The host stamps the inherited prefix in EVENTS; the digest carries
        // each turn's seq, so seed turns are simply the turns before the cut.
        const inherited = Number(session.header?.inheritedEventCount ?? 0)
        const seedTurns = digest.turns.filter((entry) => entry.seq < inherited).length
        const body: WorldlineFactsResponse = {
          cardId: card?.id ?? '',
          cardName: card?.name ?? '',
          seedTurns,
          turns: digest.turns,
        }
        sendJson(res, 200, body)
      },
    })

    const disposeHidden = webServer.register({
      kind: 'exact',
      path: HIDDEN_PATH,
      handler: async (req, res) => {
        const store = await takeStore()
        if (store === undefined) {
          sendJson(res, 503, { error: 'worldline archive unavailable' })
          return
        }
        if (req.method === 'GET') {
          const body: WorldlineHiddenResponse = { hidden: store.listHidden() }
          sendJson(res, 200, body)
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'method not allowed' })
          return
        }
        let parsed: unknown
        try {
          parsed = JSON.parse(await readBody(req))
        } catch {
          sendJson(res, 400, { error: 'invalid JSON body' })
          return
        }
        const request = parsed as { sessionId?: unknown; hidden?: unknown }
        if (typeof request.sessionId !== 'string' || request.sessionId.length === 0 || typeof request.hidden !== 'boolean') {
          sendJson(res, 400, { error: 'missing sessionId/hidden' })
          return
        }
        await store.setHidden(request.sessionId, request.hidden)
        sendJson(res, 200, { ok: true })
      },
    })

    console.log(TAG + ' worldline routes armed at ' + FACTS_PATH + ' and ' + HIDDEN_PATH)
    return () => {
      disposed = true
      disposeFacts()
      disposeHidden()
      void storeReady.then((h) => h.close()).catch(() => {})
    }
  }, 'dsh-rrp: worldline routes')
}
