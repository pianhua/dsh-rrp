/**
 * dsh-rrp — knowledge-lore routes (D8).
 *
 * The panel drives the whole controlled flow:
 *   GET    /dsh-rrp/lore?sessionId=            list + pending draft
 *   POST   /dsh-rrp/lore  { action:'draft' }   schedule the Scribe
 *   POST   /dsh-rrp/lore  { action:'confirm' } write the pending draft
 *   POST   /dsh-rrp/lore  { action:'discard' } drop the pending draft
 *   POST   /dsh-rrp/lore  { action:'manual', draft } write one directly
 *   DELETE /dsh-rrp/lore?sessionId=&name=      remove one
 *
 * Nothing is committed without an explicit player action; the Scribe only
 * STAGES a draft. Confirmed changes append to the owning Session and fold
 * through `rrpSediment`, so native forks inherit their event prefix.
 */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { recordActivity } from './activity.ts'
import { CARD_KEY, renderCardContext, type CardContext } from './card-types.ts'
import { readCard, triggersOfCard } from './cards.ts'
import {
  type AgentsService,
  type CommandsService,
  type JobsService,
  type LlmService,
  type ProjectionsService,
  type ProviderRoute,
  type RuntimeFaces,
  type SessionLike,
  type SessionsService,
  type WebServerService,
  collectText,
  face,
  isEmptyReply,
  messageOf,
  nowIso,
  queryOf,
  readJsonBody,
  acceptsRrpWrites,
  routeOf,
  send,
  sessionIdOf,
} from './host-faces.ts'
import { ensureLoreArmed, invalidateLore } from './lore-runtime.ts'
import { RRP_LORE_KEY, loreEntriesOf, validateLoreEntry, type LoreEntry } from './lore-state.ts'
import { RRP_ROUTES, type LoreEntryView } from './route-contract.ts'
import { SCRIBE_SYSTEM_PROMPT, buildScribePrompt, parseScribeReply } from './agents/scribe.ts'
import { evalCondition, hitSet } from './lore-condition.ts'
import { publishState } from './state-publisher.ts'
import { transcriptOf } from './transcript-reader.ts'
import { WORLD_STATE_KEY, renderWorldState, type WorldState } from './world-state.ts'

const TAG = '[dsh-rrp]'
const LORE_PATH = RRP_ROUTES.lore

import {
  PENDING,
  DRAFTING,
  forgetLore,
  forgetAllLore,
  hasLoreDraft,
  stageLoreDraftForTesting,
} from './lore-drafts.ts'

export { forgetLore, forgetAllLore, hasLoreDraft, stageLoreDraftForTesting }

/**
 * Stage an externally composed draft (the Copilot's draft_lore action).
 * The player still confirms it in the 「设定集」 panel before anything is
 * written — the D8 control ring is never bypassed.
 */
export function stageLoreDraft(sessionId: string, entry: LoreEntry): void {
  PENDING.set(sessionId, entry)
  invalidateLore(sessionId)
}

/** The active card's bundled skill names, so lore cannot take their names. */
export function reservedNames(
  projections: ProjectionsService | undefined,
  session: SessionLike,
): string[] {
  if (projections === undefined) return []
  const card = projections.stateOf(session, CARD_KEY) as CardContext | null | undefined
  if (card === null || card === undefined) return []
  const pack = readCard(card.id)
  if (pack === undefined) return []
  return pack.skills.map((skill) => skill.name ?? skill.id).filter((name) => name.length > 0)
}

/** Current dynamic lore for exactly this Session/worldline. */
function currentLore(projections: ProjectionsService, session: SessionLike): LoreEntry[] {
  return loreEntriesOf(projections.stateOf(session, RRP_LORE_KEY))
}

/** Player-facing list row; bodies remain in the Skill provider, not this view. */
function loreView(skill: LoreEntry): LoreEntryView {
  return {
    name: skill.name,
    description: skill.description,
    bytes: Buffer.byteLength(skill.body, 'utf8'),
  }
}

/**
 * Conditional-injection view (issue #16): every trigger of the session's card
 * evaluated against the current state, plus the hit set's total injected
 * characters. No card / no state → empty view, never an error.
 */
function triggerView(
  projections: ProjectionsService,
  session: SessionLike,
): { triggers: Array<{ name: string; active: boolean }>; injectedChars: number } {
  const card = projections.stateOf(session, CARD_KEY) as CardContext | null | undefined
  const state = projections.stateOf(session, WORLD_STATE_KEY) as WorldState | undefined
  if (card === null || card === undefined || state === undefined) {
    return { triggers: [], injectedChars: 0 }
  }
  const triggers = triggersOfCard(card.id)
  return {
    triggers: triggers.map((def) => ({
      name: def.name,
      active: evalCondition(def.condition, state),
    })),
    injectedChars: hitSet(triggers, state).reduce((sum, hit) => sum + hit.excerpt.length, 0),
  }
}

/** The material handed to the Scribe. */
interface ScribeFaces {
  llm: LlmService
  jobs: JobsService
  agents: AgentsService
  projections: ProjectionsService
}

/** Schedule one Scribe pass. Never throws into the route. */
function scheduleDraft(faces: ScribeFaces, session: SessionLike, topic: string): void {
  if (DRAFTING.has(session.id)) return
  const route = routeOf(faces.agents, session.id)
  if (route === undefined) {
    console.warn(TAG + ' Scribe skipped ' + session.id + ': no provider/model route')
    return
  }
  DRAFTING.add(session.id)
  const activityId = randomUUID()
  recordActivity(session.id, {
    id: activityId,
    at: nowIso(),
    actor: 'scribe',
    target: 'lore',
    phase: 'started',
  })
  const owner = faces.agents.get(session.id)
  try {
    faces.jobs.start({
      kind: 'scribe',
      label: '知识起草 Scribe · ' + session.id.slice(0, 8),
      ...(owner === undefined ? {} : { owner }),
      run: () => {
        const controller = new AbortController()
        let cancelled = false
        const done = runDraft(
          faces,
          session,
          route,
          topic,
          activityId,
          controller.signal,
          () => cancelled,
        )
        return {
          cancel: () => {
            cancelled = true
            controller.abort()
          },
          done,
        }
      },
    })
  } catch (error) {
    DRAFTING.delete(session.id)
    console.warn(TAG + ' Scribe could not start a job:', error)
  }
}

/** One Scribe pass: prompt -> model -> parse -> stage (never write). */
async function runDraft(
  faces: ScribeFaces,
  session: SessionLike,
  route: ProviderRoute,
  topic: string,
  activityId: string,
  signal: AbortSignal,
  isCancelled: () => boolean,
): Promise<{ status: string }> {
  try {
    const state = faces.projections.stateOf(session, WORLD_STATE_KEY) as WorldState | undefined
    const worldState = state === undefined ? '（暂无状态）' : renderWorldState(state)
    const card = faces.projections.stateOf(session, CARD_KEY) as CardContext | null | undefined
    const cardBaseline = card === null || card === undefined ? '' : renderCardContext(card)
    const existing = [
      ...reservedNames(faces.projections, session),
      ...currentLore(faces.projections, session).map((skill) => skill.name),
    ]
    const transcript = transcriptOf(faces.projections, session)
    if (isEmptyReply(transcript)) {
      recordActivity(session.id, {
        id: activityId,
        at: nowIso(),
        actor: 'scribe',
        target: 'lore',
        phase: 'failed',
        detailKey: 'detail.noTranscript',
      })
      return { status: 'completed' }
    }

    const stream = faces.llm.stream({
      provider: route.provider,
      model: route.model,
      system: SCRIBE_SYSTEM_PROMPT,
      messages: [
        {
          id: randomUUID(),
          role: 'user',
          content: [
            {
              type: 'text',
              text: buildScribePrompt({ topic, transcript, worldState, cardBaseline, existing }),
            },
          ],
          source: { kind: 'plugin', plugin: 'dsh-rrp' },
        },
      ],
      sessionId: session.id,
      signal,
    })
    const text = await collectText(stream)
    if (isCancelled()) {
      recordActivity(session.id, {
        id: activityId,
        at: nowIso(),
        actor: 'scribe',
        target: 'lore',
        phase: 'failed',
        detailKey: 'detail.cancelled',
      })
      return { status: 'killed' }
    }
    // An empty stream is an infrastructure failure, NOT a "nothing to lore"
    // verdict — conflating them hid a silent-empty epidemic behind the
    // 「目前没有待确认草稿」message (same pathology the copilot route had).
    if (isEmptyReply(text)) {
      console.warn(
        TAG +
          ' Scribe EMPTY reply for ' +
          session.id +
          ' (treated as failure, not nothing-to-lore)',
      )
      recordActivity(session.id, {
        id: activityId,
        at: nowIso(),
        actor: 'scribe',
        target: 'lore',
        phase: 'failed',
        detailKey: 'detail.emptyReply',
      })
      return { status: 'failed' }
    }
    const draft = parseScribeReply(text)
    if (draft === undefined) {
      recordActivity(session.id, {
        id: activityId,
        at: nowIso(),
        actor: 'scribe',
        target: 'lore',
        phase: 'failed',
        detailKey: 'detail.nothingToLore',
      })
      return { status: 'completed' }
    }
    PENDING.set(session.id, draft)
    recordActivity(session.id, {
      id: activityId,
      at: nowIso(),
      actor: 'scribe',
      target: 'lore',
      phase: 'committed',
      detailKey: 'detail.stagedDraft',
      detailName: draft.name,
    })
    console.log(TAG + ' Scribe staged a draft for ' + session.id + ': ' + draft.name)
    return { status: 'completed' }
  } catch (error) {
    recordActivity(session.id, {
      id: activityId,
      at: nowIso(),
      actor: 'scribe',
      target: 'lore',
      phase: 'failed',
      ...(isCancelled() ? { detailKey: 'detail.cancelled' } : { detail: messageOf(error) }),
    })
    return { status: isCancelled() ? 'killed' : 'failed' }
  } finally {
    DRAFTING.delete(session.id)
  }
}

/**
 * Register the lore routes.
 * @param ctx - the host context owning the registration.
 */
export function registerLoreRoute(ctx: Context): void {
  const runtime = ctx as unknown as RuntimeFaces
  const webServer = face<WebServerService>(runtime, 'webServer')
  const sessions = face<SessionsService>(runtime, 'sessions')
  const projections = face<ProjectionsService>(runtime, 'sessionProjections')
  if (webServer === undefined || sessions === undefined || projections === undefined) {
    console.warn(TAG + ' lore route idle (missing webServer/sessions/sessionProjections)')
    return
  }
  const agents = face<AgentsService>(runtime, 'agents')
  const llm = face<LlmService>(runtime, 'llm')
  const jobs = face<JobsService>(runtime, 'jobs')
  const faces: ScribeFaces | undefined =
    llm === undefined || jobs === undefined || agents === undefined
      ? undefined
      : { llm, jobs, agents, projections }

  ctx.effect(() => {
    const dispose = webServer.register({
      kind: 'exact',
      path: LORE_PATH,
      handler: async (req, res) => {
        const body = req.method === 'POST' ? await readJsonBody(req) : undefined
        if (req.method === 'POST' && body === undefined) {
          send(res, 400, { error: 'invalid JSON body' })
          return
        }
        const sessionId = sessionIdOf(queryOf(req), body)
        if (sessionId.length === 0) {
          send(res, 400, { error: 'missing sessionId' })
          return
        }
        const session = sessions.get(sessionId)
        if (session === undefined) {
          send(res, 404, { error: 'unknown session' })
          return
        }
        // Same write-path guard as the player-correction route.
        if (!acceptsRrpWrites(projections, session)) {
          send(res, 403, { error: 'not an RP session' })
          return
        }
        ensureLoreArmed(ctx, sessionId)

        try {
          if (req.method === 'GET') {
            send(res, 200, {
              skills: currentLore(projections, session).map(loreView),
              pending: PENDING.get(sessionId) ?? null,
              drafting: DRAFTING.has(sessionId),
              ...triggerView(projections, session),
            })
            return
          }

          if (req.method === 'DELETE') {
            const name = queryOf(req)?.get('name') ?? ''
            const exists = currentLore(projections, session).some((skill) => skill.name === name)
            if (!exists) {
              send(res, 404, { ok: false, removed: false })
              return
            }
            const published = publishState(session, projections, {
              sediment: { kind: 'remove', name },
            })
            if (!published) {
              send(res, 500, { error: '设定集事件写入失败' })
              return
            }
            invalidateLore(sessionId)
            send(res, 200, { ok: true, removed: true })
            return
          }

          if (req.method !== 'POST') {
            send(res, 405, { error: 'method not allowed' })
            return
          }

          const request = body ?? {}
          const action = typeof request.action === 'string' ? request.action : ''

          if (action === 'draft') {
            if (faces === undefined) {
              send(res, 503, { error: 'scribe unavailable' })
              return
            }
            const topic = typeof request.topic === 'string' ? request.topic : ''
            scheduleDraft(faces, session, topic)
            send(res, 200, { ok: true, drafting: DRAFTING.has(sessionId) })
            return
          }

          if (action === 'discard') {
            PENDING.delete(sessionId)
            send(res, 200, { ok: true })
            return
          }

          if (action === 'confirm' || action === 'manual') {
            const candidate = (request.draft ?? PENDING.get(sessionId)) as
              Partial<LoreEntry> | undefined
            if (candidate === undefined || candidate === null) {
              send(res, 400, { error: '没有待确认的草稿' })
              return
            }
            const existing = currentLore(projections, session)
            const result = validateLoreEntry(
              candidate,
              existing.map((skill) => skill.name),
              reservedNames(projections, session),
            )
            if (!result.ok) {
              send(res, 400, { error: result.error })
              return
            }
            const draft = result.skill
            const published = publishState(session, projections, {
              sediment: { kind: 'add', skill: draft },
            })
            if (!published) {
              send(res, 500, { error: '设定集事件写入失败' })
              return
            }
            PENDING.delete(sessionId)
            invalidateLore(sessionId)
            recordActivity(sessionId, {
              id: randomUUID(),
              at: nowIso(),
              actor: 'player',
              target: 'lore',
              phase: 'corrected',
              detailKey: 'detail.loreWritten',
              detailName: draft.name,
            })
            console.log(TAG + ' lore committed for ' + sessionId + ': ' + draft.name)
            send(res, 200, { ok: true, skill: loreView(draft) })
            return
          }

          send(res, 400, { error: 'unknown action' })
        } catch (error) {
          // Projection reads / card reads must never escape as an unhandled
          // rejection; degrade to a JSON 500 like the sibling routes.
          send(res, 500, { error: String((error as { message?: string })?.message ?? error) })
        }
      },
    })
    console.log(TAG + ' lore route armed at ' + LORE_PATH)
    return dispose
  }, 'dsh-rrp: lore route')
}

/**
 * The player-facing `/lore` trigger: same Scribe pass as the panel button, so
 * the draft still lands in 「设定集」 for review before anything is written.
 * @param ctx - the host context owning the registration.
 */
export function registerLoreCommand(ctx: Context): void {
  const runtime = ctx as unknown as RuntimeFaces
  const commands = face<CommandsService>(runtime, 'commands')
  if (commands === undefined) {
    console.warn(TAG + ' /lore command idle (missing commands)')
    return
  }
  const projections = face<ProjectionsService>(runtime, 'sessionProjections')
  const agents = face<AgentsService>(runtime, 'agents')
  const llm = face<LlmService>(runtime, 'llm')
  const jobs = face<JobsService>(runtime, 'jobs')
  const faces: ScribeFaces | undefined =
    llm === undefined || jobs === undefined || agents === undefined || projections === undefined
      ? undefined
      : { llm, jobs, agents, projections }

  ctx.effect(() => {
    const dispose = commands.register({
      name: 'lore',
      description: '把最近确立的新设定沉淀为技能（/lore [主题]）',
      handler: (invocation) => {
        const session = invocation.agent?.session
        if (session === undefined || faces === undefined)
          return { kind: 'error', text: '设定集编纂不可用' }
        // Same guard as the HTTP write paths: a draft on a non-RP session would
        // burn an LLM pass and stage a draft nobody can confirm.
        if (!acceptsRrpWrites(projections, session)) {
          return { kind: 'error', text: '当前不是 RP 会话，设定集编纂不可用' }
        }
        ensureLoreArmed(ctx, session.id)
        scheduleDraft(faces, session, invocation.rawInput.trim())
        return { kind: 'success', text: '正在起草；请在右侧「设定集」确认后写入。' }
      },
    })
    console.log(TAG + ' /lore command armed')
    return dispose
  }, 'dsh-rrp: /lore command')
}
