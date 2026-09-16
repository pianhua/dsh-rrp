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
import { CARD_KEY, renderCardContext, type CardContext } from './card-types.ts'
import { SUMMARY_KEY, renderMacroSummary, type MacroSummary } from './macro-summary.ts'
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

  // The host persists every injected message, so an unchanged payload would be
  // duplicated on each turn. Track two lanes separately:
  //   - card  : session-constant -> injected exactly once.
  //   - facts : summary + state  -> injected only when they actually change.
  const injectedCard = new Map<string, string>()
  const injectedFacts = new Map<string, string>()

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
          const summary = projections.stateOf(session, SUMMARY_KEY) as MacroSummary | null | undefined
          const card = projections.stateOf(session, CARD_KEY) as CardContext | null | undefined

          const cardText = card === null || card === undefined ? undefined : renderCardContext(card)
          const factsText = [
            summary === null || summary === undefined ? undefined : renderMacroSummary(summary),
            renderWorldState(state),
          ].filter((part): part is string => part !== undefined).join('\n\n')

          const additions: Array<Record<string, unknown>> = []
          if (cardText !== undefined && injectedCard.get(session.id) !== cardText) {
            injectedCard.set(session.id, cardText)
            additions.push(pluginMessage(cardText))
          }
          if (injectedFacts.get(session.id) !== factsText) {
            injectedFacts.set(session.id, factsText)
            additions.push(pluginMessage(factsText))
          }
          if (additions.length === 0) return decision

          const entered = [...decision.messages]
          const lastClaimed = entered.findLastIndex((item) => payload.messages.includes(item))
          entered.splice(lastClaimed + 1, 0, ...additions)
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

/** One plugin-role context message (persisted by the host as a user/message). */
function pluginMessage(text: string): Record<string, unknown> {
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'plugin', plugin: PLUGIN },
  }
}
