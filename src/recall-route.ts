/**
 * dsh-rrp — the history recall route and tool (issue #38).
 *
 * Exposes active 2-stage progressive disclosure recall:
 * - HTTP route: POST /dsh-rrp/recall
 * - Host tool (if ctx.tools is present): rrp_recall_history
 */
import type { Context } from '@deepseek-ai/cordis'
import {
  RECALL_TOOL_DEFINITION,
  extractRecallRounds,
  recallCooldownsOf,
  recallHistory,
  recallScopeOf,
  renderRecall,
  setRecallCooldowns,
  type RecallRound,
} from './recall.ts'
import { RRP_ROUTES } from './route-contract.ts'
import { WORLDLINE_DIGEST_KEY, type WorldlineDigest } from './worldline-digest.ts'
import {
  type ProjectionsService,
  type RequestLike,
  type ResponseLike,
  type RuntimeFaces,
  type SessionLike,
  type SessionsService,
  acceptsRrpWrites,
  face,
  readJsonBody,
  send,
} from './host-faces.ts'

const TAG = '[dsh-rrp]'
const RECALL_PATH = RRP_ROUTES.recall

interface ReadHandleLike {
  read(offset?: number, length?: number): Promise<{ events: readonly unknown[] }>
  close(): Promise<void>
}

interface PersistenceService {
  open(id: string, access: 'read'): Promise<ReadHandleLike>
}

interface WebServerService {
  register(route: {
    kind?: 'exact'
    path: string
    handler: (req: RequestLike, res: ResponseLike) => void | Promise<void>
  }): () => void
}

interface ToolsService {
  register(tool: unknown): () => void
}

export async function fetchSessionRounds(
  sessionId: string,
  session: SessionLike | undefined,
  projections: ProjectionsService | undefined,
  persistence: PersistenceService | undefined,
): Promise<RecallRound[]> {
  if (persistence !== undefined) {
    try {
      const handle = await persistence.open(sessionId, 'read')
      try {
        const { events } = await handle.read()
        return extractRecallRounds(events as never[])
      } finally {
        await handle.close()
      }
    } catch {
      // Degrade to projection
    }
  }

  if (session !== undefined && projections !== undefined) {
    try {
      const digest = projections.stateOf(session, WORLDLINE_DIGEST_KEY) as
        WorldlineDigest | undefined
      if (digest && Array.isArray(digest.turns)) {
        return digest.turns.map((t) => ({
          turn: t.turn,
          player: t.player,
          prose: t.prose,
        }))
      }
    } catch {
      // Degrade
    }
  }

  return []
}

export function registerRecallRoute(ctx: Context): void {
  const runtime = ctx as unknown as RuntimeFaces
  const webServer = runtime.get('webServer') as WebServerService | undefined
  const sessions = face<SessionsService>(runtime, 'sessions')
  const projections = face<ProjectionsService>(runtime, 'sessionProjections')
  const persistence = face<PersistenceService>(runtime, 'sessionPersistence')
  const tools = face<ToolsService>(runtime, 'tools')

  if (webServer === undefined && tools === undefined) {
    console.warn(TAG + ' recall route idle (missing webServer and tools)')
    return
  }

  type RecallOutcome =
    | {
        ok: true
        status: 200
        body: {
          ok: true
          notice: string
          found: boolean
          mode: 'search' | 'read'
          query: string
          requestedTurn: number
          matches: Array<{ turn: number; excerpt: string }>
          rounds: Array<{ turn: number; player: string; prose: string }>
          rendered: string
        }
      }
    | {
        ok: false
        status: 400 | 403 | 404
        error: string
      }

  const executeRecall = async (
    sessionId: string,
    args: { query?: string; turn?: number; radius?: number; limit?: number },
  ): Promise<RecallOutcome> => {
    const session = sessions?.get(sessionId)
    if (session === undefined) {
      return { ok: false, status: 404, error: 'unknown session' }
    }
    if (projections !== undefined && !acceptsRrpWrites(projections, session)) {
      return { ok: false, status: 403, error: 'not an RP session' }
    }

    const rounds = await fetchSessionRounds(sessionId, session, projections, persistence)
    const scope = recallScopeOf(sessionId)
    const cooldowns = recallCooldownsOf(sessionId)

    const result = recallHistory({
      rounds,
      query: args.query,
      turn: args.turn,
      radius: args.radius,
      limit: args.limit,
      scope,
      cooldowns,
      trackCooldown: true,
    })

    if (result.newCooldowns) {
      setRecallCooldowns(sessionId, result.newCooldowns)
    }

    const rendered = renderRecall(result)
    return {
      ok: true,
      status: 200,
      body: {
        ok: true,
        notice: result.notice,
        found: result.found,
        mode: result.mode,
        query: result.query,
        requestedTurn: result.requestedTurn,
        matches: result.matches,
        rounds: result.rounds,
        rendered,
      },
    }
  }

  ctx.effect(() => {
    const disposers: Array<() => void> = []

    if (webServer !== undefined) {
      disposers.push(
        webServer.register({
          kind: 'exact',
          path: RECALL_PATH,
          handler: async (req, res) => {
            if (req.method !== 'POST') {
              send(res, 405, { error: 'method not allowed' })
              return
            }
            const parsed = await readJsonBody(req)
            if (!parsed.ok) {
              send(res, parsed.status, { error: parsed.error })
              return
            }
            const body = parsed.body as Record<string, unknown>
            const sessionId = body.sessionId
            if (typeof sessionId !== 'string' || sessionId.length === 0) {
              send(res, 400, { error: 'missing sessionId' })
              return
            }

            try {
              const outcome = await executeRecall(sessionId, {
                query: typeof body.query === 'string' ? body.query : undefined,
                turn: typeof body.turn === 'number' ? body.turn : undefined,
                radius: typeof body.radius === 'number' ? body.radius : undefined,
                limit: typeof body.limit === 'number' ? body.limit : undefined,
              })

              if (!outcome.ok) {
                send(res, outcome.status, { error: outcome.error })
              } else {
                send(res, 200, outcome.body)
              }
            } catch (error) {
              send(res, 400, { error: error instanceof Error ? error.message : String(error) })
            }
          },
        }),
      )
    }

    if (tools !== undefined) {
      disposers.push(
        tools.register({
          ...RECALL_TOOL_DEFINITION,
          output: {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: { report: { type: 'string', required: true } },
            },
            render: (_args: unknown, value: { report: string }) => [
              { type: 'text', text: value.report },
            ],
          },
          isConcurrencySafe: () => true,
          execute: async (
            args: { query?: string; turn?: number; radius?: number; limit?: number },
            exec: { agent?: { session?: { id?: string } } },
          ) => {
            const sessionId = exec?.agent?.session?.id || ''
            if (!sessionId) {
              return { report: '【历史回忆资料】\n错误：缺少会话 ID' }
            }
            try {
              const outcome = await executeRecall(sessionId, args)
              if (!outcome.ok) {
                return { report: '【历史回忆资料】\n' + outcome.error }
              }
              return { report: outcome.body.rendered }
            } catch (error) {
              return {
                report:
                  '【历史回忆资料】\n' + (error instanceof Error ? error.message : String(error)),
              }
            }
          },
        }),
      )
    }

    return () => {
      while (disposers.length > 0) disposers.pop()?.()
    }
  }, 'dsh-rrp: recall route & tool')
}
