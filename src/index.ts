/**
 * dsh-rrp — host half.
 *
 * The host half materializes the RP preset family, registers the six pure
 * Session projections, and wires the DSH-native routes/jobs/agent scopes used
 * by the card, WorldState, summary, and lore flows.
 *
 * Every registration is capability-gated and reversible; the client half owns
 * only Slot/right-sidebar UI (see src/client/index.ts).
 */
import type { Context } from '@deepseek-ai/cordis'
import { registerActivityRoute } from './activity-route.ts'
import { listCards } from './cards.ts'
import { registerCardsRoute } from './cards-route.ts'
import { registerCardUiRoute } from './card-ui-route.ts'
import { registerCardWorkspaceRoute } from './card-workspace-route.ts'
import { registerExportRoute } from './export-route.ts'
import { registerCopilotRoute, forgetAllCopilot, forgetCopilot } from './copilot.ts'
import { worldlineDigestProjection } from './projection/worldline-digest.ts'
import { registerWorldlineRoute } from './worldline-route.ts'
import { registerLoreCommand, registerLoreRoute } from './lore-route.ts'
import { registerLoreRuntime } from './lore-runtime.ts'
import { registerChronicler, forgetAllInference, forgetInference } from './chronicler.ts'
import { registerCorrectionRoute } from './correction.ts'
import { PRESET_ID, cleanupPreset, materializePreset } from './preset.ts'
import { presetIdForCard } from './preset-id.ts'
import { cardProjection } from './projection/card.ts'
import { summaryProjection } from './projection/summary.ts'
import { settingsProjection } from './projection/settings.ts'
import { loreProjection } from './projection/lore.ts'
import { transcriptProjection } from './projection/transcript.ts'
import { worldStateProjection } from './projection/world-state.ts'
import { registerStartRoute } from './start.ts'
import { registerSummarizer, registerSummaryCommand, forgetAllSummary, forgetSummary } from './summarizer.ts'
import { forgetAllActivity, forgetActivity } from './activity.ts'
import { forgetAllLore, forgetLore } from './lore-route.ts'
import { forgetAllState, forgetState } from './state-publisher.ts'
import { forgetAllProposals, forgetProposals } from './steward-proposals.ts'

/** Loader row id. Keep in sync with cordis.patch.yml. */
export const name = 'dsh-rrp'

/** No host services are hard requirements; capabilities are probed as optional. */
export const inject: string[] = []

const TAG = '[dsh-rrp]'

/** Structural face of the host agent-preset roster. */
interface AgentPresetRow {
  id: string
  name?: string
  broken?: string
}
interface AgentPresetsService {
  resolve(id?: string): Promise<AgentPresetRow>
  standingKeyFor(id?: string): Promise<unknown>
}

/** Structural face of the host skill registry, for one scoped catalog read. */
interface SkillsService {
  list(options: { scope: unknown }): Promise<Array<{ name: string }>>
}

/** Structural face of the session-projection registry. */
interface SessionProjectionsService {
  register(
    definition:
      | typeof worldStateProjection
      | typeof summaryProjection
      | typeof settingsProjection
      | typeof loreProjection
      | typeof cardProjection
      | typeof transcriptProjection
      | typeof worldlineDigestProjection,
  ): () => void
}

/** Plugin body. Every registration is a reversible effect. */
export function apply(ctx: Context): void {
  const outcome = materializePreset()
  if (outcome.action === 'left-user') {
    console.warn(`${TAG} RP preset at ${outcome.dir} was edited or is foreign; left untouched`)
  } else {
    console.log(`${TAG} RP preset ${outcome.action} at ${outcome.dir}`)
  }

  ctx.effect(() => {
    return () => {
      const result = cleanupPreset()
      if (result !== 'absent') console.log(`${TAG} RP preset cleanup: ${result}`)
    }
  }, 'dsh-rrp: RP preset ownership')

  // Optional capability: `ctx.inject` defers registration until the registry
  // exists and ties the registration to this plugin's lifetime.
  const projectionDisposers: Array<() => void> = []
  ctx.inject(['sessionProjections'], (scoped: Context) => {
    const readable = scoped as unknown as { get(name: string): unknown }
    const registry = readable.get('sessionProjections') as SessionProjectionsService | undefined
    if (registry === undefined) return
    projectionDisposers.push(registry.register(worldStateProjection))
    console.log(`${TAG} WorldState projection registered (key '${worldStateProjection.key}')`)
    projectionDisposers.push(registry.register(summaryProjection))
    console.log(`${TAG} macro-summary projection registered (key '${summaryProjection.key}')`)
    projectionDisposers.push(registry.register(settingsProjection))
    console.log(`${TAG} RP settings projection registered (key '${settingsProjection.key}')`)
    projectionDisposers.push(registry.register(loreProjection))
    console.log(`${TAG} lore projection registered (key '${loreProjection.key}')`)
    projectionDisposers.push(registry.register(cardProjection))
    console.log(`${TAG} active-card projection registered (key '${cardProjection.key}')`)
    projectionDisposers.push(registry.register(transcriptProjection))
    console.log(`${TAG} transcript projection registered (key '${transcriptProjection.key}')`)
    projectionDisposers.push(registry.register(worldlineDigestProjection))
    console.log(`${TAG} worldline digest projection registered (key '${worldlineDigestProjection.key}')`)
  })
  ctx.effect(() => {
    return () => {
      while (projectionDisposers.length > 0) projectionDisposers.pop()?.()
    }
  }, 'dsh-rrp: projection registrations')

  // Roster probe: deferred until agent-presets activates, disposed with this fiber.
  ctx.inject(['agentPresets'], (scoped: Context) => {
    void verifyPreset(scoped)
  })

  // Chronicler: armed only when every host seam it needs is present.
  ctx.inject(['jobs', 'llm', 'agents', 'sessionProjections'], (scoped: Context) => {
    registerChronicler(scoped, PRESET_ID)
  })

  // Player correction: the panel's write path into the session log (D6).
  ctx.inject(['webServer', 'sessions', 'sessionProjections'], (scoped: Context) => {
    registerCorrectionRoute(scoped)
  })

  // Card packs (Stage 6): read-only routes the gallery/start flow consumes.
  ctx.inject(['webServer'], (scoped: Context) => {
    registerCardsRoute(scoped)
  })

  // Card UI (issue #18): the Stage panel's read-only door to a card's
  // validated declaration and its own HTML pages.
  ctx.inject(['webServer'], (scoped: Context) => {
    registerCardUiRoute(scoped)
  })

  // Novel export (issue #31-C): full-log prose download through the host's
  // session-persistence read handles (works on live AND cold sessions).
  ctx.inject(['webServer'], (scoped: Context) => {
    registerExportRoute(scoped)
  })

  // Activity ledger: the right-sidebar panel polls this host-side, in-memory
  // ledger (it is player-facing and must never enter the session log/model).
  ctx.inject(['webServer'], (scoped: Context) => {
    registerActivityRoute(scoped)
  })

  // Knowledge lore (D8): worldline skills staged behind a player
  // confirmation. The runtime arms the agent-scoped provider; confirmed
  // changes live in the Session projection and therefore follow native forks.
  ctx.inject(['agents', 'sessionProjections'], (scoped: Context) => {
    registerLoreRuntime(scoped)
  })
  ctx.inject(['webServer', 'sessions', 'sessionProjections', 'agents', 'llm', 'jobs'], (scoped: Context) => {
    registerLoreRoute(scoped)
  })
  ctx.inject(['commands', 'llm', 'jobs', 'agents', 'sessionProjections'], (scoped: Context) => {
    registerLoreCommand(scoped)
  })

  // Card start: write the initial state and the opening the browser cannot.
  ctx.inject(['webServer', 'sessions', 'sessionProjections'], (scoped: Context) => {
    registerStartRoute(scoped)
  })

  // Card workspace (issue #37): one workspace per card is the save-grouping
  // drawer; the registry is probed lazily per request so a host without it
  // degrades the client flow to ungrouped instead of never arming.
  ctx.inject(['webServer'], (scoped: Context) => {
    registerCardWorkspaceRoute(scoped)
  })

  // Copilot: the player's omniscient advisor in the third right-sidebar tab.
  // Conversation history lives on the host Storage domain (never the session
  // log, issue #21); her writes ride the same published lanes with actor 'copilot'.
  ctx.inject(['webServer', 'sessions', 'sessionProjections', 'llm', 'agents', 'storageDomain'], (scoped: Context) => {
    registerCopilotRoute(scoped)
  })

  // Worldline map (issue #28): turn facts for the client-side tree fold and
  // the soft-hide ledger; lineage itself stays the host's own sessions data.
  // No storageDomain precondition: the worldline store degrades to an
  // in-memory ledger when the domain service is absent (issue #36).
  ctx.inject(['webServer', 'sessions', 'sessionProjections'], (scoped: Context) => {
    registerWorldlineRoute(scoped)
  })

  // Summarizer: macro compass every N turns; the /summary command toggles it.
  ctx.inject(['jobs', 'llm', 'agents', 'sessionProjections'], (scoped: Context) => {
    registerSummarizer(scoped, PRESET_ID)
  })
  ctx.inject(['commands', 'sessionProjections'], (scoped: Context) => {
    registerSummaryCommand(scoped)
  })

  // Lifecycle cleanup (P0-4): clean up in-memory caches when sessions or agents are disposed.
  ctx.inject(['sessions'], (scoped: Context) => {
    scoped.effect(() => {
      const runtime = scoped as unknown as { on(event: string, listener: (...args: unknown[]) => void): () => void }
      return runtime.on('session/disposed', (...args: unknown[]) => {
        const sessionId = extractSessionId(args[0])
        if (sessionId !== undefined) cleanupSession(sessionId)
      })
    }, 'dsh-rrp: session disposal cleanup')
  })

  ctx.inject(['agents'], (scoped: Context) => {
    scoped.effect(() => {
      const runtime = scoped as unknown as { on(event: string, listener: (...args: unknown[]) => void): () => void }
      return runtime.on('agent/disposed', (...args: unknown[]) => {
        const sessionId = extractSessionId(args[0])
        if (sessionId !== undefined) cleanupSession(sessionId)
      })
    }, 'dsh-rrp: agent disposal cleanup')
  })

  // Runtime-unload path: module caches only clear on disposal events, which
  // never fire for still-live sessions — drop them explicitly on unload.
  ctx.effect(() => {
    return () => {
      cleanupAllSessions()
    }
  }, 'dsh-rrp: unload cache reset')
}

/** Clean up all in-memory state and caches associated with a session (P0-4). */
export function cleanupSession(sessionId: string): void {
  forgetState(sessionId)
  forgetActivity(sessionId)
  forgetLore(sessionId)
  forgetSummary(sessionId)
  forgetInference(sessionId)
  forgetCopilot(sessionId)
  forgetProposals(sessionId)
}

/**
 * Plugin-unload path (the plugin manager unloads bundles at runtime): the
 * per-session disposal events never fire for live sessions, so every module
 * cache must be dropped here to keep a reload clean.
 */
export function cleanupAllSessions(): void {
  forgetAllState()
  forgetAllActivity()
  forgetAllLore()
  forgetAllSummary()
  forgetAllInference()
  forgetAllCopilot()
  forgetAllProposals()
}

/** Resolve a Session id from an event payload. */
export function extractSessionId(arg: unknown): string | undefined {
  if (typeof arg === 'string' && arg.length > 0) return arg
  if (!arg || typeof arg !== 'object') return undefined
  const obj = arg as Record<string, unknown>
  if (typeof obj.id === 'string' && obj.id.length > 0) return obj.id
  if (obj.session && typeof obj.session === 'object') {
    const session = obj.session as Record<string, unknown>
    if (typeof session.id === 'string' && session.id.length > 0) return session.id
  }
  if (obj.agent && typeof obj.agent === 'object') {
    const agent = obj.agent as Record<string, unknown>
    if (agent.session && typeof agent.session === 'object') {
      const session = agent.session as Record<string, unknown>
      if (typeof session.id === 'string' && session.id.length > 0) return session.id
    }
    if (typeof agent.id === 'string' && agent.id.length > 0) return agent.id
  }
  return undefined
}

/** Comma-joined skill names, or `(none)`. */
function skillNames(catalog: Array<{ name: string }>): string {
  const names = catalog.map((entry) => entry.name).join(', ')
  return names.length > 0 ? names : '(none)'
}

/** Probe the roster: the RP preset must be discoverable and composable. */
async function verifyPreset(ctx: Context): Promise<void> {
  try {
    const readable = ctx as unknown as { get(name: string): unknown }
    const presets = readable.get('agentPresets') as AgentPresetsService
    const preset = await presets.resolve(PRESET_ID)
    if (preset.broken !== undefined) {
      console.warn(`${TAG} RP mode '${PRESET_ID}' is broken: ${preset.broken}`)
      return
    }
    const scope = await presets.standingKeyFor(PRESET_ID)
    console.log(`${TAG} RP mode '${preset.name ?? PRESET_ID}' composed and ready`)

    // Verify each preset's scope discovers exactly the bundles it should: the
    // base RP mode carries no card lore, and each card preset carries only its
    // own (the isolation the scoped-preset design exists for).
    const skills = readable.get('skills') as SkillsService | undefined
    if (skills !== undefined) {
      const base = await skills.list({ scope })
      console.log(`${TAG} RP skills visible (${base.length}): ${skillNames(base)}`)
      for (const meta of listCards()) {
        const cardPresetId = presetIdForCard(meta.id)
        try {
          const cardPreset = await presets.resolve(cardPresetId)
          if (cardPreset.broken !== undefined) {
            console.warn(`${TAG} card preset '${cardPresetId}' is broken: ${cardPreset.broken}`)
            continue
          }
          const cardScope = await presets.standingKeyFor(cardPresetId)
          const catalog = await skills.list({ scope: cardScope })
          console.log(`${TAG} card preset '${cardPresetId}' skills (${catalog.length}): ${skillNames(catalog)}`)
        } catch (error) {
          console.warn(`${TAG} card preset '${cardPresetId}' verification failed:`, error)
        }
      }
    }
  } catch (error) {
    console.warn(`${TAG} RP mode verification failed:`, error)
  }
}
