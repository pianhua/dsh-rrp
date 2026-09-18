/**
 * dsh-rrp — knowledge-sedimentation routes (D8).
 *
 * The panel drives the whole controlled flow:
 *   GET    /dsh-rrp/sediment?sessionId=            list + pending draft
 *   POST   /dsh-rrp/sediment  { action:'draft' }   schedule the Scribe
 *   POST   /dsh-rrp/sediment  { action:'confirm' } write the pending draft
 *   POST   /dsh-rrp/sediment  { action:'discard' } drop the pending draft
 *   POST   /dsh-rrp/sediment  { action:'manual', draft } write one directly
 *   DELETE /dsh-rrp/sediment?sessionId=&name=      remove one
 *
 * Nothing is committed without an explicit player action; the Scribe only
 * STAGES a draft. Confirmed changes append to the owning Session and fold
 * through `rrpSediment`, so native forks inherit their event prefix.
 */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { recordActivity } from './activity.ts'
import { readCard } from './cards.ts'
import { CARD_KEY, type CardContext } from './card-types.ts'
import { transcriptOf } from './chronicler.ts'
import { SCRIBE_SYSTEM_PROMPT, buildScribePrompt, parseScribeReply } from './agents/scribe.ts'
import { ensureSedimentArmed, invalidateSediment } from './sediment-runtime.ts'
import {
  RRP_SEDIMENT_KEY,
  sedimentEntriesOf,
  validateSedimentEntry,
  type SedimentEntry,
} from './sediment-state.ts'
import { publishState } from './state-publisher.ts'
import { WORLD_STATE_KEY, renderWorldState, type WorldState } from './world-state.ts'

const TAG = '[dsh-rrp]'
const SEDIMENT_PATH = '/dsh-rrp/sediment'

interface SessionLike {
  readonly id: string
  append(type: string, data: unknown, intent?: unknown): unknown
  snapshotEvents(): readonly { type: string; data?: unknown }[]
}
interface SessionsService {
  get(id: string): SessionLike | undefined
}
interface ProjectionsService {
  stateOf(session: unknown, key: string): unknown
}
interface AgentLike {
  options?: { provider?: string; model?: string }
}
interface AgentsService {
  get(id: string): AgentLike | undefined
}
interface StreamChunkLike {
  type?: string
  text?: string
}
interface LlmService {
  stream(options: Record<string, unknown>): AsyncIterable<StreamChunkLike>
}
interface JobsService {
  start(spec: { kind: string; label: string; owner?: unknown; run(): { done: Promise<{ status: string }> } }): string
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

/** Staged drafts, one per session; never durable — the player confirms or drops. */
const PENDING = new Map<string, SedimentEntry>()
/** Sessions with a Scribe pass in flight (one at a time). */
const DRAFTING = new Set<string>()

/** Forget staged drafts and in-flight drafting state when a session is disposed. */
export function forgetSediment(sessionId: string): void {
  PENDING.delete(sessionId)
  DRAFTING.delete(sessionId)
}

/** Check whether a session has pending or drafting state (for testing / inspection). */
export function hasSedimentDraft(sessionId: string): boolean {
  return PENDING.has(sessionId) || DRAFTING.has(sessionId)
}

/** Set staged draft for testing. */
export function stageSedimentDraftForTesting(sessionId: string, entry: SedimentEntry): void {
  PENDING.set(sessionId, entry)
}

/** Respond with a JSON body. */
function send(res: ResponseLike, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader?.('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

/** Read the whole request body as UTF-8 text. */
async function readBody(req: RequestLike): Promise<string> {
  let text = ''
  for await (const chunk of req) {
    text += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
  }
  return text
}

/** The active card's bundled skill names, so sediment cannot take their names. */
function reservedNames(projections: ProjectionsService | undefined, session: SessionLike): string[] {
  if (projections === undefined) return []
  const card = projections.stateOf(session, CARD_KEY) as CardContext | null | undefined
  if (card === null || card === undefined) return []
  const pack = readCard(card.id)
  if (pack === undefined) return []
  return pack.skills.map((skill) => skill.name ?? skill.id).filter((name) => name.length > 0)
}

/** Current dynamic lore for exactly this Session/worldline. */
function currentSediment(projections: ProjectionsService, session: SessionLike): SedimentEntry[] {
  return sedimentEntriesOf(projections.stateOf(session, RRP_SEDIMENT_KEY))
}

/** Player-facing list row; bodies remain in the Skill provider, not this view. */
function sedimentView(skill: SedimentEntry): { name: string; description: string; bytes: number; updatedAt: string } {
  return {
    name: skill.name,
    description: skill.description,
    bytes: Buffer.byteLength(skill.body, 'utf8'),
    updatedAt: '',
  }
}

/** Resolve the provider/model route of a session's live agent. */
function routeOf(agents: AgentsService | undefined, sessionId: string): { provider: string; model: string } | undefined {
  const owner = agents?.get(sessionId)
  const provider = owner?.options?.provider
  const model = owner?.options?.model
  if (provider === undefined || provider.length === 0) return undefined
  if (model === undefined || model.length === 0) return undefined
  return { provider, model }
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
    id: activityId, at: new Date().toISOString(), actor: 'scribe', target: 'sediment', phase: 'started',
  })
  try {
    faces.jobs.start({
      kind: 'scribe',
      label: '典籍编纂 Scribe · ' + session.id.slice(0, 8),
      run: () => ({ cancel: () => {}, done: runDraft(faces, session, route, topic, activityId) }),
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
  route: { provider: string; model: string },
  topic: string,
  activityId: string,
): Promise<{ status: string }> {
  const stamp = (): string => new Date().toISOString()
  try {
    const state = faces.projections.stateOf(session, WORLD_STATE_KEY) as WorldState | undefined
    const worldState = state === undefined ? '（暂无状态）' : renderWorldState(state)
    const existing = [
      ...reservedNames(faces.projections, session),
      ...currentSediment(faces.projections, session).map((skill) => skill.name),
    ]
    const transcript = transcriptOf(session)
    if (transcript.trim().length === 0) {
      recordActivity(session.id, { id: activityId, at: stamp(), actor: 'scribe', target: 'sediment', phase: 'failed', detail: '没有可用的剧情' })
      return { status: 'completed' }
    }

    const stream = faces.llm.stream({
      provider: route.provider,
      model: route.model,
      system: SCRIBE_SYSTEM_PROMPT,
      messages: [{
        id: randomUUID(),
        role: 'user',
        content: [{ type: 'text', text: buildScribePrompt({ topic, transcript, worldState, existing }) }],
        source: { kind: 'plugin', plugin: 'dsh-rrp' },
      }],
      sessionId: session.id,
    })
    let text = ''
    for await (const chunk of stream) {
      if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
    }
    const draft = parseScribeReply(text)
    if (draft === undefined) {
      recordActivity(session.id, {
        id: activityId, at: stamp(), actor: 'scribe', target: 'sediment', phase: 'failed', detail: '没有可沉淀的稳定设定',
      })
      return { status: 'completed' }
    }
    PENDING.set(session.id, draft)
    recordActivity(session.id, {
      id: activityId, at: stamp(), actor: 'scribe', target: 'sediment', phase: 'committed',
      detail: '草稿：' + draft.name + '（待确认）',
    })
    console.log(TAG + ' Scribe staged a draft for ' + session.id + ': ' + draft.name)
    return { status: 'completed' }
  } catch (error) {
    recordActivity(session.id, {
      id: activityId, at: stamp(), actor: 'scribe', target: 'sediment', phase: 'failed',
      detail: String((error as { message?: string })?.message ?? error),
    })
    return { status: 'failed' }
  } finally {
    DRAFTING.delete(session.id)
  }
}

/**
 * Register the sedimentation routes.
 * @param ctx - the host context owning the registration.
 */
export function registerSedimentRoute(ctx: Context): void {
  const runtime = ctx as unknown as RuntimeFaces
  const webServer = runtime.get('webServer') as WebServerService | undefined
  const sessions = runtime.get('sessions') as SessionsService | undefined
  const projections = runtime.get('sessionProjections') as ProjectionsService | undefined
  if (webServer === undefined || sessions === undefined || projections === undefined) {
    console.warn(TAG + ' sediment route idle (missing webServer/sessions/sessionProjections)')
    return
  }
  const agents = runtime.get('agents') as AgentsService | undefined
  const llm = runtime.get('llm') as LlmService | undefined
  const jobs = runtime.get('jobs') as JobsService | undefined
  const faces: ScribeFaces | undefined = llm === undefined || jobs === undefined || agents === undefined
    ? undefined
    : { llm, jobs, agents, projections }

  ctx.effect(() => {
    const dispose = webServer.register({
      kind: 'exact',
      path: SEDIMENT_PATH,
      handler: async (req, res) => {
        const url = new URL(req.url ?? '', 'http://localhost')
        let parsed: unknown
        if (req.method === 'POST') {
          try {
            parsed = JSON.parse(await readBody(req))
          } catch {
            send(res, 400, { error: 'invalid JSON body' })
            return
          }
        }
        const fromBody = (parsed as { sessionId?: unknown } | undefined)?.sessionId
        const sessionId = typeof fromBody === 'string' && fromBody.length > 0
          ? fromBody
          : (url.searchParams.get('sessionId') ?? '')
        if (sessionId.length === 0) {
          send(res, 400, { error: 'missing sessionId' })
          return
        }
        const session = sessions.get(sessionId)
        if (session === undefined) {
          send(res, 404, { error: 'unknown session' })
          return
        }
        ensureSedimentArmed(ctx, sessionId)

        if (req.method === 'GET') {
          send(res, 200, {
            skills: currentSediment(projections, session).map(sedimentView),
            pending: PENDING.get(sessionId) ?? null,
            drafting: DRAFTING.has(sessionId),
          })
          return
        }

        if (req.method === 'DELETE') {
          const name = url.searchParams.get('name') ?? ''
          const exists = currentSediment(projections, session).some((skill) => skill.name === name)
          if (!exists) {
            send(res, 404, { ok: false, removed: false })
            return
          }
          const published = publishState(session, projections, { sediment: { kind: 'remove', name } })
          if (!published) {
            send(res, 500, { error: '典籍事件写入失败' })
            return
          }
          invalidateSediment(sessionId)
          send(res, 200, { ok: true, removed: true })
          return
        }

        if (req.method !== 'POST') {
          send(res, 405, { error: 'method not allowed' })
          return
        }

        const request = parsed as { action?: unknown; topic?: unknown; draft?: unknown }
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
          const candidate = (request.draft ?? PENDING.get(sessionId)) as Partial<SedimentEntry> | undefined
          if (candidate === undefined || candidate === null) {
            send(res, 400, { error: '没有待确认的草稿' })
            return
          }
          const existing = currentSediment(projections, session)
          const result = validateSedimentEntry(
            candidate,
            existing.map((skill) => skill.name),
            reservedNames(projections, session),
          )
          if (!result.ok) {
            send(res, 400, { error: result.error })
            return
          }
          const draft = result.skill
          const published = publishState(session, projections, { sediment: { kind: 'add', skill: draft } })
          if (!published) {
            send(res, 500, { error: '典籍事件写入失败' })
            return
          }
          PENDING.delete(sessionId)
          invalidateSediment(sessionId)
          recordActivity(sessionId, {
            id: randomUUID(), at: new Date().toISOString(), actor: 'player', target: 'sediment', phase: 'corrected',
            detail: '已沉淀：' + draft.name,
          })
          console.log(TAG + ' sediment committed for ' + sessionId + ': ' + draft.name)
          send(res, 200, { ok: true, skill: sedimentView(draft) })
          return
        }

        send(res, 400, { error: 'unknown action' })
      },
    })
    console.log(TAG + ' sediment route armed at ' + SEDIMENT_PATH)
    return dispose
  }, 'dsh-rrp: sediment route')
}

interface CommandInvocationLike {
  rawInput: string
  agent?: { id: string; session: SessionLike }
}
interface CommandsService {
  register(definition: {
    name: string
    description: string
    handler: (invocation: CommandInvocationLike) => { kind: string; text?: string }
  }): () => void
}

/**
 * The player-facing `/lore` trigger: same Scribe pass as the panel button, so
 * the draft still lands in 「典籍」 for review before anything is written.
 * @param ctx - the host context owning the registration.
 */
export function registerSedimentCommand(ctx: Context): void {
  const runtime = ctx as unknown as RuntimeFaces
  const commands = runtime.get('commands') as CommandsService | undefined
  if (commands === undefined) {
    console.warn(TAG + ' /lore command idle (missing commands)')
    return
  }
  const projections = runtime.get('sessionProjections') as ProjectionsService | undefined
  const agents = runtime.get('agents') as AgentsService | undefined
  const llm = runtime.get('llm') as LlmService | undefined
  const jobs = runtime.get('jobs') as JobsService | undefined
  const faces: ScribeFaces | undefined = llm === undefined || jobs === undefined || agents === undefined || projections === undefined
    ? undefined
    : { llm, jobs, agents, projections }

  ctx.effect(() => {
    const dispose = commands.register({
      name: 'lore',
      description: '把最近确立的新设定沉淀为技能（/lore [主题]）',
      handler: (invocation) => {
        const session = invocation.agent?.session
        if (session === undefined || faces === undefined) return { kind: 'error', text: '典籍编纂不可用' }
        ensureSedimentArmed(ctx, session.id)
        scheduleDraft(faces, session, invocation.rawInput.trim())
        return { kind: 'success', text: '正在编纂；请在右侧「典籍」确认后写入。' }
      },
    })
    console.log(TAG + ' /lore command armed')
    return dispose
  }, 'dsh-rrp: /lore command')
}
