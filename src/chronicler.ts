/**
 * dsh-rrp — the Chronicler runner.
 *
 * On a completed turn of an RP-preset session, schedule an async background job
 * (D3: body text first, state inference after) that asks the Chronicler to fold
 * the turn into a complete WorldState, then appends it through the shared
 * `user/message.source.rrp` state publisher (D5/D6: the projection adopts
 * whole values; the player can correct afterwards).
 *
 * Host-first: scheduled through ctx.jobs, inferred through ctx.llm, and
 * recorded into the session log via Session.append. The plugin attaches its own
 * jobs controller so RP-preset agents (whose composition has no tool-jobs row)
 * can start background work.
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { recordActivity, renderActivityWorldStateDiff } from './activity.ts'
import { extractFirstJsonObject } from './json-extract.ts'
import {
  CHRONICLER_SYSTEM_PROMPT,
  buildChroniclerPrompt,
  chroniclerReplySchema,
  parseChroniclerReply,
  repairChroniclerEnvelope,
} from './agents/chronicler.ts'
import {
  type AgentsService,
  type ControllableJobsService,
  type ListeningRuntimeFaces,
  type LlmService,
  type ProjectionsService,
  type ProviderRoute,
  type SessionLike,
  collectText,
  emptyReplyError,
  face,
  isEmptyReply,
  messageOf,
  nowIso,
  routeOf,
} from './host-faces.ts'
import { matchesPreset } from './preset-id.ts'
import { publishState } from './state-publisher.ts'
import { pendingTranscriptOf, proseHeadSeqOf } from './transcript-reader.ts'
import { type WorldStateTimelineChangeBatch } from './world-state-timeline.ts'
import {
  WORLD_STATE_KEY,
  diffWorldState,
  emptyWorldState,
  worldStatesEqual,
  type WorldState,
} from './world-state.ts'
import { sanitizePlayerText, sanitizeWorldStateDiff } from './world-state-visibility.ts'

const TAG = '[dsh-rrp]'
const JOB_KIND = 'chronicler'

/** First schema issues for a malformed Chronicler reply, for diagnostics. */
function chroniclerReplyIssueList(text: string): string[] | undefined {
  const parsed = extractFirstJsonObject(text)
  if (parsed === undefined) return ['no JSON object found']
  const result = chroniclerReplySchema.safeParse(repairChroniclerEnvelope(parsed))
  if (result.success) return undefined
  return result.error.issues.slice(0, 5).map((issue) => issue.path.join('.') + ': ' + issue.message)
}

function chroniclerReplyIssues(text: string): string | undefined {
  const list = chroniclerReplyIssueList(text)
  return list === undefined ? undefined : JSON.stringify(list)
}

/** Debug seam: persist the full malformed reply for offline inspection. */
function dumpMalformedReply(sessionId: string, text: string): void {
  const dir = process.env.DSH_RRP_DEBUG_DUMP
  if (dir === undefined || dir.length === 0) return
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'chronicler-' + sessionId + '-' + Date.now() + '.txt'), text)
  } catch {
    // debug seam never breaks the job
  }
}

/** The host faces this runner speaks to, gathered once at registration. */
interface HostFaces {
  readonly llm: LlmService
  readonly jobs: ControllableJobsService
  readonly agents: AgentsService
  readonly projections: ProjectionsService
}

/**
 * Arm the Chronicler for one preset.
 * @param ctx - the (agent-scope-free) context owning the registration.
 * @param presetId - only sessions composed from this preset are inferred.
 */
export function registerChronicler(ctx: Context, presetId: string): void {
  const runtime = ctx as unknown as ListeningRuntimeFaces
  const llm = face<LlmService>(runtime, 'llm')
  const jobs = face<ControllableJobsService>(runtime, 'jobs')
  const agents = face<AgentsService>(runtime, 'agents')
  const projections = face<ProjectionsService>(runtime, 'sessionProjections')
  if (
    llm === undefined ||
    jobs === undefined ||
    agents === undefined ||
    projections === undefined
  ) {
    console.warn(TAG + ' Chronicler idle (missing llm/jobs/agents/sessionProjections)')
    return
  }
  const faces: HostFaces = { llm, jobs, agents, projections }

  ctx.effect(() => {
    const disposeController = jobs.attachController('dsh-rrp')
    const disposeListener = runtime.on('session/event', (...args: unknown[]) => {
      // Host projection reads may throw (e.g. racing session disposal); a
      // listener throw would escape into the host event bus, so never let one.
      try {
        const session = args[0] as SessionLike | undefined
        const event = args[1] as
          { type?: string; data?: { reason?: { kind?: string } } } | undefined
        if (session === undefined || event?.type !== 'turn/end') return
        if (event.data?.reason?.kind !== 'completed') return
        if (
          !matchesPreset(
            projections.stateOf(session, 'agentPreset') as string | undefined,
            presetId,
          )
        )
          return
        scheduleInference(faces, session)
      } catch (error) {
        console.warn(TAG + ' Chronicler trigger failed:', error)
      }
    })
    console.log(TAG + ' Chronicler armed for preset ' + presetId)
    return () => {
      disposeListener()
      disposeController()
    }
  }, 'dsh-rrp: Chronicler trigger')
}

/** Schedule one background inference job. Never throws into the session feed.
 * @param throughSeq - fold the prose up to this seq and no further: the
 *   boundary this pass owes. A deferral records the head as it stood when the
 *   turn completed, so a pass never folds a newer turn than the one it was
 *   triggered for, and no turn is ever skipped.
 */
function scheduleInference(faces: HostFaces, session: SessionLike, throughSeq?: number): void {
  // Concurrency guard: rapid successive turns must never run two inferences
  // for one session in parallel (the later job could overwrite the earlier
  // one's folds). Defer instead, and remember the newest boundary owed so the
  // covering pass folds every turn that piled up in the meantime.
  if (INFERENCE_IN_FLIGHT.has(session.id)) {
    const owed = Math.max(
      throughSeq ?? proseHeadSeqOf(faces.projections, session),
      PENDING_UNTIL.get(session.id) ?? -1,
    )
    PENDING_UNTIL.set(session.id, owed)
    console.log(
      TAG +
        ' Chronicler busy for ' +
        session.id +
        '; queued a covering rerun through seq ' +
        String(owed),
    )
    return
  }
  const owner = faces.agents.get(session.id)
  const route = routeOf(faces.agents, session.id)
  if (route === undefined) {
    console.warn(TAG + ' Chronicler skipped ' + session.id + ': no provider/model route')
    return
  }
  const target =
    throughSeq ?? PENDING_UNTIL.get(session.id) ?? proseHeadSeqOf(faces.projections, session)
  PENDING_UNTIL.delete(session.id)
  INFERENCE_IN_FLIGHT.add(session.id)
  try {
    faces.jobs.start({
      kind: JOB_KIND,
      label: '状态推演 Chronicler · ' + session.id.slice(0, 8),
      ...(owner === undefined ? {} : { owner }),
      run: () => {
        const controller = new AbortController()
        let cancelled = false
        const done = runInference(faces, session, route, controller.signal, () => cancelled, target)
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
    INFERENCE_IN_FLIGHT.delete(session.id)
    console.warn(TAG + ' Chronicler could not start a job:', error)
  }
}

/** Sessions with an inference in flight, and the newest boundary still owed. */
const INFERENCE_IN_FLIGHT = new Set<string>()
const PENDING_UNTIL = new Map<string, number>()
/**
 * Seq of the newest prose a pass actually committed lives in the session log
 * (`TranscriptSlice.lastFoldSeq`), not here: the log's own
 * `lastStateSeq` cannot answer "what is un-folded", because a turn deferred
 * behind a busy pass sits in the log BEFORE the next state write.
 */
/** Covering reruns queued after a discard, per session, reset by a commit. */
const DISCARD_RETRIES = new Map<string, number>()
/** How many times one session may re-fold a discarded turn (no livelock). */
const MAX_DISCARD_RETRIES = 3

/** Drop the concurrency markers when a session is disposed. */
export function forgetInference(sessionId: string): void {
  INFERENCE_IN_FLIGHT.delete(sessionId)
  PENDING_UNTIL.delete(sessionId)
  DISCARD_RETRIES.delete(sessionId)
}

/** Drop every concurrency marker (plugin unload must not leave stale sessions behind). */
export function forgetAllInference(): void {
  INFERENCE_IN_FLIGHT.clear()
  PENDING_UNTIL.clear()
  DISCARD_RETRIES.clear()
}

/** One LLM round-trip for the Chronicler conversation so far. */
async function streamChroniclerText(
  faces: HostFaces,
  session: SessionLike,
  route: ProviderRoute,
  signal: AbortSignal,
  messages: unknown[],
): Promise<string> {
  const stream = faces.llm.stream({
    provider: route.provider,
    model: route.model,
    system: CHRONICLER_SYSTEM_PROMPT,
    messages,
    sessionId: session.id,
    signal,
  })
  return collectText(stream)
}

/** One inference pass: prompt -> model -> parse -> append. */
async function runInference(
  faces: HostFaces,
  session: SessionLike,
  route: ProviderRoute,
  signal: AbortSignal,
  isCancelled: () => boolean,
  throughSeq: number,
): Promise<{ status: string }> {
  const activityId = randomUUID()
  try {
    const prior =
      (faces.projections.stateOf(session, WORLD_STATE_KEY) as WorldState | undefined) ??
      emptyWorldState()
    // Everything since the last committed fold, up to the boundary this pass
    // owes — no re-feeding of already-booked turns, no skipped ones.
    const transcript = pendingTranscriptOf(faces.projections, session, throughSeq)
    if (isEmptyReply(transcript)) return { status: 'completed' }

    recordActivity(session.id, {
      id: activityId,
      at: nowIso(),
      actor: 'chronicler',
      target: 'world-state',
      phase: 'started',
    })

    const prompt = buildChroniclerPrompt({ prior, transcript })
    const userMessage = {
      id: randomUUID(),
      role: 'user' as const,
      content: [{ type: 'text' as const, text: prompt }],
      source: { kind: 'plugin' as const, plugin: 'dsh-rrp' },
    }
    const text = await streamChroniclerText(faces, session, route, signal, [userMessage])
    if (isCancelled()) {
      recordActivity(session.id, {
        id: activityId,
        at: nowIso(),
        actor: 'chronicler',
        target: 'world-state',
        phase: 'failed',
        detailKey: 'detail.cancelled',
      })
      return { status: 'killed' }
    }
    // Distinguish an empty stream (infrastructure failure, retry-worthy) from
    // a malformed payload — both used to surface as the same format error.
    if (isEmptyReply(text)) throw emptyReplyError('Chronicler', session.id)

    // Weak models occasionally drift off the strict v2 wire shape. Before
    // giving up, ask once more with the validation issues spelled out; the
    // deterministic envelope repair has already run inside parseChroniclerReply.
    const repaired = parseChroniclerReply(text)
    let reply = repaired
    let finalText = text
    if (reply === undefined && !isCancelled()) {
      const issues = chroniclerReplyIssueList(text)
      console.warn(
        TAG +
          ' Chronicler reply failed validation; requesting one repair pass: ' +
          (issues === undefined ? 'unknown' : issues.join('; ')),
      )
      const repairMessage = {
        id: randomUUID(),
        role: 'user' as const,
        content: [
          {
            type: 'text' as const,
            text:
              '上一次输出未通过 WorldState v2 校验。问题：\n- ' +
              (issues ?? ['unknown']).join('\n- ') +
              '\n请输出修正后的完整 JSON 对象（只输出 JSON，不要解释，不要 Markdown）：{"state":完整WorldState,"changeSummary":"…","evidence":[…]}。',
          },
        ],
        source: { kind: 'plugin' as const, plugin: 'dsh-rrp' },
      }
      const assistantMessage = {
        id: randomUUID(),
        role: 'assistant' as const,
        content: [{ type: 'text' as const, text }],
      }
      const retryText = await streamChroniclerText(faces, session, route, signal, [
        userMessage,
        assistantMessage,
        repairMessage,
      ])
      if (!isCancelled() && !isEmptyReply(retryText)) {
        const retryReply = parseChroniclerReply(retryText)
        if (retryReply !== undefined) {
          reply = retryReply
          finalText = retryText
        }
      }
    }

    if (reply === undefined) {
      // Log a bounded preview so a format regression names its cause instead
      // of leaving "not a valid WorldState" as the whole story; include the
      // first schema issues so a field-level drift is identifiable offline.
      const preview = finalText.replace(/\s+/g, ' ').slice(0, 160)
      const issues = chroniclerReplyIssues(finalText)
      console.warn(
        TAG +
          ' Chronicler reply was not a valid WorldState (len ' +
          String(finalText.length) +
          '): ' +
          preview +
          (issues === undefined ? '' : ' | issues: ' + issues),
      )
      dumpMalformedReply(session.id, finalText)
      throw new Error('Chronicler reply was not a valid WorldState')
    }

    // D6: the player's edit always wins, so a correction that landed while this
    // pass was running discards it. The discarded prose is not thereby
    // uncounted: queue the covering rerun so the next pass folds everything
    // since the last state write, not just the newest turn.
    const currentPrior =
      (faces.projections.stateOf(session, WORLD_STATE_KEY) as WorldState | undefined) ??
      emptyWorldState()
    if (prior !== currentPrior && !worldStatesEqual(prior, currentPrior)) {
      // Bounded so continuous editing cannot livelock the queue; a committed
      // pass resets the budget. The next completed turn folds it regardless.
      const retries = (DISCARD_RETRIES.get(session.id) ?? 0) + 1
      if (retries <= MAX_DISCARD_RETRIES) {
        DISCARD_RETRIES.set(session.id, retries)
        // Re-fold the very window this pass owed: the cursor never advanced,
        // so nothing is lost between the discard and the rerun.
        PENDING_UNTIL.set(session.id, throughSeq)
      } else {
        console.warn(
          TAG +
            ' Chronicler discard retries exhausted for ' +
            session.id +
            '; the next completed turn folds it',
        )
      }
      recordActivity(session.id, {
        id: activityId,
        at: nowIso(),
        actor: 'chronicler',
        target: 'world-state',
        phase: 'stale',
        detailKey: 'detail.staleDiscarded',
      })
      console.log(
        TAG +
          ' Chronicler result discarded (player corrected); queued a covering rerun for session ' +
          session.id,
      )
      return { status: 'stale' }
    }

    const diff = diffWorldState(prior, reply.state)
    if (diff.changes.length === 0) {
      // No-op inference is activity only: it must not advance the durable prose
      // cursor or create a WorldState timeline event.
      DISCARD_RETRIES.delete(session.id)
      recordActivity(session.id, {
        id: activityId,
        at: nowIso(),
        actor: 'chronicler',
        target: 'world-state',
        phase: 'committed',
        detailKey: 'detail.noChange',
      })
      console.log(TAG + ' Chronicler skipped publish (no state change) for session ' + session.id)
      return { status: 'completed' }
    }

    const turnBoundary = faces.projections.stateOf(session, 'turnBoundary') as
      { lastTurn?: unknown } | undefined
    const storyTurn =
      typeof turnBoundary?.lastTurn === 'number' && Number.isInteger(turnBoundary.lastTurn)
        ? turnBoundary.lastTurn
        : undefined
    const playerSafeDiff = sanitizeWorldStateDiff(diff, prior, reply.state)
    const evidenceParts = [
      ...(reply.changeSummary === undefined
        ? []
        : [sanitizePlayerText(reply.changeSummary, prior, reply.state)]),
      ...(reply.evidence === undefined || reply.evidence.length === 0
        ? []
        : ['证据：' + sanitizePlayerText(reply.evidence.join('；'), prior, reply.state)]),
    ]
    const timelineBatch: WorldStateTimelineChangeBatch = {
      kind: 'changes',
      changes: diff.changes,
      provenance: {
        actor: 'chronicler',
        ...(storyTurn === undefined ? {} : { storyTurn }),
        at: nowIso(),
        ...(evidenceParts.length === 0 ? {} : { evidence: evidenceParts.join('；') }),
      },
      origin: 'local',
    }

    // The cursor and the atomic timeline batch travel with the complete state
    // snapshot. Failed/cancelled/no-op paths never reach this publisher call.
    if (
      !publishState(session, faces.projections, {
        worldState: reply.state,
        stateFoldSeq: throughSeq,
        worldStateTimelineBatch: timelineBatch,
      })
    ) {
      throw new Error('WorldState append failed')
    }
    DISCARD_RETRIES.delete(session.id)
    recordActivity(session.id, {
      id: activityId,
      at: nowIso(),
      actor: 'chronicler',
      target: 'world-state',
      phase: 'committed',
      detail: renderActivityWorldStateDiff(playerSafeDiff),
    })
    console.log(TAG + ' Chronicler committed WorldState for session ' + session.id)
    return { status: 'completed' }
  } catch (error) {
    console.warn(TAG + ' Chronicler inference failed:', error)
    recordActivity(session.id, {
      id: activityId,
      at: nowIso(),
      actor: 'chronicler',
      target: 'world-state',
      phase: 'failed',
      detail: messageOf(error),
    })
    return { status: isCancelled() ? 'killed' : 'failed' }
  } finally {
    INFERENCE_IN_FLIGHT.delete(session.id)
    // Turns that ended while this pass ran are owed a fold: hand the newest
    // boundary to a rerun, unless this job was cancelled (the next completed
    // turn covers it from the same cursor).
    const owed = PENDING_UNTIL.get(session.id)
    if (owed !== undefined) {
      PENDING_UNTIL.delete(session.id)
      if (!isCancelled()) scheduleInference(faces, session, owed)
    }
  }
}
