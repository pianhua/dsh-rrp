/**
 * dsh-rrp — the Copilot advisor (route + storage + undo).
 *
 * The Copilot lives in the right sidebar's third tab and talks to the player
 * out-of-band: her conversation history is kept in plugin-private JSON files
 * (`<dshHome>/.dsh-rrp/copilot/<sessionId>.json`), NOT in the session log, so
 * the narrative stream stays pure. Her only writes into the session are the
 * same published lanes everyone else uses (WorldState facts, staged lore
 * draft) — append-only, fork-safe, and attributed `actor: 'copilot'` in the
 * activity ledger.
 *
 * Undo is honest about the append-only log: it publishes the pre-action
 * snapshot as ONE new state (a revert, not an erasure), so the ledger keeps
 * both records. One snapshot per turn, a stack of the last 10.
 *
 * Host-first: one host webserver route with SSE streaming over the raw Node
 * response, `ctx.llm.stream` with the session's own provider/model route, and
 * the non-RP 403 guard every other write path carries.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { COPILOT_SYSTEM_PROMPT, buildCopilotPrompt, parseCopilotActions } from './agents/copilot.ts'
import { recordActivity } from './activity.ts'
import { CARD_KEY, renderCardContext, type CardContext } from './card-types.ts'
import { transcriptOf, DEFAULT_TRANSCRIPT_LIMIT } from './chronicler.ts'
import { harnessHome } from './home.ts'
import { SUMMARY_KEY, renderMacroSummary } from './macro-summary.ts'
import { belongsToRpPreset } from './preset-id.ts'
import { stageSedimentDraft, reservedNames } from './sediment-route.ts'
import { RRP_SEDIMENT_KEY, sedimentEntriesOf, validateSedimentEntry } from './sediment-state.ts'
import { publishState } from './state-publisher.ts'
import { WORLD_STATE_KEY, applyConstraints, diffWorldState, emptyWorldState, pruneWorldState, renderWorldState, type DynamicFieldValue, type WorldState, type WorldStateRelation } from './world-state.ts'
import { worldStateSchema } from './projection/world-state.ts'

const TAG = '[dsh-rrp]'
const COPILOT_PATH = '/dsh-rrp/copilot'
const UNDO_PATH = '/dsh-rrp/copilot/undo'

/** Kept turns per session; the panel only renders a recent window anyway. */
const TURNS_LIMIT = 50
/** Revert snapshots kept per session. */
const UNDO_LIMIT = 10
/** Copilot turns fed back as conversation history. */
const HISTORY_FEED = 20

// ---------------------------------------------------------------------------
// Persistence: one small JSON per session, fork-isolated by sessionId on
// purpose (the advisor is the player's private channel, not world state).

let copilotDir = join(harnessHome(), '.dsh-rrp', 'copilot')

/** Test hook: keep the real harness home untouched by specs. */
export function setCopilotDirForTesting(dir: string): void {
  copilotDir = dir
}

/** One executed action as recorded on the turn (for the panel's action card). */
export type CopilotTurnAction =
  | { kind: 'world-state'; digest: string }
  | { kind: 'sediment'; name: string }
  | { kind: 'failed'; error: string }

export interface CopilotTurn {
  role: 'player' | 'copilot'
  text: string
  at: string
  actions?: CopilotTurnAction[]
}

export interface CopilotUndoEntry {
  id: string
  at: string
  /** Human digest of what the turn changed (shown on the undo card). */
  digest: string
  /** The WorldState before the turn's world-state actions ran. */
  snapshot: WorldState
}

interface CopilotStore {
  version: 1
  turns: CopilotTurn[]
  undo: CopilotUndoEntry[]
}

function emptyStore(): CopilotStore {
  return { version: 1, turns: [], undo: [] }
}

function storePath(sessionId: string): string {
  return join(copilotDir, sessionId + '.json')
}

/** Load one session's store; a missing or corrupt file yields a fresh store. */
export function loadCopilotStore(sessionId: string): CopilotStore {
  try {
    const raw = readFileSync(storePath(sessionId), 'utf8')
    const parsed = JSON.parse(raw) as CopilotStore
    if (!Array.isArray(parsed.turns) || !Array.isArray(parsed.undo)) return emptyStore()
    return { version: 1, turns: parsed.turns, undo: parsed.undo }
  } catch {
    return emptyStore()
  }
}

/** Persist one store, creating the directory on first use. */
export function saveCopilotStore(sessionId: string, store: CopilotStore): void {
  try {
    if (!existsSync(copilotDir)) mkdirSync(copilotDir, { recursive: true })
    writeFileSync(storePath(sessionId), JSON.stringify(store), 'utf8')
  } catch (error) {
    console.warn(TAG + ' copilot history save failed:', error)
  }
}

/** What the panel GETs: recent turns + undo depth. */
export interface CopilotHistoryView {
  turns: CopilotTurn[]
  undoCount: number
}

export function readCopilotHistory(sessionId: string): CopilotHistoryView {
  const store = loadCopilotStore(sessionId)
  return { turns: store.turns.slice(-TURNS_LIMIT), undoCount: store.undo.length }
}

// ---------------------------------------------------------------------------
// In-flight guard: one advisory turn per session at a time.

const IN_FLIGHT = new Set<string>()

/** Drop in-flight markers when a session is disposed. */
export function forgetCopilot(sessionId: string): void {
  IN_FLIGHT.delete(sessionId)
}

/** Drop every in-flight marker (plugin unload must not leave state behind). */
export function forgetAllCopilot(): void {
  IN_FLIGHT.clear()
}

// ---------------------------------------------------------------------------
// Host faces (structural, so the bundle imports no host package).

interface SessionLike {
  readonly id: string
  append(type: string, data: unknown, intent?: unknown): unknown
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
interface RequestLike {
  method?: string
  url?: string
  on?(event: string, listener: () => void): void
  [Symbol.asyncIterator](): AsyncIterator<string | Uint8Array>
}
interface ResponseLike {
  statusCode: number
  setHeader?(name: string, value: string): void
  write?(chunk: string): unknown
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

/** Respond with a JSON body. */
function sendJson(res: ResponseLike, status: number, payload: unknown): void {
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

/** Write one SSE frame. */
function writeSse(res: ResponseLike, event: string, data: unknown): void {
  res.write?.('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n')
}

/**
 * Merge one action patch over the current state: per-name merge for
 * characters/inventory, per-field merge for scene/flags, whole-value replace
 * for relations and dynamic fields (with constraint clamping); null deletes
 * a dynamic-field key.
 */
export function mergeWorldStatePatch(prior: WorldState, patch: Record<string, unknown>): WorldState {
  const next: WorldState = structuredClone(prior)
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'characters' || key === 'inventory' || key === 'flags') {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('patch.' + key + ' 必须是对象')
      }
      const bucket = next[key] as Record<string, unknown>
      for (const [name, entry] of Object.entries(value as Record<string, unknown>)) {
        if (entry === null) {
          delete bucket[name]
        } else if (key === 'flags') {
          if (typeof entry !== 'string' && typeof entry !== 'number' && typeof entry !== 'boolean') {
            throw new Error('patch.flags.' + name + ' 必须是标量')
          }
          bucket[name] = entry
        } else {
          if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
            throw new Error('patch.' + key + '.' + name + ' 必须是对象')
          }
          bucket[name] = { ...(bucket[name] as Record<string, unknown> ?? {}), ...(entry as Record<string, unknown>) }
        }
      }
      continue
    }
    if (key === 'scene') {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('patch.scene 必须是对象')
      }
      next.scene = { ...next.scene, ...(value as Record<string, string>) }
      continue
    }
    if (key === 'relations') {
      // Whole-value replace; pruneWorldState normalizes pairs afterwards.
      if (!Array.isArray(value)) {
        throw new Error('patch.relations 必须是数组')
      }
      next.relations = value as WorldStateRelation[]
      continue
    }
    // Dynamic field: full DynamicFieldValue, clamped to its constraints.
    if (value === null) {
      delete (next as Record<string, unknown>)[key]
      continue
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('patch.' + key + ' 必须是动态字段对象或 null')
    }
    const field = value as Partial<DynamicFieldValue>
    if (field.value === undefined || (field.type !== 'number' && field.type !== 'string' && field.type !== 'boolean')) {
      throw new Error('patch.' + key + ' 需要完整的 {type, value}')
    }
    ;(next as Record<string, unknown>)[key] = applyConstraints({
      type: field.type,
      value: field.value as number | string | boolean,
      ...(typeof field.min === 'number' ? { min: field.min } : {}),
      ...(typeof field.max === 'number' ? { max: field.max } : {}),
    })
  }
  const pruned = pruneWorldState(next)
  const validated = worldStateSchema.safeParse(pruned)
  if (!validated.success) throw new Error('状态校验失败：' + validated.error.issues[0]?.message)
  return validated.data as WorldState
}

/** Register the Copilot routes. Capability-gated like every other route. */
export function registerCopilotRoute(ctx: Context): void {
  const runtime = ctx as unknown as RuntimeFaces
  const webServer = runtime.get('webServer') as WebServerService | undefined
  const sessions = runtime.get('sessions') as SessionsService | undefined
  const projections = runtime.get('sessionProjections') as ProjectionsService | undefined
  const llm = runtime.get('llm') as LlmService | undefined
  const agents = runtime.get('agents') as AgentsService | undefined
  if (webServer === undefined || sessions === undefined || projections === undefined || llm === undefined || agents === undefined) {
    console.warn(TAG + ' copilot route idle (missing webServer/sessions/sessionProjections/llm/agents)')
    return
  }

  /** Shared entry validation: session exists and belongs to the RP family. */
  const resolveSession = (sessionId: string, res: ResponseLike): SessionLike | undefined => {
    const session = sessions.get(sessionId)
    if (session === undefined) {
      sendJson(res, 404, { error: 'unknown session' })
      return undefined
    }
    const preset = projections.stateOf(session, 'agentPreset')
    if (typeof preset === 'string' && !belongsToRpPreset(preset)) {
      sendJson(res, 403, { error: 'not an RP session' })
      return undefined
    }
    return session
  }

  ctx.effect(() => {
    const disposeUndo = webServer.register({
      kind: 'exact',
      path: UNDO_PATH,
      handler: async (req, res) => {
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
        const sessionId = (parsed as { sessionId?: unknown }).sessionId
        if (typeof sessionId !== 'string' || sessionId.length === 0) {
          sendJson(res, 400, { error: 'missing sessionId' })
          return
        }
        const session = resolveSession(sessionId, res)
        if (session === undefined) return

        const store = loadCopilotStore(sessionId)
        const entry = store.undo.pop()
        if (entry === undefined) {
          sendJson(res, 400, { error: 'nothing to undo' })
          return
        }
        // The revert is itself one new published state (append-only honesty):
        // the values roll back, the ledger keeps both records.
        if (!publishState(session, projections, { worldState: entry.snapshot })) {
          sendJson(res, 500, { error: 'WorldState write failed' })
          return
        }
        recordActivity(sessionId, {
          id: randomUUID(), at: new Date().toISOString(), actor: 'copilot', target: 'world-state', phase: 'corrected',
          detailKey: 'detail.copilotUndone',
        })
        saveCopilotStore(sessionId, store)
        console.log(TAG + ' copilot undo restored pre-turn state for ' + sessionId)
        sendJson(res, 200, { ok: true, digest: entry.digest, undoCount: store.undo.length })
      },
    })

    const disposeMain = webServer.register({
      kind: 'exact',
      path: COPILOT_PATH,
      handler: async (req, res) => {
        let url: URL
        try {
          url = new URL(req.url ?? '', 'http://localhost')
        } catch {
          sendJson(res, 400, { error: 'invalid URL' })
          return
        }
        const fromBody = async (): Promise<string> => req.method === 'POST' ? await readBody(req) : ''

        // GET: history + undo depth. DELETE: clear history.
        if (req.method === 'GET') {
          const sessionId = url.searchParams.get('sessionId') ?? ''
          if (sessionId.length === 0) {
            sendJson(res, 400, { error: 'missing sessionId' })
            return
          }
          if (resolveSession(sessionId, res) === undefined) return
          sendJson(res, 200, readCopilotHistory(sessionId))
          return
        }
        if (req.method === 'DELETE') {
          const sessionId = url.searchParams.get('sessionId') ?? ''
          if (sessionId.length === 0) {
            sendJson(res, 400, { error: 'missing sessionId' })
            return
          }
          if (resolveSession(sessionId, res) === undefined) return
          try {
            unlinkSync(storePath(sessionId))
          } catch {
            /* absent file is already cleared */
          }
          sendJson(res, 200, { ok: true })
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'method not allowed' })
          return
        }

        let parsed: unknown
        try {
          parsed = JSON.parse(await fromBody())
        } catch {
          sendJson(res, 400, { error: 'invalid JSON body' })
          return
        }
        const sessionId = (parsed as { sessionId?: unknown }).sessionId
        const message = (parsed as { message?: unknown }).message
        if (typeof sessionId !== 'string' || sessionId.length === 0) {
          sendJson(res, 400, { error: 'missing sessionId' })
          return
        }
        if (typeof message !== 'string' || message.trim().length === 0) {
          sendJson(res, 400, { error: 'missing message' })
          return
        }
        const session = resolveSession(sessionId, res)
        if (session === undefined) return
        if (IN_FLIGHT.has(sessionId)) {
          sendJson(res, 409, { error: 'busy' })
          return
        }
        const owner = agents.get(sessionId)
        const provider = owner?.options?.provider
        const model = owner?.options?.model
        if (provider === undefined || model === undefined || provider.length === 0 || model.length === 0) {
          sendJson(res, 503, { error: 'no provider/model route' })
          return
        }

        IN_FLIGHT.add(sessionId)
        try {
          const store = loadCopilotStore(sessionId)
          store.turns.push({ role: 'player', text: message, at: new Date().toISOString() })
          store.turns = store.turns.slice(-TURNS_LIMIT)
          saveCopilotStore(sessionId, store)

          // SSE over the raw Node response.
          res.statusCode = 200
          res.setHeader?.('content-type', 'text/event-stream; charset=utf-8')
          res.setHeader?.('cache-control', 'no-cache')
          ;(res as { writeHead?: (status: number) => void }).writeHead?.(200)

          const controller = new AbortController()
          req.on?.('close', () => { controller.abort() })

          const state = (projections.stateOf(session, WORLD_STATE_KEY) as WorldState | undefined) ?? emptyWorldState()
          const card = projections.stateOf(session, CARD_KEY) as CardContext | null | undefined
          const summaryValue = projections.stateOf(session, SUMMARY_KEY)
          const sediment = sedimentEntriesOf(projections.stateOf(session, RRP_SEDIMENT_KEY))
          const prompt = buildCopilotPrompt({
            question: message,
            card: card === null || card === undefined ? '' : renderCardContext(card),
            worldState: renderWorldState(state),
            summary: summaryValue === null || summaryValue === undefined ? '' : renderMacroSummary(summaryValue as Parameters<typeof renderMacroSummary>[0]),
            sediment: sediment.map((skill) => '- ' + skill.name + '：' + skill.description).join('\n'),
            transcript: transcriptOf(projections, session).slice(-DEFAULT_TRANSCRIPT_LIMIT),
          })

          const historyMessages = store.turns.slice(-HISTORY_FEED, -1).map((turn) => ({
            id: randomUUID(),
            role: turn.role === 'player' ? 'user' : 'assistant',
            content: [{ type: 'text', text: turn.text }],
            source: { kind: 'plugin', plugin: 'dsh-rrp' },
          }))
          const stream = llm.stream({
            provider,
            model,
            system: COPILOT_SYSTEM_PROMPT,
            messages: [
              ...historyMessages,
              {
                id: randomUUID(),
                role: 'user',
                content: [{ type: 'text', text: prompt }],
                source: { kind: 'plugin', plugin: 'dsh-rrp' },
              },
            ],
            sessionId,
            signal: controller.signal,
          })

          let reply = ''
          try {
            for await (const chunk of stream) {
              if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
                reply += chunk.text
                writeSse(res, 'chunk', { text: chunk.text })
              }
            }
          } catch (error) {
            if (controller.signal.aborted) {
              writeSse(res, 'error', { error: 'aborted' })
              res.end()
              return
            }
            throw error
          }

          // Execute the action block, if any. Failures are reported per action
          // and never abort the turn — the player still got her answer.
          const applied: CopilotTurnAction[] = []
          const actions = parseCopilotActions(reply)
          const worldActions = actions.filter((action) => action.type === 'update_world_state')
          let priorForUndo: WorldState | undefined
          if (worldActions.length > 0) {
            priorForUndo = (projections.stateOf(session, WORLD_STATE_KEY) as WorldState | undefined) ?? emptyWorldState()
          }
          for (const action of actions) {
            try {
              if (action.type === 'update_world_state') {
                const prior = (projections.stateOf(session, WORLD_STATE_KEY) as WorldState | undefined) ?? emptyWorldState()
                const next = mergeWorldStatePatch(prior, action.patch)
                const digest = diffWorldState(prior, next)
                if (digest.includes('无实质变化')) {
                  applied.push({ kind: 'failed', error: '状态无实质变化' })
                  continue
                }
                if (!publishState(session, projections, { worldState: next })) {
                  throw new Error('WorldState write failed')
                }
                recordActivity(sessionId, {
                  id: randomUUID(), at: new Date().toISOString(), actor: 'copilot', target: 'world-state', phase: 'corrected',
                  detail: (action.reason !== undefined ? action.reason + '：' : '') + digest,
                })
                applied.push({ kind: 'world-state', digest })
                continue
              }
              // draft_sediment: validate then stage for player confirmation.
              const existing = sedimentEntriesOf(projections.stateOf(session, RRP_SEDIMENT_KEY)).map((skill) => skill.name)
              const result = validateSedimentEntry(action.draft, existing, reservedNames(projections, session))
              if (!result.ok) throw new Error(result.error)
              stageSedimentDraft(sessionId, result.skill)
              recordActivity(sessionId, {
                id: randomUUID(), at: new Date().toISOString(), actor: 'copilot', target: 'sediment', phase: 'corrected',
                detailKey: 'detail.stagedDraft', detailName: result.skill.name,
              })
              applied.push({ kind: 'sediment', name: result.skill.name })
            } catch (error) {
              applied.push({ kind: 'failed', error: String((error as { message?: string })?.message ?? error) })
            }
          }
          if (priorForUndo !== undefined && applied.some((entry) => entry.kind === 'world-state')) {
            store.undo.push({
              id: randomUUID(),
              at: new Date().toISOString(),
              digest: applied.filter((entry): entry is { kind: 'world-state'; digest: string } => entry.kind === 'world-state').map((entry) => entry.digest).join('；'),
              snapshot: priorForUndo,
            })
            store.undo = store.undo.slice(-UNDO_LIMIT)
          }

          const copilotTurn: CopilotTurn = {
            role: 'copilot',
            text: reply,
            at: new Date().toISOString(),
            ...(applied.length > 0 ? { actions: applied } : {}),
          }
          store.turns.push(copilotTurn)
          store.turns = store.turns.slice(-TURNS_LIMIT)
          saveCopilotStore(sessionId, store)

          writeSse(res, 'action', { applied })
          writeSse(res, 'done', { turn: copilotTurn, undoCount: store.undo.length })
          res.end()
          console.log(TAG + ' copilot turn completed for ' + sessionId + (applied.length > 0 ? ' (' + String(applied.length) + ' action(s))' : ''))
        } catch (error) {
          console.warn(TAG + ' copilot turn failed:', error)
          try {
            writeSse(res, 'error', { error: String((error as { message?: string })?.message ?? error) })
            res.end()
          } catch {
            /* the socket may already be gone */
          }
        } finally {
          IN_FLIGHT.delete(sessionId)
        }
      },
    })

    console.log(TAG + ' copilot route armed at ' + COPILOT_PATH)
    return () => {
      disposeMain()
      disposeUndo()
    }
  }, 'dsh-rrp: copilot route')
}
