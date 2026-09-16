/**
 * dsh-rrp — host half.
 *
 * Stage 2: materializes the RP mode (a native DSH agent preset carrying the
 * Author persona — see presets/rp/) into the harness-home user preset root,
 * and verifies at boot that the roster discovers and can compose it.
 *
 * Author / Chronicler / WorldState / Skills logic arrives in later stages —
 * see docs/ACTIVE_TASK.md.
 */
import type { Context } from '@deepseek-ai/cordis'
import { PRESET_ID, cleanupPreset, materializePreset } from './preset.ts'

/** Loader row id. Keep in sync with cordis.patch.yml. */
export const name = 'dsh-rrp'

/** No host services are hard requirements; the roster is probed via ctx.get. */
export const inject: string[] = []

const TAG = '[dsh-rrp]'

/** Structural face of the host agent-preset roster this plugin probes. */
interface AgentPresetRow {
  id: string
  name?: string
  broken?: string
}
interface AgentPresetsService {
  resolve(id?: string): Promise<AgentPresetRow>
  standingKeyFor(id?: string): Promise<unknown>
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

  // Optional capability, but timing-sensitive: the agent-presets roster may
  // activate after this row. `ctx.inject` defers the probe until the service
  // exists and disposes it with this fiber, so a profile without a roster
  // simply never probes. Never block the load on it either way.
  ctx.inject(['agentPresets'], (scoped: Context) => {
    void verifyPreset(scoped)
  })
}

/** Probe the roster: the preset must be discoverable and composable. */
async function verifyPreset(ctx: Context): Promise<void> {
  try {
    const readable = ctx as unknown as { get(name: string): unknown }
    const presets = readable.get('agentPresets') as AgentPresetsService
    const preset = await presets.resolve(PRESET_ID)
    if (preset.broken !== undefined) {
      console.warn(`${TAG} RP mode '${PRESET_ID}' is broken: ${preset.broken}`)
      return
    }
    await presets.standingKeyFor(PRESET_ID)
    console.log(`${TAG} RP mode '${preset.name ?? PRESET_ID}' composed and ready`)
  } catch (error) {
    console.warn(`${TAG} RP mode verification failed:`, error)
  }
}
