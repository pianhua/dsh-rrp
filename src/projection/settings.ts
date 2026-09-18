/** dsh-rrp — pure Session projection for per-save player settings. */
import { z } from 'zod'
import { SUMMARY_EVERY_MAX, SUMMARY_EVERY_MIN, DEFAULT_RRP_SETTINGS, RRP_SETTINGS_KEY, type RrpSettings } from '../settings.ts'
import { rrpPayloadOf } from '../state-payload.ts'

export const rrpSettingsSchema = z.object({
  summaryEnabled: z.boolean(),
  // `catch` doubles as the migration default for pre-cadence settings events.
  summaryEveryTurns: z.number().int().min(SUMMARY_EVERY_MIN).max(SUMMARY_EVERY_MAX).catch(DEFAULT_RRP_SETTINGS.summaryEveryTurns),
})

/** Fold the newest valid whole-value settings payload. */
export const settingsProjection = {
  key: RRP_SETTINGS_KEY,
  stateSchema: rrpSettingsSchema,
  stateVersion: 1,
  init: (): RrpSettings => ({ ...DEFAULT_RRP_SETTINGS }),
  apply: (state: RrpSettings, event: { type: string; data?: unknown }): RrpSettings => {
    const candidate = rrpPayloadOf(event)?.settings
    if (candidate === undefined) return state
    const parsed = rrpSettingsSchema.safeParse(candidate)
    return parsed.success ? parsed.data : state
  },
  wire: {
    viewSchema: rrpSettingsSchema,
    view: (state: RrpSettings): RrpSettings => state,
  },
}
