/**
 * dsh-rrp — arm the worldline-scoped lore provider.
 *
 * The host's skill registry layers contributions by AGENT scope, and
 * `agent.ctx` is the agent-scoped context whose contributions "are agent-local,
 * unwind on disposal" (dsh-agent runtime types). Registering our provider
 * through `agent.ctx` therefore makes one Session/worldline's lore
 * visible to that agent alone — exactly the isolation D8 wants — with no
 * per-session preset and no global leak.
 *
 * We arm on `agent/created` for RP-family presets, and lazily on demand for an
 * agent that already exists when the plugin boots.
 */
import type { Context } from '@deepseek-ai/cordis'
import { type ListeningRuntimeFaces, type ProjectionsService, face } from './host-faces.ts'
import { harnessHome } from './home.ts'
import { belongsToRpPreset } from './preset-id.ts'
import { createLoreProvider, type LoreProviderControl } from './lore-provider.ts'
import { backupLegacyLore, listLegacyLore } from './lore.ts'
import { RRP_LORE_KEY, loreEntriesOf } from './lore-state.ts'
import { TRANSCRIPT_KEY, type TranscriptSlice } from './transcript.ts'
import { publishState, type StateSession } from './state-publisher.ts'
import { forgetLore } from './lore-route.ts'

const TAG = '[dsh-rrp]'

/**
 * The agent-scoped surfaces this module speaks to. Named apart from the
 * `host-faces.ts` faces on purpose: a LoreSession whose `append` may be absent
 * (an agent can outlive its writable session), and a LoreAgent carrying its own
 * `ctx` — which is how one worldline's lore stays agent-local.
 */
interface LoreSession {
  readonly id: string
  append?(type: string, data: unknown, intent?: unknown): unknown
}
interface SkillsServiceLike {
  registerProvider(create: (control: LoreProviderControl) => unknown): () => void
}
interface AgentContextLike {
  /** Cordis property access; throws without a declared inject on the context. */
  skills?: SkillsServiceLike
  /** Inject-free service read; the returned service is still traced to this context. */
  get?(name: string): unknown
}
interface LoreAgent {
  id: string
  session?: LoreSession
  ctx?: AgentContextLike
}
interface LoreAgentRegistry {
  get(id: string): LoreAgent | undefined
}

/** Live Session-scoped providers, so writes invalidate and preset switches unwind them. */
const ARMED = new Map<string, { control: LoreProviderControl; dispose: () => void }>()

/** Remove one provider registration without letting lifecycle cleanup escape. */
function disarm(sessionId: string): void {
  const armed = ARMED.get(sessionId)
  if (armed === undefined) return
  ARMED.delete(sessionId)
  try {
    armed.dispose()
  } catch {
    /* the owning agent context also disposes its registered provider */
  }
}

/** Whether this Session has ever adopted the event-backed lore model. */
function hasLoreEvent(projections: ProjectionsService, session: LoreSession): boolean {
  try {
    return ((projections.stateOf(session, TRANSCRIPT_KEY) as TranscriptSlice | undefined)?.sedimentSeen) ?? false
  } catch {
    // Racing disposal etc.: treat as unseen, exactly like a missing snapshot before.
    return false
  }
}

/**
 * Import one old sidecar exactly once. The event must commit before the source
 * directory is renamed, so any failure leaves the user's files untouched.
 */
export function migrateLegacyLore(
  session: LoreSession,
  projections: ProjectionsService,
  home: string = harnessHome(),
): boolean {
  if (typeof session.append !== 'function') return false
  if (hasLoreEvent(projections, session)) return false
  const skills = loreEntriesOf(
    listLegacyLore(home, session.id).map(({ name, description, body }) => ({ name, description, body })),
  )
  if (skills.length === 0) return false
  const published = publishState(session as StateSession, projections, { sediment: { kind: 'snapshot', skills } })
  if (!published) return false
  try {
    const backup = backupLegacyLore(home, session.id)
    if (backup !== undefined) console.log(TAG + ' migrated legacy lore for ' + session.id + ' (backup: ' + backup + ')')
  } catch (error) {
    console.warn(TAG + ' legacy lore was imported but its source could not be renamed:', error)
  }
  return true
}

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
function maybeArm(agent: LoreAgent, projections: ProjectionsService): void {
  // agent/created listeners run inside session creation: a throw here would
  // fail the whole create, so nothing may escape.
  try {
    const session = agent.session
    if (session === undefined || ARMED.has(session.id)) return
    const preset = projections.stateOf(session, 'agentPreset')
    if (typeof preset !== 'string' || !belongsToRpPreset(preset)) return
    migrateLegacyLore(session, projections)
    const skills = skillsOf(agent.ctx)
    if (skills === undefined) return
    let control: LoreProviderControl | undefined
    const dispose = skills.registerProvider((value) => {
      control = value
      return createLoreProvider({
        sessionId: session.id,
        read: () => loreEntriesOf(projections.stateOf(session, RRP_LORE_KEY)),
      })
    })
    if (control === undefined) {
      dispose()
      return
    }
    ARMED.set(session.id, { control, dispose })
  } catch (error) {
    console.warn(TAG + ' lore provider registration failed for ' + agent.id + ':', error)
  }
}

/**
 * Arm worldline lore skills for RP agents.
 * @param ctx - the host context owning the registration.
 */
export function registerLoreRuntime(ctx: Context): void {
  const runtime = ctx as unknown as ListeningRuntimeFaces
  const agents = face<LoreAgentRegistry>(runtime, 'agents')
  const projections = face<ProjectionsService>(runtime, 'sessionProjections')
  if (agents === undefined || projections === undefined) {
    console.warn(TAG + ' lore runtime idle (missing agents/sessionProjections)')
    return
  }
  ctx.effect(() => {
    const disposeCreated = runtime.on('agent/created', (...args: unknown[]) => {
      const agent = (args[0] as { agent?: LoreAgent } | undefined)?.agent
      if (agent !== undefined) maybeArm(agent, projections)
    })
    const disposeSelected = runtime.on('agent-preset/selected', (...args: unknown[]) => {
      // Same lifecycle rule as agent/created: nothing may escape this listener.
      try {
        const sessionId = args[0]
        if (typeof sessionId !== 'string') return
        const agent = agents.get(sessionId)
        if (agent === undefined) {
          if (!belongsToRpPreset(typeof args[1] === 'string' ? args[1] : undefined)) disarm(sessionId)
          return
        }
        const preset = projections.stateOf(agent.session, 'agentPreset')
        if (typeof preset !== 'string' || !belongsToRpPreset(preset)) {
          disarm(sessionId)
          return
        }
        maybeArm(agent, projections)
      } catch (error) {
        console.warn(TAG + ' lore preset-switch handling failed:', error)
      }
    })
    const disposeDisposed = runtime.on('agent/disposed', (...args: unknown[]) => {
      const agent = (args[0] as { agent?: LoreAgent } | undefined)?.agent
      const sessionId = agent?.session?.id ?? agent?.id
      if (sessionId !== undefined) {
        disarm(sessionId)
        forgetLore(sessionId)
      }
    })
    console.log(TAG + ' lore runtime armed (worldline scoping via agent.ctx + Session projection)')
    return () => {
      disposeCreated()
      disposeSelected()
      disposeDisposed()
      for (const sessionId of [...ARMED.keys()]) {
        disarm(sessionId)
        forgetLore(sessionId)
      }
    }
  }, 'dsh-rrp: lore runtime')
}

/**
 * Arm the provider for an already-live agent (the current session at boot, or a
 * session whose agent was created before this listener attached).
 * @param ctx - the host context.
 * @param sessionId - the session to arm.
 */
export function ensureLoreArmed(ctx: Context, sessionId: string): void {
  const runtime = ctx as unknown as ListeningRuntimeFaces
  const agents = face<LoreAgentRegistry>(runtime, 'agents')
  const projections = face<ProjectionsService>(runtime, 'sessionProjections')
  const agent = agents?.get(sessionId)
  if (agent !== undefined && projections !== undefined) maybeArm(agent, projections)
}

/** Invalidate one session's skill catalog after a lore event commits. */
export function invalidateLore(sessionId: string): void {
  try {
    ARMED.get(sessionId)?.control.invalidate()
  } catch {
    /* the catalog re-snapshots on the next step anyway */
  }
}
