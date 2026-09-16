/**
 * dsh-rrp — the activity-ledger session-projection unit.
 *
 * Unlike WorldState (whole-value adoption), the ledger is append-only: each
 * `rrp/activity` event folds into the bounded tail. Unrelated events return
 * the SAME reference, so the registry's Object.is gate publishes nothing.
 */
import { z } from 'zod'
import {
  ACTIVITY_EVENT,
  ACTIVITY_KEY,
  appendActivity,
  emptyActivityLog,
  type RrpActivity,
  type RrpActivityLog,
} from '../activity.ts'

const activitySchema = z.object({
  id: z.string(),
  at: z.string(),
  actor: z.enum(['chronicler', 'summarizer', 'player']),
  target: z.enum(['world-state', 'summary']),
  phase: z.enum(['started', 'committed', 'failed', 'corrected']),
  detail: z.string().optional(),
})

const stateSchema = z.object({ entries: z.array(activitySchema) })

/** The projection definition registered into `ctx.sessionProjections`. */
export const activityProjection = {
  key: ACTIVITY_KEY,
  stateSchema,
  stateVersion: 1,
  init: (): RrpActivityLog => emptyActivityLog(),
  apply: (state: RrpActivityLog, event: { type: string; data?: unknown }): RrpActivityLog =>
    event.type === ACTIVITY_EVENT && event.data !== undefined && event.data !== null
      ? appendActivity(state, event.data as RrpActivity)
      : state,
  wire: {
    viewSchema: stateSchema,
    view: (state: RrpActivityLog): RrpActivityLog => state,
  },
}
