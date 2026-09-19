/**
 * dsh-rrp — the Summarizer runner (D11).
 *
 * Every N completed turns of an RP-preset session, schedule an async job that
 * condenses the arc into the four macro dimensions and publishes it as the
 * newest facts context message, driving the summary projection and the Author's
 * macro compass. The player toggles the whole feature with the `/summary`
 * command.
 *
 * Same host seams as the Chronicler: `ctx.jobs` to schedule, `ctx.llm` to
 * infer, `Session.append` to record.
 */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { recordActivity } from './activity.ts'
import { SUMMARIZER_SYSTEM_PROMPT, buildSummarizerPrompt, parseSummarizerReply } from './agents/summarizer.ts'
import { messageOf, transcriptOf } from './chronicler.ts'
import { SUMMARY_KEY, diffMacroSummary, NO_SUMMARY_CHANGE, type MacroSummary } from './macro-summary.ts'
import { matchesPreset } from './preset-id.ts'
import { RRP_SETTINGS_KEY, clampSummaryEveryTurns, rrpSettingsOf } from './settings.ts'
import { publishState } from './state-publisher.ts'
import { TRANSCRIPT_KEY, type TranscriptSlice } from './transcript.ts'

const TAG = '[dsh-rrp]'
const JOB_KIND = 'summarizer'
const TRANSCRIPT_LIMIT = 16000

interface SessionLike {
  readonly id: string
  append(type: string, data: unknown): unknown
}
interface StreamChunkLike {
  type?: string
  text?: string
}
interface LlmService {
  stream(options: Record<string, unknown>): AsyncIterable<StreamChunkLike>
}
interface JobHooksLike {
  cancel(reason?: string): void
  done: Promise<{ status: string }>
}
interface JobsService {
  start(spec: { kind: string; label: string; owner?: unknown; run(): JobHooksLike }): string
}
interface AgentLike {
  options?: { provider?: string; model?: string }
}
interface AgentsService {
  get(id: string): AgentLike | undefined
}
interface ProjectionsService {
  stateOf(session: unknown, key: string): unknown
}
interface CommandsService {
  register(definition: {
    name: string
    description: string
    handler: (invocation: { rawInput: string; agent?: { session?: SessionLike } }) => { kind: string; text?: string }
  }): () => void
}
interface HostFaces {
  readonly llm: LlmService
  readonly jobs: JobsService
  readonly agents: AgentsService
  readonly projections: ProjectionsService
}
interface RuntimeFaces {
  get(name: string): unknown
  on(event: string, listener: (...args: unknown[]) => void): () => void
}

/** Last summarized turn per session, to prevent duplicate runs on the same turn. */
const LAST_SUMMARIZED = new Map<string, number>()

/** Forget last-summarized turn watermark when a session is disposed. */
export function forgetSummary(sessionId: string): void {
  LAST_SUMMARIZED.delete(sessionId)
}

/** Drop every watermark (plugin unload must not leave stale sessions behind). */
export function forgetAllSummary(): void {
  LAST_SUMMARIZED.clear()
}

/** Check last-summarized turn watermark (for testing / inspection). */
export function getLastSummarizedTurn(sessionId: string): number | undefined {
  return LAST_SUMMARIZED.get(sessionId)
}

/**
 * Trigger the Summarizer on completed RP turns at the cadence boundary.
 * @param ctx - the Cordis context hosting the plugin.
 * @param presetId - the RP mode id whose sessions we watch.
 */
export function registerSummarizer(ctx: Context, presetId: string): void {
  const runtime = ctx as unknown as RuntimeFaces
  const llm = runtime.get('llm') as LlmService | undefined
  const jobs = runtime.get('jobs') as JobsService | undefined
  const agents = runtime.get('agents') as AgentsService | undefined
  const projections = runtime.get('sessionProjections') as ProjectionsService | undefined
  if (llm === undefined || jobs === undefined || agents === undefined || projections === undefined) {
    console.warn(TAG + ' Summarizer idle (missing llm/jobs/agents/sessionProjections)')
    return
  }
  const faces: HostFaces = { llm, jobs, agents, projections }

  ctx.effect(() => {
    const dispose = runtime.on('session/event', (...args: unknown[]) => {
      // Host projection reads may throw (e.g. racing session disposal); a
      // listener throw would escape into the host event bus, so never let one.
      try {
        const session = args[0] as SessionLike | undefined
        const event = args[1] as { type?: string; data?: { reason?: { kind?: string } } } | undefined
        if (session === undefined || event?.type !== 'turn/end') return
        if (event.data?.reason?.kind !== 'completed') return
        if (!matchesPreset(projections.stateOf(session, 'agentPreset') as string | undefined, presetId)) return
        const settings = rrpSettingsOf(projections.stateOf(session, RRP_SETTINGS_KEY))
        if (!settings.summaryEnabled) return
        const boundary = projections.stateOf(session, 'turnBoundary') as { lastTurn?: number } | undefined
        const turn = boundary?.lastTurn ?? 0
        if (turn === 0 || turn % settings.summaryEveryTurns !== 0) return
        if (LAST_SUMMARIZED.get(session.id) === turn) return
        // Restart-proof watermark: the transcript slice durably records which
        // turn the last published summary covered, so a process restart does
        // not re-run a boundary turn that was already summarized.
        const slice = projections.stateOf(session, TRANSCRIPT_KEY) as TranscriptSlice | undefined
        if (slice?.lastSummaryTurn === turn) return
        // Mark only once the job is actually scheduled, so a transient route
        // or job-start failure does not skip this turn's summary forever.
        if (scheduleSummary(faces, session, turn)) LAST_SUMMARIZED.set(session.id, turn)
      } catch (error) {
        console.warn(TAG + ' Summarizer trigger failed:', error)
      }
    })
    console.log(TAG + ' Summarizer armed for preset ' + presetId + ' (cadence configurable via /summary every N)')
    return dispose
  }, 'dsh-rrp: Summarizer trigger')
}

/** Resolve the provider/model route for the session's live agent. */
function routeFor(owner: AgentLike | undefined): { provider: string; model: string } | undefined {
  const provider = owner?.options?.provider
  const model = owner?.options?.model
  if (provider === undefined || provider.length === 0) return undefined
  if (model === undefined || model.length === 0) return undefined
  return { provider, model }
}

/** Schedule one summarization job. Never throws into the session feed.
 * @returns whether the job actually started (false = no route / start failure) */
function scheduleSummary(faces: HostFaces, session: SessionLike, turn: number): boolean {
  const owner = faces.agents.get(session.id)
  const route = routeFor(owner)
  if (route === undefined) {
    console.warn(TAG + ' Summarizer skipped ' + session.id + ': no provider/model route')
    return false
  }
  try {
    faces.jobs.start({
      kind: JOB_KIND,
      label: '剧情脉络 Summarizer · 第 ' + turn + ' 轮',
      ...(owner === undefined ? {} : { owner }),
      run: () => {
        const controller = new AbortController()
        let cancelled = false
        const done = runSummary(faces, session, turn, route, controller.signal, () => cancelled)
        return {
          cancel: () => {
            cancelled = true
            controller.abort()
          },
          done,
        }
      },
    })
    return true
  } catch (error) {
    console.warn(TAG + ' Summarizer could not start a job:', error)
    return false
  }
}

/** One summarization pass: prompt -> model -> parse -> append.
 * @param turn - the completed turn this pass covers (durable watermark). */
async function runSummary(
  faces: HostFaces,
  session: SessionLike,
  turn: number,
  route: { provider: string; model: string },
  signal: AbortSignal,
  isCancelled: () => boolean,
): Promise<{ status: string }> {
  const activityId = randomUUID()
  const stamp = (): string => new Date().toISOString()
  try {
    // transcriptOf already caps at whole-entry boundaries (prefix-cache stable);
    // no second char-level cut here.
    const transcript = transcriptOf(faces.projections, session, TRANSCRIPT_LIMIT)
    if (transcript.trim().length === 0) return { status: 'completed' }

    recordActivity(session.id, {
      id: activityId, at: stamp(), actor: 'summarizer', target: 'summary', phase: 'started',
    })

    const stream = faces.llm.stream({
      provider: route.provider,
      model: route.model,
      system: SUMMARIZER_SYSTEM_PROMPT,
      messages: [{
        id: randomUUID(),
        role: 'user',
        content: [{ type: 'text', text: buildSummarizerPrompt(transcript) }],
        source: { kind: 'plugin', plugin: 'dsh-rrp' },
      }],
      sessionId: session.id,
      signal,
    })
    let text = ''
    for await (const chunk of stream) {
      if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
    }
    if (isCancelled()) {
      recordActivity(session.id, {
        id: activityId, at: stamp(), actor: 'summarizer', target: 'summary', phase: 'failed', detailKey: 'detail.cancelled',
      })
      return { status: 'killed' }
    }

    const summary = parseSummarizerReply(text)
    if (summary === undefined) throw new Error('Summarizer reply was not a valid MacroSummary')
    // Short-circuit like the Chronicler: a reworded-but-identical summary must
    // not trigger a facts republish (wasted tokens and log noise).
    const priorSummary = faces.projections.stateOf(session, SUMMARY_KEY) as MacroSummary | null | undefined
    if (priorSummary !== null && priorSummary !== undefined) {
      const diff = diffMacroSummary(priorSummary, summary)
      if (diff === NO_SUMMARY_CHANGE) {
        recordActivity(session.id, {
          id: activityId, at: stamp(), actor: 'summarizer', target: 'summary', phase: 'committed', detailKey: 'detail.noChange',
        })
        console.log(TAG + ' Summarizer skipped publish (no summary change) for session ' + session.id)
        return { status: 'completed' }
      }
    }
    if (!publishState(session, faces.projections, { summary, summaryTurn: turn })) {
      throw new Error('MacroSummary append failed')
    }
    recordActivity(session.id, {
      id: activityId,
      at: stamp(),
      actor: 'summarizer',
      target: 'summary',
      phase: 'committed',
      detail: '目标：' + summary.goal + '；矛盾：' + summary.conflict,
    })
    console.log(TAG + ' Summarizer committed a macro summary for session ' + session.id)
    return { status: 'completed' }
  } catch (error) {
    console.warn(TAG + ' Summarizer failed:', error)
    recordActivity(session.id, {
      id: activityId, at: stamp(), actor: 'summarizer', target: 'summary', phase: 'failed', detail: messageOf(error),
    })
    return { status: isCancelled() ? 'killed' : 'failed' }
  }
}

/**
 * Register the player-facing `/summary` toggle.
 * @param ctx - the host context owning the registration.
 */
export function registerSummaryCommand(ctx: Context): void {
  const runtime = ctx as unknown as RuntimeFaces
  const commands = runtime.get('commands') as CommandsService | undefined
  const projections = runtime.get('sessionProjections') as ProjectionsService | undefined
  if (commands === undefined || projections === undefined) {
    console.warn(TAG + ' /summary command idle (missing commands/sessionProjections)')
    return
  }
  ctx.effect(() => {
    const dispose = commands.register({
      name: 'summary',
      description: '剧情脉络：/summary on|off 开关，/summary every N 设置周期（默认 8 轮）',
      handler: ({ rawInput, agent }) => {
        const session = agent?.session
        if (session === undefined) return { kind: 'error', text: '当前会话不可用' }
        const current = rrpSettingsOf(projections.stateOf(session, RRP_SETTINGS_KEY))
        const argument = rawInput.trim().toLowerCase()
        const everyMatch = /^every\s+(\d{1,3})$/.exec(argument)
        const next = everyMatch !== null
          ? { ...current, summaryEveryTurns: clampSummaryEveryTurns(Number(everyMatch[1])) }
          : { ...current, summaryEnabled: argument === 'on' ? true : argument === 'off' ? false : !current.summaryEnabled }
        if (!publishState(session, projections, { settings: next })) {
          return { kind: 'error', text: '剧情脉络设置写入失败' }
        }
        const text = everyMatch !== null
          ? '剧情脉络：每 ' + next.summaryEveryTurns + ' 轮提炼一次'
          : '剧情脉络已' + (next.summaryEnabled ? '开启' : '关闭')
        return { kind: 'success', text }
      },
    })
    console.log(TAG + ' /summary toggle armed')
    return dispose
  }, 'dsh-rrp: summary toggle command')
}
