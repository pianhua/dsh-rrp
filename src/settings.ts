/** dsh-rrp — small, session-scoped player settings. */

/** Stable projection key exposed to the host and extension plugins. */
export const RRP_SETTINGS_KEY = 'rrpSettings'

/** Bounds for the Summarizer cadence (completed turns between passes). */
export const SUMMARY_EVERY_MIN = 1
export const SUMMARY_EVERY_MAX = 50

/** Settings that alter one RP save, never the whole plugin process. */
export interface RrpSettings {
  summaryEnabled: boolean
  /** Summarize every N completed turns (`/summary every N`). */
  summaryEveryTurns: number
}

/** Defaults used until a Session records its first explicit setting event. */
export const DEFAULT_RRP_SETTINGS: Readonly<RrpSettings> = Object.freeze({
  summaryEnabled: true,
  summaryEveryTurns: 8,
})

/** Clamp an arbitrary value to a legal cadence, falling back to the default. */
export function clampSummaryEveryTurns(value: unknown): number {
  const number = typeof value === 'number' ? Math.round(value) : Number.NaN
  if (Number.isNaN(number)) return DEFAULT_RRP_SETTINGS.summaryEveryTurns
  return Math.min(SUMMARY_EVERY_MAX, Math.max(SUMMARY_EVERY_MIN, number))
}

/** Coerce an unknown projection value to the stable settings shape. */
export function rrpSettingsOf(value: unknown): RrpSettings {
  const record = (value as { summaryEnabled?: unknown; summaryEveryTurns?: unknown } | null | undefined)
  return {
    summaryEnabled: typeof record?.summaryEnabled === 'boolean'
      ? record.summaryEnabled
      : DEFAULT_RRP_SETTINGS.summaryEnabled,
    summaryEveryTurns: clampSummaryEveryTurns(record?.summaryEveryTurns),
  }
}
