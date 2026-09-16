/**
 * dsh-rrp — the macro-summary session-projection unit.
 *
 * Mirrors the WorldState projection: a whole-value `rrp/summary` event is
 * adopted as-is, unrelated events keep the same reference, and `wire.view`
 * reuses that reference so an unchanged summary publishes nothing.
 */
import { z } from 'zod'
import { SUMMARY_EVENT, SUMMARY_KEY, type MacroSummary } from '../macro-summary.ts'

/** Runtime validator for one macro summary. */
export const macroSummarySchema = z.object({
  goal: z.string(),
  conflict: z.string(),
  turningPoints: z.array(z.string()),
  threads: z.array(z.string()),
})

const stateSchema = z.union([macroSummarySchema, z.null()])

/** The projection definition registered into `ctx.sessionProjections`. */
export const summaryProjection = {
  key: SUMMARY_KEY,
  stateSchema,
  stateVersion: 1,
  init: (): MacroSummary | null => null,
  apply: (state: MacroSummary | null, event: { type: string; data?: unknown }): MacroSummary | null =>
    event.type === SUMMARY_EVENT && event.data !== undefined && event.data !== null
      ? (event.data as MacroSummary)
      : state,
  wire: {
    viewSchema: stateSchema,
    view: (state: MacroSummary | null): MacroSummary | null => state,
  },
}
