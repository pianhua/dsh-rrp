/**
 * dsh-rrp — host half.
 *
 * Stage 2 materializes the RP mode (a native DSH agent preset carrying the
 * Author persona — see presets/rp/). Stage 3 registers the WorldState session
 * projection the right-sidebar panel reads.
 *
 * Chronicler / Skills logic arrives in later stages — see docs/ACTIVE_TASK.md.
 */
import type { Context } from '@deepseek-ai/cordis'
import { registerAuthorContext } from './author-context.ts'
import { registerChronicler } from './chronicler.ts'
import { registerCorrectionRoute } from './correction.ts'
import { PRESET_ID, cleanupPreset, materializePreset } from './preset.ts'
import { summaryProjection } from './projection/summary.ts'
import { worldStateProjection } from './projection/world-state.ts'
import { registerSummarizer, registerSummaryCommand } from './summarizer.ts'

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
  register(definition: typeof worldStateProjection | typeof summaryProjection): () => void
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
  ctx.inject(['sessionProjections'], (scoped: Context) => {
    const readable = scoped as unknown as { get(name: string): unknown }
    const registry = readable.get('sessionProjections') as SessionProjectionsService | undefined
    if (registry === undefined) return
    registry.register(worldStateProjection)
    console.log(`${TAG} WorldState projection registered (key '${worldStateProjection.key}')`)
    registry.register(summaryProjection)
    console.log(`${TAG} macro-summary projection registered (key '${summaryProjection.key}')`)
  })

  // Roster probe: deferred until agent-presets activates, disposed with this fiber.
  ctx.inject(['agentPresets'], (scoped: Context) => {
    void verifyPreset(scoped)
  })

  // Chronicler: armed only when every host seam it needs is present.
  ctx.inject(['jobs', 'llm', 'agents', 'sessionProjections'], (scoped: Context) => {
    registerChronicler(scoped, PRESET_ID)
  })

  // Author: consume the latest WorldState as a per-step fact baseline.
  ctx.inject(['sessionProjections'], (scoped: Context) => {
    registerAuthorContext(scoped, PRESET_ID)
  })

  // Player correction: the panel's write path into the session log (D6).
  ctx.inject(['webServer', 'sessions'], (scoped: Context) => {
    registerCorrectionRoute(scoped)
  })

  // Summarizer: macro compass every N turns; the /summary command toggles it.
  ctx.inject(['jobs', 'llm', 'agents', 'sessionProjections'], (scoped: Context) => {
    registerSummarizer(scoped, PRESET_ID)
  })
  ctx.inject(['commands'], (scoped: Context) => {
    registerSummaryCommand(scoped)
  })
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

    // Verify the RP scope's skill catalog actually discovers the bundled bundles.
    const skills = readable.get('skills') as SkillsService | undefined
    if (skills !== undefined) {
      const catalog = await skills.list({ scope })
      const names = catalog.map((entry) => entry.name).join(', ')
      console.log(`${TAG} RP skills visible (${catalog.length}): ${names.length > 0 ? names : '(none)'}`)
    }
  } catch (error) {
    console.warn(`${TAG} RP mode verification failed:`, error)
  }
}
