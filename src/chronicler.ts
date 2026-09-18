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
import type { Context } from '@deepseek-ai/cordis'
import { recordActivity } from './activity.ts'
import { CHRONICLER_SYSTEM_PROMPT, buildChroniclerPrompt, parseChroniclerReply } from './agents/chronicler.ts'
import { matchesPreset } from './preset-id.ts'
import { publishState } from './state-publisher.ts'
import { rrpPayloadOf } from './state-payload.ts'
import { NO_WORLD_STATE_CHANGE, WORLD_STATE_KEY, diffWorldState, emptyWorldState, type WorldState } from './world-state.ts'

const TAG = '[dsh-rrp]'
const JOB_KIND = 'chronicler'
/** Cap the transcript handed to the Chronicler (characters, tail-biased). */
const TRANSCRIPT_LIMIT = 8000

/** Structural host faces, kept local so the bundle imports no host package. */
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
  attachController(name: string): () => void
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

/**
 * Arm the Chronicler for one preset.
 * @param ctx - the (agent-scope-free) context owning the registration.
 * @param presetId - only sessions composed from this preset are inferred.
 */
export function registerChronicler(ctx: Context, presetId: string): void {
  const runtime = ctx as unknown as RuntimeFaces
  const llm = runtime.get('llm') as LlmService | undefined
  const jobs = runtime.get('jobs') as JobsService | undefined
  const agents = runtime.get('agents') as AgentsService | undefined
  const projections = runtime.get('sessionProjections') as ProjectionsService | undefined
  if (llm === undefined || jobs === undefined || agents === undefined || projections === undefined) {
    console.warn(TAG + ' Chronicler idle (missing llm/jobs/agents/sessionProjections)')
    return
  }
  const faces: HostFaces = { llm, jobs, agents, projections }

  ctx.effect(() => {
    const disposeController = jobs.attachController('dsh-rrp')
    const disposeListener = runtime.on('session/event', (...args: unknown[]) => {
      const session = args[0] as SessionLike | undefined
      const event = args[1] as { type?: string; data?: { reason?: { kind?: string } } } | undefined
      if (session === undefined || event?.type !== 'turn/end') return
      if (event.data?.reason?.kind !== 'completed') return
      if (!matchesPreset(projections.stateOf(session, 'agentPreset') as string | undefined, presetId)) return
      scheduleInference(faces, session)
    })
    console.log(TAG + ' Chronicler armed for preset ' + presetId)
    return () => {
      disposeListener()
      disposeController()
    }
  }, 'dsh-rrp: Chronicler trigger')
}

/** Resolve the provider/model route for the session's live agent. */
function routeFor(owner: AgentLike | undefined): { provider: string; model: string } | undefined {
  const provider = owner?.options?.provider
  const model = owner?.options?.model
  if (provider === undefined || provider.length === 0) return undefined
  if (model === undefined || model.length === 0) return undefined
  return { provider, model }
}

/** Schedule one background inference job. Never throws into the session feed. */
function scheduleInference(faces: HostFaces, session: SessionLike): void {
  const owner = faces.agents.get(session.id)
  const route = routeFor(owner)
  if (route === undefined) {
    console.warn(TAG + ' Chronicler skipped ' + session.id + ': no provider/model route')
    return
  }
  try {
    faces.jobs.start({
      kind: JOB_KIND,
      label: '纪事官 Chronicler · ' + session.id.slice(0, 8),
      ...(owner === undefined ? {} : { owner }),
      run: () => {
        const controller = new AbortController()
        let cancelled = false
        const done = runInference(faces, session, route, controller.signal, () => cancelled)
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
    console.warn(TAG + ' Chronicler could not start a job:', error)
  }
}

/** One inference pass: prompt -> model -> parse -> append. */
async function runInference(
  faces: HostFaces,
  session: SessionLike,
  route: { provider: string; model: string },
  signal: AbortSignal,
  isCancelled: () => boolean,
): Promise<{ status: string }> {
  const activityId = randomUUID()
  const stamp = (): string => new Date().toISOString()
  try {
    const prior = (faces.projections.stateOf(session, WORLD_STATE_KEY) as WorldState | undefined) ?? emptyWorldState()
    // The Chronicler already receives the complete prior state, so it only
    // needs THIS turn's prose — re-feeding older turns is pure token waste.
    const transcript = latestTurnTranscriptOf(session)
    if (transcript.trim().length === 0) return { status: 'completed' }

    recordActivity(session.id, {
      id: activityId, at: stamp(), actor: 'chronicler', target: 'world-state', phase: 'started',
    })

    const prompt = buildChroniclerPrompt({ prior, transcript })
    const stream = faces.llm.stream({
      provider: route.provider,
      model: route.model,
      system: CHRONICLER_SYSTEM_PROMPT,
      messages: [{
        id: randomUUID(),
        role: 'user',
        content: [{ type: 'text', text: prompt }],
        source: { kind: 'plugin', plugin: 'dsh-rrp' },
      }],
      sessionId: session.id,
      signal,
    })
    const text = await collectText(stream)
    if (isCancelled()) {
      recordActivity(session.id, {
        id: activityId, at: stamp(), actor: 'chronicler', target: 'world-state', phase: 'failed', detail: '已取消',
      })
      return { status: 'killed' }
    }

    const reply = parseChroniclerReply(text, prior)
    if (reply === undefined) throw new Error('Chronicler reply was not a valid WorldState')
    
    // D6: Temporal race check. If the player corrected the state while inference was running,
    // discard the Chronicler's result to ensure player edits always take precedence.
    const currentPrior = (faces.projections.stateOf(session, WORLD_STATE_KEY) as WorldState | undefined) ?? emptyWorldState()
    if (prior !== currentPrior && (diffWorldState(prior, currentPrior) !== NO_WORLD_STATE_CHANGE || JSON.stringify(prior) !== JSON.stringify(currentPrior))) {
      recordActivity(session.id, {
        id: activityId,
        at: stamp(),
        actor: 'chronicler',
        target: 'world-state',
        phase: 'stale',
        detail: '玩家已就地矫正，推演结果作废',
      })
      console.log(TAG + ' Chronicler inferred state is stale (player corrected), discarding for session ' + session.id)
      return { status: 'stale' }
    }

    // D5: Log field creation if present
    if (reply.createFields && reply.createFields.length > 0) {
      const fieldNames = reply.createFields.map(f => f.id).join(', ')
      console.log(TAG + ' Chronicler created new fields: ' + fieldNames)
    }

    const diff = diffWorldState(prior, reply.state)
    if (diff === NO_WORLD_STATE_CHANGE) {
      recordActivity(session.id, {
        id: activityId,
        at: stamp(),
        actor: 'chronicler',
        target: 'world-state',
        phase: 'committed',
        detail: NO_WORLD_STATE_CHANGE,
      })
      console.log(TAG + ' Chronicler skipped publish (no state change) for session ' + session.id)
      return { status: 'completed' }
    }
    
    if (!publishState(session, faces.projections, { worldState: reply.state })) {
      throw new Error('WorldState append failed')
    }
    recordActivity(session.id, {
      id: activityId,
      at: stamp(),
      actor: 'chronicler',
      target: 'world-state',
      phase: 'committed',
      detail: diff,
    })
    console.log(TAG + ' Chronicler committed WorldState for session ' + session.id)
    return { status: 'completed' }
  } catch (error) {
    console.warn(TAG + ' Chronicler inference failed:', error)
    recordActivity(session.id, {
      id: activityId, at: stamp(), actor: 'chronicler', target: 'world-state', phase: 'failed', detail: messageOf(error),
    })
    return { status: isCancelled() ? 'killed' : 'failed' }
  }
}

/** Readable error text for a ledger entry. */
export function messageOf(error: unknown): string {
  const message = (error as { message?: unknown } | undefined)?.message
  return typeof message === 'string' && message.length > 0 ? message : String(error)
}

/** Concatenate streamed text deltas. */
async function collectText(stream: AsyncIterable<StreamChunkLike>): Promise<string> {
  let text = ''
  for await (const chunk of stream) {
    if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
  }
  return text
}

/**
 * Render ONLY the latest turn's user/assistant text. The Chronicler holds the
 * full prior state, so older turns add cost without adding information.
 * @param session - the session whose newest turn is rendered.
 * @returns the latest turn's prose, capped.
 */
export function latestTurnTranscriptOf(session: SessionLike): string {
  const events = session.snapshotEvents()
  let start = 0
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const candidate = events[index]
    if (candidate?.type === 'user/message' && rrpPayloadOf(candidate) === undefined) {
      start = index
      break
    }
  }
  const parts: string[] = []
  for (let index = start; index < events.length; index += 1) {
    const event = events[index]
    if (event?.type !== 'user/message' && event?.type !== 'assistant/message') continue
    if (rrpPayloadOf(event) !== undefined) continue
    const blocks: string[] = []
    collectTextBlocks(event.data, blocks)
    const text = blocks.join('\n').trim()
    if (text.length === 0) continue
    parts.push('【' + (event.type === 'user/message' ? '玩家' : '叙述') + '】\n' + text)
  }
  const joined = parts.join('\n\n')
  return joined.length > TRANSCRIPT_LIMIT ? joined.slice(joined.length - TRANSCRIPT_LIMIT) : joined
}

/** Render the session's user/assistant text blocks, tail-biased and capped.
 * Exported so the Summarizer consumes the same rendering. */
export function transcriptOf(session: SessionLike): string {
  const parts: string[] = []
  for (const event of session.snapshotEvents()) {
    if (event.type !== 'user/message' && event.type !== 'assistant/message') continue
    if (rrpPayloadOf(event) !== undefined) continue
    const blocks: string[] = []
    collectTextBlocks(event.data, blocks)
    const text = blocks.join('\n').trim()
    if (text.length === 0) continue
    parts.push('【' + (event.type === 'user/message' ? '玩家' : '叙述') + '】\n' + text)
  }
  const joined = parts.join('\n\n')
  return joined.length > TRANSCRIPT_LIMIT ? joined.slice(joined.length - TRANSCRIPT_LIMIT) : joined
}

/** Recursively collect { type: 'text', text } blocks from an event payload. */
function collectTextBlocks(value: unknown, out: string[]): void {
  if (value === null || value === undefined) return
  if (Array.isArray(value)) {
    for (const item of value) collectTextBlocks(item, out)
    return
  }
  if (typeof value !== 'object') return
  const record = value as Record<string, unknown>
  if (record.type === 'text' && typeof record.text === 'string') {
    out.push(record.text)
    return
  }
  for (const item of Object.values(record)) collectTextBlocks(item, out)
}
