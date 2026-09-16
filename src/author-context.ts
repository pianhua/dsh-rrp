/**
 * dsh-rrp — the Author's WorldState context.
 *
 * DESIGN: the Author "只读消费当前最新 WorldState". We contribute that fact
 * baseline through the host's per-step waterfall (`agent/pre-step`), computed
 * fresh at pre-step time so a player correction is reflected in the very next
 * step. Nothing is written back here: the Author only reads.
 */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { WORLD_STATE_KEY, renderWorldState, type WorldState } from './world-state.ts'

const TAG = '[dsh-rrp]'
const PLUGIN = 'dsh-rrp'

interface SessionLike {
  readonly id: string
}
interface AgentLike {
  readonly session: SessionLike
}
interface PreStepPayload {
  readonly agent: AgentLike
  readonly messages: readonly unknown[]
}
interface PreStepDecision {
  readonly kind?: string
  readonly messages: readonly unknown[]
}
interface ProjectionsService {
  stateOf(session: unknown, key: string): unknown
}
interface RuntimeFaces {
  get(name: string): unknown
  on(event: string, listener: (...args: unknown[]) => unknown): () => void
}

/**
 * Arm the Author's fact baseline for one preset.
 * @param ctx - the host context owning the registration.
 * @param presetId - only agents on this preset receive the baseline.
 */
export function registerAuthorContext(ctx: Context, presetId: string): void {
  const runtime = ctx as unknown as RuntimeFaces
  const projections = runtime.get('sessionProjections') as ProjectionsService | undefined
  if (projections === undefined) {
    console.warn(TAG + ' Author context idle (missing sessionProjections)')
    return
  }

  // Last rendered baseline per session, so an unchanged state adds no message.
  const injected = new Map<string, string>()

  ctx.effect(() => {
    const dispose = runtime.on('agent/pre-step', (...args: unknown[]) => {
      const payload = args[0] as PreStepPayload
      const next = args[1] as () => Promise<PreStepDecision>
      return (async (): Promise<PreStepDecision> => {
        const decision = await next()
        try {
          const session = payload.agent.session
          if (projections.stateOf(session, 'agentPreset') !== presetId) return decision
          const state = projections.stateOf(session, WORLD_STATE_KEY) as WorldState | undefined
          if (state === undefined) return decision

          const text = renderWorldState(state)
          if (injected.get(session.id) === text) return decision
          injected.set(session.id, text)

          const message = {
            id: randomUUID(),
            role: 'user',
            content: [{ type: 'text', text }],
            source: { kind: 'plugin', plugin: PLUGIN },
          }
          const entered = [...decision.messages]
          const lastClaimed = entered.findLastIndex((item) => payload.messages.includes(item))
          entered.splice(lastClaimed + 1, 0, message)
          return { ...decision, messages: entered }
        } catch (error) {
          console.warn(TAG + ' Author context injection failed:', error)
          return decision
        }
      })()
    })
    console.log(TAG + ' Author WorldState context armed for preset ' + presetId)
    return dispose
  }, 'dsh-rrp: Author context')
}
