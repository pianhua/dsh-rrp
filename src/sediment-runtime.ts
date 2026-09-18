/**
 * dsh-rrp — arm the worldline-scoped sediment provider.
 *
 * The host's skill registry layers contributions by AGENT scope, and
 * `agent.ctx` is the agent-scoped context whose contributions "are agent-local,
 * unwind on disposal" (dsh-agent runtime types). Registering our provider
 * through `agent.ctx` therefore makes one Session/worldline's sedimented lore
 * visible to that agent alone — exactly the isolation D8 wants — with no
 * per-session preset and no global leak.
 *
 * We arm on `agent/created` for RP-family presets, and lazily on demand for an
 * agent that already exists when the plugin boots.
 */
import type { Context } from '@deepseek-ai/cordis'
import { harnessHome } from './home.ts'
import { belongsToRpPreset } from './preset-id.ts'
import { createSedimentProvider, type SedimentProviderControl } from './sediment-provider.ts'
import { backupLegacySediment, listLegacySediment } from './sediment.ts'
import { RRP_SEDIMENT_KEY, sedimentEntriesOf } from './sediment-state.ts'
import { rrpPayloadOf } from './state-payload.ts'
import { publishState, type StateSession } from './state-publisher.ts'
import { forgetSediment } from './sediment-route.ts'

const TAG = '[dsh-rrp]'

interface SessionLike {
  readonly id: string
  append?(type: string, data: unknown, intent?: unknown): unknown
  snapshotEvents?(): readonly { type?: string; data?: unknown }[]
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
interface ProjectionsService {
  stateOf(session: unknown, key: string): unknown
}
interface RuntimeFaces {
  get(name: string): unknown
  on(event: string, listener: (...args: unknown[]) => void): () => void
}

/** Live Session-scoped providers, so writes invalidate and preset switches unwind them. */
const ARMED = new Map<string, { control: SedimentProviderControl; dispose: () => void }>()

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

/** Whether this Session has ever adopted the event-backed sediment model. */
function hasSedimentEvent(session: SessionLike): boolean {
  return (session.snapshotEvents?.() ?? []).some((event) => rrpPayloadOf(event)?.sediment !== undefined)
}

/**
 * Import one old sidecar exactly once. The event must commit before the source
 * directory is renamed, so any failure leaves the user's files untouched.
 */
export function migrateLegacySediment(
  session: SessionLike,
  projections: ProjectionsService,
  home: string = harnessHome(),
): boolean {
  if (typeof session.append !== 'function' || typeof session.snapshotEvents !== 'function') return false
  if (hasSedimentEvent(session)) return false
  const skills = sedimentEntriesOf(
    listLegacySediment(home, session.id).map(({ name, description, body }) => ({ name, description, body })),
  )
  if (skills.length === 0) return false
  const published = publishState(session as StateSession, projections, { sediment: { kind: 'snapshot', skills } })
  if (!published) return false
  try {
    const backup = backupLegacySediment(home, session.id)
    if (backup !== undefined) console.log(TAG + ' migrated legacy sediment for ' + session.id + ' (backup: ' + backup + ')')
  } catch (error) {
    console.warn(TAG + ' legacy sediment was imported but its source could not be renamed:', error)
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
function maybeArm(agent: AgentLike, projections: ProjectionsService): void {
  // agent/created listeners run inside session creation: a throw here would
  // fail the whole create, so nothing may escape.
  try {
    const session = agent.session
    if (session === undefined || ARMED.has(session.id)) return
    const preset = projections.stateOf(session, 'agentPreset')
    if (typeof preset !== 'string' || !belongsToRpPreset(preset)) return
    migrateLegacySediment(session, projections)
    const skills = skillsOf(agent.ctx)
    if (skills === undefined) return
    let control: SedimentProviderControl | undefined
    const dispose = skills.registerProvider((value) => {
      control = value
      return createSedimentProvider({
        sessionId: session.id,
        read: () => sedimentEntriesOf(projections.stateOf(session, RRP_SEDIMENT_KEY)),
      })
    })
    if (control === undefined) {
      dispose()
      return
    }
    ARMED.set(session.id, { control, dispose })
  } catch (error) {
    console.warn(TAG + ' sediment provider registration failed for ' + agent.id + ':', error)
  }
}

/**
 * Arm worldline sediment skills for RP agents.
 * @param ctx - the host context owning the registration.
 */
export function registerSedimentRuntime(ctx: Context): void {
  const runtime = ctx as unknown as RuntimeFaces
  const agents = runtime.get('agents') as AgentsService | undefined
  const projections = runtime.get('sessionProjections') as ProjectionsService | undefined
  if (agents === undefined || projections === undefined) {
    console.warn(TAG + ' sediment runtime idle (missing agents/sessionProjections)')
    return
  }
  ctx.effect(() => {
    const disposeCreated = runtime.on('agent/created', (...args: unknown[]) => {
      const agent = (args[0] as { agent?: AgentLike } | undefined)?.agent
      if (agent !== undefined) maybeArm(agent, projections)
    })
    const disposeSelected = runtime.on('agent-preset/selected', (...args: unknown[]) => {
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
    })
    const disposeDisposed = runtime.on('agent/disposed', (...args: unknown[]) => {
      const agent = (args[0] as { agent?: AgentLike } | undefined)?.agent
      const sessionId = agent?.session?.id ?? agent?.id
      if (sessionId !== undefined) {
        disarm(sessionId)
        forgetSediment(sessionId)
      }
    })
    console.log(TAG + ' sediment runtime armed (worldline scoping via agent.ctx + Session projection)')
    return () => {
      disposeCreated()
      disposeSelected()
      disposeDisposed()
      for (const sessionId of [...ARMED.keys()]) {
        disarm(sessionId)
        forgetSediment(sessionId)
      }
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
  const runtime = ctx as unknown as RuntimeFaces
  const agents = runtime.get('agents') as AgentsService | undefined
  const projections = runtime.get('sessionProjections') as ProjectionsService | undefined
  const agent = agents?.get(sessionId)
  if (agent !== undefined && projections !== undefined) maybeArm(agent, projections)
}

/** Invalidate one session's skill catalog after a sediment event commits. */
export function invalidateSediment(sessionId: string): void {
  try {
    ARMED.get(sessionId)?.control.invalidate()
  } catch {
    /* the catalog re-snapshots on the next step anyway */
  }
}
