/**
 * dsh-rrp — the macro-summary session-projection unit.
 *
 * Mirrors the WorldState projection: a whole-value `source.rrp.summary`
 * payload is adopted as-is, unrelated events keep the same reference, and
 * `wire.view` reuses that reference so an unchanged summary publishes nothing.
 */
import { z } from 'zod'
import { SUMMARY_KEY, SUMMARY_LIMITS, type MacroSummary } from '../macro-summary.ts'
import { rrpPayloadOf } from '../state-payload.ts'

/**
 * Runtime validator for one macro summary. The list length is the hard half of
 * {@link SUMMARY_LIMITS.entries}; the character ceilings are not rejected here
 * because `parseSummarizerReply` clamps an over-long line instead — a
 * 41-character goal must never cost the Author the whole compass.
 */
export const macroSummarySchema = z.object({
  goal: z.string(),
  conflict: z.string(),
  turningPoints: z.array(z.string()).max(SUMMARY_LIMITS.entries),
  threads: z.array(z.string()).max(SUMMARY_LIMITS.entries),
})

const stateSchema = z.union([macroSummarySchema, z.null()])

/** The projection definition registered into `ctx.sessionProjections`. */
export const summaryProjection = {
  key: SUMMARY_KEY,
  stateSchema,
  stateVersion: 1,
  init: (): MacroSummary | null => null,
  apply: (state: MacroSummary | null, event: { type: string; data?: unknown }): MacroSummary | null => {
    const payload = rrpPayloadOf(event)
    return payload !== undefined && payload.summary !== undefined ? payload.summary : state
  },
  wire: {
    viewSchema: stateSchema,
    view: (state: MacroSummary | null): MacroSummary | null => state,
  },
}
