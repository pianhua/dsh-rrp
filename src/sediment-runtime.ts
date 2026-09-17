/**
 * dsh-rrp — arm the per-session sediment provider.
 *
 * The host's skill registry layers contributions by AGENT scope, and
 * `agent.ctx` is the agent-scoped context whose contributions "are agent-local,
 * unwind on disposal" (dsh-agent runtime types). Registering our provider
 * through `agent.ctx` therefore makes one session's sedimented lore visible to
 * that session alone — exactly the isolation D8 wants — with no per-session
 * preset and no global leak.
 *
 * We arm on `agent/created` for RP-family presets, and lazily on demand for an
 * agent that already exists when the plugin boots.
 */
import type { Context } from '@deepseek-ai/cordis'
import { belongsToRpPreset } from './preset-id.ts'
import { createSedimentProvider, type SedimentProviderControl } from './sediment-provider.ts'

const TAG = '[dsh-rrp]'

interface SessionLike {
  header?: { agentPreset?: string }
}
interface SkillsServiceLike {
  registerProvider(create: (control: SedimentProviderControl) => unknown): () => void
}
interface AgentContextLike {
  /** Cordis property access; throws without a declared inject on the context. */
  skills?: SkillsServiceLike
  /** Inject-free service read; the returned service is still traced to this context. */
  get?(name: string): unknown
}
interface AgentLike {
  id: string
  session?: SessionLike
  ctx?: AgentContextLike
}
interface AgentsService {
  get(id: string): AgentLike | undefined
}
interface RuntimeFaces {
  get(name: string): unknown
  on(event: string, listener: (...args: unknown[]) => void): () => void
}

/** Live per-session provider controls, so a write can invalidate its catalog. */
const ARMED = new Map<string, SedimentProviderControl>()

/**
 * Read the skill registry from an agent context.
 *
 * Cordis refuses `agent.ctx.skills` property access unless the accessing fiber
 * declared the dependency ("cannot get property \"skills\" without inject") —
 * and the agent's context declares nothing for us. `ctx.get(name)` is the
 * inject-free read, and it still traces the service to THIS context, so the
 * registration files into the agent scope exactly as the property would.
 */
function skillsOf(ctx: AgentContextLike | undefined): SkillsServiceLike | undefined {
  if (ctx === undefined) return undefined
  if (typeof ctx.get === 'function') return ctx.get('skills') as SkillsServiceLike | undefined
  // Only reached by structural test doubles, never by a real Cordis context.
  return ctx.skills
}

/** Arm one agent when it belongs to the RP family and is not armed already. */
function maybeArm(agent: AgentLike): void {
  // agent/created listeners run inside session creation: a throw here would
  // fail the whole create, so nothing may escape.
  try {
    if (ARMED.has(agent.id)) return
    if (!belongsToRpPreset(agent.session?.header?.agentPreset)) return
    const skills = skillsOf(agent.ctx)
    if (skills === undefined) return
    skills.registerProvider((control) => {
      ARMED.set(agent.id, control)
      return createSedimentProvider({ sessionId: agent.id })
    })
  } catch (error) {
    console.warn(TAG + ' sediment provider registration failed for ' + agent.id + ':', error)
  }
}

/**
 * Arm per-session sediment skills for RP agents.
 * @param ctx - the host context owning the registration.
 */
export function registerSedimentRuntime(ctx: Context): void {
  const runtime = ctx as unknown as RuntimeFaces
  const agents = runtime.get('agents') as AgentsService | undefined
  if (agents === undefined) {
    console.warn(TAG + ' sediment runtime idle (missing agents)')
    return
  }
  ctx.effect(() => {
    const disposeCreated = runtime.on('agent/created', (...args: unknown[]) => {
      const agent = (args[0] as { agent?: AgentLike } | undefined)?.agent
      if (agent !== undefined) maybeArm(agent)
    })
    const disposeDisposed = runtime.on('agent/disposed', (...args: unknown[]) => {
      const agent = (args[0] as { agent?: AgentLike } | undefined)?.agent
      if (agent !== undefined) ARMED.delete(agent.id)
    })
    console.log(TAG + ' sediment runtime armed (per-session scoping via agent.ctx)')
    return () => {
      disposeCreated()
      disposeDisposed()
      ARMED.clear()
    }
  }, 'dsh-rrp: sediment runtime')
}

/**
 * Arm the provider for an already-live agent (the current session at boot, or a
 * session whose agent was created before this listener attached).
 * @param ctx - the host context.
 * @param sessionId - the session to arm.
 */
export function ensureSedimentArmed(ctx: Context, sessionId: string): void {
  const agents = (ctx as unknown as RuntimeFaces).get('agents') as AgentsService | undefined
  const agent = agents?.get(sessionId)
  if (agent !== undefined) maybeArm(agent)
}

/** Invalidate one session's skill catalog after a sediment write/delete. */
export function invalidateSediment(sessionId: string): void {
  try {
    ARMED.get(sessionId)?.invalidate()
  } catch {
    /* the catalog re-snapshots on the next step anyway */
  }
}
