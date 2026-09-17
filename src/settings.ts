/** dsh-rrp — small, session-scoped player settings. */

/** Stable projection key exposed to the host and extension plugins. */
export const RRP_SETTINGS_KEY = 'rrpSettings'

/** Settings that alter one RP save, never the whole plugin process. */
export interface RrpSettings {
  summaryEnabled: boolean
}

/** Defaults used until a Session records its first explicit setting event. */
export const DEFAULT_RRP_SETTINGS: Readonly<RrpSettings> = Object.freeze({ summaryEnabled: true })

/** Coerce an unknown projection value to the stable settings shape. */
export function rrpSettingsOf(value: unknown): RrpSettings {
  const summaryEnabled = (value as { summaryEnabled?: unknown } | null | undefined)?.summaryEnabled
  return { summaryEnabled: typeof summaryEnabled === 'boolean' ? summaryEnabled : DEFAULT_RRP_SETTINGS.summaryEnabled }
}
