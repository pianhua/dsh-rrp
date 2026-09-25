import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { recordActivity, renderActivityWorldStateDiff } from './activity.ts'
import { worldStateSchema } from './projection/world-state.ts'
import { publishState } from './state-publisher.ts'
import { WORLD_STATE_KEY, emptyWorldState, type WorldState } from './world-state.ts'
import {
  preparePlayerWorldState,
  type SafeWorldStateWriteResult,
} from './world-state-references.ts'
import { sanitizeWorldStateDiff } from './world-state-visibility.ts'
import { type WorldStateTimelineProvenance } from './world-state-timeline.ts'
import {
  type ProjectionsService,
  type RuntimeFaces,
  type SessionsService,
  type WebServerService,
  acceptsRrpWrites,
  face,
  nowIso,
  readJsonBody,
  send,
} from './host-faces.ts'
import { RRP_ROUTES, type CorrectionRequest, type CorrectionResponse } from './route-contract.ts'

const TAG = '[dsh-rrp]'
const CORRECTION_PATH = RRP_ROUTES.worldState

function parseRequest(body: Record<string, unknown>): CorrectionRequest | undefined {
  if (typeof body.sessionId !== 'string' || body.sessionId.length === 0) return undefined
  const state = worldStateSchema.safeParse(body.state)
  if (!state.success) return undefined
  return {
    sessionId: body.sessionId,
    state: state.data as WorldState,
    ...(body.preview === true ? { preview: true } : {}),
    ...(typeof body.evidence === 'string' ? { evidence: body.evidence } : {}),
    ...(Array.isArray(body.confirmDeleteIds)
      ? {
          confirmDeleteIds: body.confirmDeleteIds.filter(
            (id): id is string => typeof id === 'string',
          ),
        }
      : {}),
    ...(typeof body.storyTurn === 'number' &&
    Number.isInteger(body.storyTurn) &&
    body.storyTurn >= 0
      ? { storyTurn: body.storyTurn }
      : {}),
  }
}

function timelineProvenance(request: CorrectionRequest): WorldStateTimelineProvenance {
  return {
    actor: 'player',
    ...(request.storyTurn === undefined ? {} : { storyTurn: request.storyTurn }),
    at: nowIso(),
    ...(request.evidence === undefined || request.evidence.trim().length === 0
      ? {}
      : { evidence: request.evidence }),
  }
}

function responseForWrite(
  result: Extract<SafeWorldStateWriteResult, { ok: true }>,
  preview: boolean,
): CorrectionResponse {
  return {
    ok: true,
    ...(result.diff.changes.length === 0 ? { unchanged: true } : {}),
    ...(preview ? { preview: true } : {}),
    diff: result.diff,
    diagnostics: result.diagnostics,
  }
}

function errorForWrite(result: Exclude<SafeWorldStateWriteResult, { ok: true }>): {
  status: 400 | 403 | 409
  error: string
  details?: unknown
} {
  if (result.reason === 'hidden-content') return { status: 403, error: result.message }
  if (result.reason === 'references') {
    return {
      status: 409,
      error: result.message,
      details: { objectId: result.objectId, references: result.references },
    }
  }
  return { status: 400, error: result.message }
}

export function registerCorrectionRoute(ctx: Context): void {
  const runtime = ctx as unknown as RuntimeFaces
  const webServer = face<WebServerService>(runtime, 'webServer')
  const sessions = face<SessionsService>(runtime, 'sessions')
  const projections = face<ProjectionsService>(runtime, 'sessionProjections')
  if (webServer === undefined || sessions === undefined || projections === undefined) {
    console.warn(TAG + ' player correction idle (missing webServer/sessions/sessionProjections)')
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
        const result = await readJsonBody(req)
        if (!result.ok) {
          send(res, result.status, { error: result.error })
          return
        }
        if (typeof result.body.sessionId !== 'string' || result.body.sessionId.length === 0) {
          send(res, 400, { error: 'missing sessionId' })
          return
        }
        const request = parseRequest(result.body)
        if (request === undefined) {
          send(res, 400, { error: 'invalid WorldState' })
          return
        }
        const session = sessions.get(request.sessionId)
        if (session === undefined) {
          send(res, 404, { error: 'unknown session' })
          return
        }
        if (!acceptsRrpWrites(projections, session)) {
          send(res, 403, { error: 'not an RP session' })
          return
        }
        const prior =
          (projections.stateOf(session, WORLD_STATE_KEY) as WorldState | undefined) ??
          emptyWorldState()
        const prepared = preparePlayerWorldState(prior, request.state, request.confirmDeleteIds)
        if (!prepared.ok) {
          const failure = errorForWrite(prepared)
          send(res, failure.status, {
            error: failure.error,
            ...(failure.details === undefined ? {} : { details: failure.details }),
          })
          return
        }
        const response = responseForWrite(prepared, request.preview === true)
        if (request.preview === true || prepared.diff.changes.length === 0) {
          send(res, 200, response)
          return
        }
        const batch = {
          kind: 'changes' as const,
          changes: prepared.diff.changes,
          provenance: timelineProvenance(request),
          origin: 'local' as const,
        }
        if (
          !publishState(session, projections, {
            worldState: prepared.state,
            worldStateTimelineBatch: batch,
          })
        ) {
          send(res, 500, { error: 'WorldState write failed' })
          return
        }
        recordActivity(request.sessionId, {
          id: randomUUID(),
          at: nowIso(),
          actor: 'player',
          target: 'world-state',
          phase: 'corrected',
          detail: renderActivityWorldStateDiff(
            sanitizeWorldStateDiff(prepared.diff, prior, prepared.state),
          ),
        })
        console.log(TAG + ' player correction committed for session ' + request.sessionId)
        send(res, 200, response)
      },
    })
    console.log(TAG + ' player correction route armed at ' + CORRECTION_PATH)
    return dispose
  }, 'dsh-rrp: player correction route')
}
