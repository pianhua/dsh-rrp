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
import { matchesPreset } from './preset-id.ts'
import { RRP_SETTINGS_KEY, rrpSettingsOf } from './settings.ts'
import { publishState } from './state-publisher.ts'

const TAG = '[dsh-rrp]'
const JOB_KIND = 'summarizer'
/** Default cadence: summarize every N completed turns. */
const DEFAULT_EVERY_TURNS = 8
const TRANSCRIPT_LIMIT = 16000

interface SessionLike {
  readonly id: string
  append(type: string, data: unknown): unknown
  snapshotEvents(): readonly { type: string; data?: unknown }[]
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
      const session = args[0] as SessionLike | undefined
      const event = args[1] as { type?: string; data?: { reason?: { kind?: string } } } | undefined
      if (session === undefined || event?.type !== 'turn/end') return
      if (event.data?.reason?.kind !== 'completed') return
      if (!rrpSettingsOf(projections.stateOf(session, RRP_SETTINGS_KEY)).summaryEnabled) return
      if (!matchesPreset(projections.stateOf(session, 'agentPreset') as string | undefined, presetId)) return
      const boundary = projections.stateOf(session, 'turnBoundary') as { lastTurn?: number } | undefined
      const turn = boundary?.lastTurn ?? 0
      if (turn === 0 || turn % DEFAULT_EVERY_TURNS !== 0) return
      if (LAST_SUMMARIZED.get(session.id) === turn) return
      LAST_SUMMARIZED.set(session.id, turn)
      scheduleSummary(faces, session, turn)
    })
    console.log(TAG + ' Summarizer armed for preset ' + presetId + ' every ' + DEFAULT_EVERY_TURNS + ' turns')
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

/** Schedule one summarization job. Never throws into the session feed. */
function scheduleSummary(faces: HostFaces, session: SessionLike, turn: number): void {
  const owner = faces.agents.get(session.id)
  const route = routeFor(owner)
  if (route === undefined) {
    console.warn(TAG + ' Summarizer skipped ' + session.id + ': no provider/model route')
    return
  }
  try {
    faces.jobs.start({
      kind: JOB_KIND,
      label: '大局编年 Summarizer · 第 ' + turn + ' 轮',
      ...(owner === undefined ? {} : { owner }),
      run: () => {
        const controller = new AbortController()
        let cancelled = false
        const done = runSummary(faces, session, route, controller.signal, () => cancelled)
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
    console.warn(TAG + ' Summarizer could not start a job:', error)
  }
}

/** One summarization pass: prompt -> model -> parse -> append. */
async function runSummary(
  faces: HostFaces,
  session: SessionLike,
  route: { provider: string; model: string },
  signal: AbortSignal,
  isCancelled: () => boolean,
): Promise<{ status: string }> {
  const activityId = randomUUID()
  const stamp = (): string => new Date().toISOString()
  try {
    const full = transcriptOf(session)
    if (full.trim().length === 0) return { status: 'completed' }
    const transcript = full.length > TRANSCRIPT_LIMIT ? full.slice(full.length - TRANSCRIPT_LIMIT) : full

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
        id: activityId, at: stamp(), actor: 'summarizer', target: 'summary', phase: 'failed', detail: '已取消',
      })
      return { status: 'killed' }
    }

    const summary = parseSummarizerReply(text)
    if (summary === undefined) throw new Error('Summarizer reply was not a valid MacroSummary')
    if (!publishState(session, faces.projections, { summary })) {
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
      description: '开启或关闭大局编年摘要（/summary on|off）',
      handler: ({ rawInput, agent }) => {
        const session = agent?.session
        if (session === undefined) return { kind: 'error', text: '当前会话不可用' }
        const current = rrpSettingsOf(projections.stateOf(session, RRP_SETTINGS_KEY))
        const argument = rawInput.trim().toLowerCase()
        const summaryEnabled = argument === 'on' ? true : argument === 'off' ? false : !current.summaryEnabled
        if (!publishState(session, projections, { settings: { summaryEnabled } })) {
          return { kind: 'error', text: '大局编年设置写入失败' }
        }
        return { kind: 'success', text: '大局编年已' + (summaryEnabled ? '开启' : '关闭') }
      },
    })
    console.log(TAG + ' /summary toggle armed')
    return dispose
  }, 'dsh-rrp: summary toggle command')
}
