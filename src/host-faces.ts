/**
 * dsh-rrp — the host faces our backend speaks to, plus their shared plumbing.
 *
 * Ten route modules each re-declared `RequestLike` / `ResponseLike` /
 * `WebServerService` / `RuntimeFaces` and carried byte-identical `send`,
 * `readBody`, `new URL(...)` and provider-route copies. This module is that
 * single surface: when a host signature moves, one file moves.
 *
 * Structural types only — no host package is imported, exactly like before, so
 * the bundle stays installable against any DSH version that satisfies them.
 *
 * Host-only: it touches `Buffer`. The browser side already has its own face in
 * `client/context-types.ts`; importing this from `src/client/` is a build error
 * by intent.
 */

import { belongsToRpPreset } from './preset-id.ts'

/** Loader-independent tag for every console line this module writes. */
const TAG = '[dsh-rrp]'

// ── Webserver ───────────────────────────────────────────────────────────────

/** One host-registered exact-path route. */
export interface RouteSpec {
  kind: 'exact'
  path: string
  handler: (req: RequestLike, res: ResponseLike) => void | Promise<void>
}

/** The host webserver, as our routes see it (never `node:http` directly). */
export interface WebServerService {
  register(route: RouteSpec): () => void
}

/** A request our handler may read as a stream and inspect for method/query. */
export interface RequestLike {
  method?: string
  url?: string
  on?(event: string, listener: () => void): void
  [Symbol.asyncIterator](): AsyncIterator<string | Uint8Array>
}

/** The raw response half of the host's reply object. */
export interface ResponseLike {
  statusCode: number
  setHeader?(name: string, value: string): void
  write?(chunk: string): unknown
  end(body?: string): void
}

/** Send one JSON response — the only body shape non-2xx routes may use. */
export function send(res: ResponseLike, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader?.('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

/** Read the whole request body as UTF-8 text. */
export async function readBody(req: RequestLike): Promise<string> {
  let text = ''
  for await (const chunk of req) {
    text += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
  }
  return text
}

/**
 * Parse a JSON request body, or `undefined` when it is absent or malformed —
 * the caller answers 400, because only the caller knows the expected shape.
 */
export async function readJsonBody(req: RequestLike): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed = JSON.parse(await readBody(req)) as unknown
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

/** The request's query string, or undefined when the URL cannot be read. */
export function queryOf(req: RequestLike): URLSearchParams | undefined {
  if (req.url === undefined) return undefined
  try {
    // The base is a placeholder: only the query half of `req.url` is ever used.
    return new URL(req.url, 'http://localhost').searchParams
  } catch {
    return undefined
  }
}

/** One `sessionId` from query or body, '' when neither carries one. */
export function sessionIdOf(
  query: URLSearchParams | undefined,
  body: Record<string, unknown> | undefined,
): string {
  const fromBody = body?.sessionId
  if (typeof fromBody === 'string' && fromBody.length > 0) return fromBody
  return query?.get('sessionId') ?? ''
}

// ── Sessions, projections, agents, llm, jobs ────────────────────────────────

/** The session face our writers need (`append` validates before it commits). */
export interface SessionLike {
  readonly id: string
  append(type: string, data: unknown, intent?: unknown): unknown
}

export interface SessionsService {
  get(id: string): SessionLike | undefined
}

/** The projection read face (host: `ctx.sessionProjections`). */
export interface ProjectionsService {
  stateOf(session: unknown, key: string): unknown
}

/**
 * A host slash-command invocation. `agent` is typed optional: a command run
 * off the main agent path may not carry one, and both our handlers already
 * answer with an error text instead of dereferencing it.
 */
export interface CommandInvocationLike {
  rawInput: string
  agent?: { id?: string; session?: SessionLike }
}

/** The host command registry (`ctx.commands`), as our `/summary` and `/lore` use it. */
export interface CommandsService {
  register(definition: {
    name: string
    description: string
    handler: (invocation: CommandInvocationLike) => { kind: string; text?: string }
  }): () => void
}

export interface AgentLike {
  options?: { provider?: string; model?: string }
}

export interface AgentsService {
  get(id: string): AgentLike | undefined
}

export interface StreamChunkLike {
  type?: string
  text?: string
}

export interface LlmService {
  stream(options: Record<string, unknown>): AsyncIterable<StreamChunkLike>
}

export interface JobHooksLike {
  cancel(reason?: string): void
  done: Promise<{ status: string }>
}

export interface JobsService {
  start(spec: { kind: string; label: string; owner?: unknown; run(): JobHooksLike }): string
}

/**
 * Plus the controller hook: the runners that own background cancellation
 * (Chronicler, Summarizer, Scribe) cannot arm without it, so they probe for
 * this wider face and idle when the host does not offer one.
 */
export interface ControllableJobsService extends JobsService {
  attachController(name: string): () => void
}

/** `ctx.get` half of the host context, as our capability probes use it. */
export interface RuntimeFaces {
  get(name: string): unknown
}

/** Plus the event bus, for the modules that listen to session/agent lifecycle. */
export interface ListeningRuntimeFaces extends RuntimeFaces {
  on(event: string, listener: (...args: unknown[]) => void): () => void
}

/** Read a host service as an optional capability: absent ⇒ the caller degrades. */
export function face<T>(runtime: RuntimeFaces, name: string): T | undefined {
  return runtime.get(name) as T | undefined
}

/** The provider/model pair an `llm.stream` call needs to be aimed with. */
export interface ProviderRoute {
  provider: string
  model: string
}

/** The provider/model route of a session's live agent, or undefined. */
export function routeOf(
  agents: AgentsService | undefined,
  sessionId: string,
): ProviderRoute | undefined {
  const options = agents?.get(sessionId)?.options
  const provider = options?.provider
  const model = options?.model
  if (provider === undefined || provider.length === 0) return undefined
  if (model === undefined || model.length === 0) return undefined
  return { provider, model }
}

// ── Shared write-path guard ─────────────────────────────────────────────────

/**
 * Whether one session accepts RRP writes. Every session-scoped write route
 * (correction, lore, 月停) and the `/lore` command answer through this single
 * rule: a session that has chosen a preset outside the RP family is refused,
 * while a session with no preset yet — or no projection face at all — stays
 * allowed, matching the legacy seats.
 */
export function acceptsRrpWrites(
  projections: ProjectionsService | undefined,
  session: unknown,
): boolean {
  const preset = projections?.stateOf(session, 'agentPreset')
  return typeof preset !== 'string' || belongsToRpPreset(preset)
}

// ── Shared writer conveniences ──────────────────────────────────────────────

/** ISO timestamp for one ledger entry (writers never invent their own format). */
export function nowIso(): string {
  return new Date().toISOString()
}

/** Readable error text for a ledger entry: a message when there is one. */
export function messageOf(error: unknown): string {
  const message = (error as { message?: unknown } | undefined)?.message
  return typeof message === 'string' && message.length > 0 ? message : String(error)
}

/** Concatenate streamed text deltas into one reply. */
export async function collectText(stream: AsyncIterable<StreamChunkLike>): Promise<string> {
  let text = ''
  for await (const chunk of stream) {
    if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
  }
  return text
}

/** An empty stream is an infrastructure failure, never a model verdict. */
export function isEmptyReply(text: string): boolean {
  return text.trim().length === 0
}

/**
 * Log and build the error for an empty streamed reply, so every agent names
 * the same cause in the host log the same way.
 * @param agent - the agent's stable English role name.
 * @param sessionId - the session whose pass produced nothing.
 */
export function emptyReplyError(agent: string, sessionId: string): Error {
  console.warn(TAG + ' ' + agent + ' EMPTY reply for ' + sessionId + ' (treated as failure)')
  return new Error(agent + ' reply was empty')
}
