/**
 * dsh-rrp — the worldline map route (issue #28).
 *
 * GET /dsh-rrp/worldlines/tree folds the WHOLE map server-side in one shot:
 * the host's live sessions (`sessions.list()` — exactly the sessions the
 * player can currently see loaded, and the only ones whose projections are
 * warm), each session's card ownership + turn digest, and the host's own
 * fork stamps for lineage. The client decorates node titles from its
 * session list and renders; it never fans out one request per session.
 *
 * POST/GET /dsh-rrp/worldlines/hidden serve the soft-archive ledger —
 * hiding prunes the map only, never the host session.
 */
import type { Context } from '@deepseek-ai/cordis'
import { CARD_KEY, type CardContext } from './card-types.ts'
import { RRP_ROUTES, type WorldlineTreeResponse } from './route-contract.ts'
import { WORLDLINE_DIGEST_KEY, type WorldlineDigest } from './worldline-digest.ts'
import { foldWorldlineTrees, type WorldlineSessionFact, type WorldlineTree } from './worldline-tree.ts'
import { openWorldlineStore, type WorldlineStoreHandle } from './worldline-store.ts'

const TAG = '[dsh-rrp]'
const TREE_PATH = RRP_ROUTES.worldlineTree
const HIDDEN_PATH = RRP_ROUTES.worldlineHidden

/**
 * Host session shape (verified against the host's own typert declaration,
 * issue #36): `inheritedEventCount` is a TOP-LEVEL Session property and
 * `parentSession` sits directly on the header — there is no `header.meta`
 * layer. Subagent children also carry `parentSession`, so they are filtered
 * out: worldlines come only from Session.fork (D9/D10).
 */
interface SessionLike {
  readonly id: string
  readonly inheritedEventCount?: number
  readonly header?: { parentSession?: string; origin?: string }
}
interface SessionsService {
  get(id: string): SessionLike | undefined
  list?(): SessionLike[]
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

/** Fold every live, card-owned session into the worldline forest. */
function collectFacts(sessions: SessionsService, projections: ProjectionsService): WorldlineSessionFact[] {
  const facts: WorldlineSessionFact[] = []
  for (const session of sessions.list?.() ?? []) {
    if (session.header?.origin === 'subagent') continue
    const card = projections.stateOf(session, CARD_KEY) as CardContext | null | undefined
    if (card === null || card === undefined || card.id.length === 0) continue
    const digest = (projections.stateOf(session, WORLDLINE_DIGEST_KEY) as WorldlineDigest | undefined) ?? { turns: [] }
    // The fork cut is stamped in EVENTS; the digest carries each turn's seq,
    // so seed turns are simply the folded turns before the cut.
    const inherited = Number(session.inheritedEventCount ?? 0)
    const seedTurns = digest.turns.filter((entry) => entry.seq < inherited).length
    const parentId = session.header?.parentSession
    facts.push({
      id: session.id,
      cardId: card.id,
      cardName: card.name,
      title: '',
      ...(parentId === undefined ? {} : { parentId }),
      seedTurns,
      turns: digest.turns.map((entry) => ({
        turn: entry.turn,
        seq: entry.seq,
        playerExcerpt: entry.player,
        proseExcerpt: entry.prose,
        ...(entry.badge === undefined ? {} : { badge: entry.badge }),
      })),
    })
  }
  return facts
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

    const disposeTree = webServer.register({
      kind: 'exact',
      path: TREE_PATH,
      handler: async (req, res) => {
        if (req.method !== undefined && req.method !== 'GET') {
          sendJson(res, 405, { error: 'method not allowed' })
          return
        }
        const store = await takeStore()
        if (store === undefined) {
          sendJson(res, 503, { error: 'worldline archive unavailable' })
          return
        }
        const trees: WorldlineTree[] = foldWorldlineTrees(collectFacts(sessions, projections), store.listHidden())
        const body: WorldlineTreeResponse = { trees }
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
          sendJson(res, 200, { hidden: store.listHidden() })
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

    console.log(TAG + ' worldline routes armed at ' + TREE_PATH + ' and ' + HIDDEN_PATH)
    return () => {
      disposed = true
      disposeTree()
      disposeHidden()
      void storeReady.then((h) => h.close()).catch(() => {})
    }
  }, 'dsh-rrp: worldline routes')
}
