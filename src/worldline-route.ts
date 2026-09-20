/**
 * dsh-rrp — the worldline map route (issue #28, cold skeletons issue #29).
 *
 * GET /dsh-rrp/worldlines/tree folds the WHOLE map server-side in one shot:
 * the host's live sessions (`sessions.list()` — exactly the sessions the
 * player can currently see loaded, and the only ones whose projections are
 * warm), each session's card ownership + turn digest, and the host's own
 * fork stamps for lineage. On top of that, the host's session-query service
 * contributes COLD skeleton facts for persisted-but-unloaded RP sessions
 * (issue #29): lineage + title only, no turn digests — the fold renders them
 * as 「（未加载）」 placeholders so a cold start shows the whole forest, not
 * just the desk. The client decorates node titles from its session list and
 * renders; it never fans out one request per session.
 *
 * POST/GET /dsh-rrp/worldlines/hidden serve the soft-archive ledger —
 * hiding prunes the map only, never the host session.
 */
import type { Context } from '@deepseek-ai/cordis'
import { CARD_KEY, type CardContext } from './card-types.ts'
import { listCards } from './cards.ts'
import {
  type ProjectionsService,
  type RequestLike,
  type ResponseLike,
  type RuntimeFaces,
  type SessionLike,
  type SessionsService,
  type WebServerService,
  face,
  readJsonBody,
  send,
} from './host-faces.ts'
import { cardIdFromPreset } from './preset-id.ts'
import { RRP_ROUTES, type WorldlineTreeResponse } from './route-contract.ts'
import { WORLDLINE_DIGEST_KEY, type WorldlineDigest } from './worldline-digest.ts'
import { foldWorldlineTrees, type WorldlineSessionFact, type WorldlineTree } from './worldline-tree.ts'
import { openWorldlineStore, type WorldlineStoreHandle } from './worldline-store.ts'

const TAG = '[dsh-rrp]'
const TREE_PATH = RRP_ROUTES.worldlineTree
const HIDDEN_PATH = RRP_ROUTES.worldlineHidden

/**
 * Host session shape the map needs (verified against the host's own typert
 * declaration, issue #36): `inheritedEventCount` is a TOP-LEVEL Session
 * property and `parentSession` sits directly on the header — there is no
 * `header.meta` layer. Subagent children also carry `parentSession`, so they
 * are filtered out: worldlines come only from Session.fork (D9/D10).
 */
interface WorldlineSession extends SessionLike {
  readonly inheritedEventCount?: number
  readonly header?: { parentSession?: string; origin?: string }
}
interface WorldlineSessions extends SessionsService {
  list?(): WorldlineSession[]
}
/**
 * Host session-query service (issue #29): lists persisted sessions WITHOUT
 * loading them and reads their titles cold. Structural face only — the same
 * `ctx.get(name)` discipline as every other host seam. Absent (profile
 * without session-query) = graceful live-only degradation, never an error.
 */
interface SessionQueryService {
  listSessions(): Promise<Array<{ header: SessionQueryHeader }>>
  readTitleSnapshots(ids: string[]): Promise<Array<{ status: string; value?: { title?: { title?: string } } }>>
}
interface SessionQueryHeader {
  readonly id?: string
  readonly parentSession?: string
  readonly origin?: string
  readonly agentPreset?: string
}

/** Fold every live, card-owned session into the worldline forest. */
function collectFacts(sessions: WorldlineSessions, projections: ProjectionsService): WorldlineSessionFact[] {
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
 * Cold skeleton facts (issue #29): persisted-but-unloaded RP sessions, from
 * the host's session-query service. Card ownership comes from the preset id
 * (`rp-<cardId>`, the same rule the preset materializer uses); the title is
 * read cold via readTitleSnapshots — no session is loaded, no log is parsed.
 * Unknown cards fall back to their id as the display name (the pack may have
 * been deleted; the line itself is still real).
 */
async function collectSkeletonFacts(query: SessionQueryService, live: readonly WorldlineSessionFact[]): Promise<WorldlineSessionFact[]> {
  const liveIds = new Set(live.map((fact) => fact.id))
  const records = await query.listSessions()
  const cold = records.filter((record) => {
    const header = record.header
    if (header === undefined || header.id === undefined || liveIds.has(header.id)) return false
    if (header.origin === 'subagent') return false
    return cardIdFromPreset(header.agentPreset) !== undefined
  })
  if (cold.length === 0) return []

  const titles = new Map<string, string>()
  const snapshots = await query.readTitleSnapshots(cold.map((record) => record.header.id as string))
  for (const snapshot of snapshots) {
    if (snapshot.status === 'fulfilled' && snapshot.value?.title?.title !== undefined) {
      const id = (snapshot.value as { session?: { id?: string } }).session?.id
      if (id !== undefined) titles.set(id, snapshot.value.title.title)
    }
  }
  const names = new Map(listCards().map((card) => [card.id, card.name]))

  const facts: WorldlineSessionFact[] = []
  for (const record of cold) {
    const header = record.header
    const cardId = cardIdFromPreset(header.agentPreset)
    if (cardId === undefined) continue
    facts.push({
      id: header.id as string,
      cardId,
      cardName: names.get(cardId) ?? cardId,
      title: titles.get(header.id as string) ?? '',
      ...(header.parentSession === undefined ? {} : { parentId: header.parentSession }),
      stub: true,
      turns: [],
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
  const webServer = face<WebServerService>(runtime, 'webServer')
  const sessions = face<WorldlineSessions>(runtime, 'sessions')
  const projections = face<ProjectionsService>(runtime, 'sessionProjections')
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
          send(res, 405, { error: 'method not allowed' })
          return
        }
        const store = await takeStore()
        if (store === undefined) {
          send(res, 503, { error: 'worldline archive unavailable' })
          return
        }
        const liveFacts = collectFacts(sessions, projections)
        // Cold skeletons are a map-completeness nicety, never a failure mode:
        // a missing or failing session-query degrades to the live-only map.
        const query = face<SessionQueryService>(runtime, 'sessionQuery')
        let facts = liveFacts
        if (query !== undefined) {
          try {
            facts = [...liveFacts, ...await collectSkeletonFacts(query, liveFacts)]
          } catch (cause) {
            console.warn(TAG + ' worldline cold skeletons unavailable: ' + String(cause))
          }
        }
        const trees: WorldlineTree[] = foldWorldlineTrees(facts, store.listHidden())
        const body: WorldlineTreeResponse = { trees }
        send(res, 200, body)
      },
    })

    const disposeHidden = webServer.register({
      kind: 'exact',
      path: HIDDEN_PATH,
      handler: async (req, res) => {
        const store = await takeStore()
        if (store === undefined) {
          send(res, 503, { error: 'worldline archive unavailable' })
          return
        }
        if (req.method === 'GET') {
          send(res, 200, { hidden: store.listHidden() })
          return
        }
        if (req.method !== 'POST') {
          send(res, 405, { error: 'method not allowed' })
          return
        }
        const request = await readJsonBody(req)
        if (request === undefined) {
          send(res, 400, { error: 'invalid JSON body' })
          return
        }
        if (typeof request.sessionId !== 'string' || request.sessionId.length === 0 || typeof request.hidden !== 'boolean') {
          send(res, 400, { error: 'missing sessionId/hidden' })
          return
        }
        await store.setHidden(request.sessionId, request.hidden)
        send(res, 200, { ok: true })
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
