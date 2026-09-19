/** dsh-rrp — pure Session projection for dynamic lore. */
import { z } from 'zod'
import {
  RRP_SEDIMENT_KEY,
  SEDIMENT_LIMITS,
  applySedimentChange,
  type SedimentEntry,
} from '../sediment-state.ts'
import { rrpPayloadOf } from '../state-payload.ts'

const nameSchema = z.string().min(1).max(SEDIMENT_LIMITS.nameChars).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
export const sedimentEntrySchema = z.object({
  name: nameSchema,
  description: z.string().min(1).max(SEDIMENT_LIMITS.descriptionChars),
  body: z.string().min(1).max(SEDIMENT_LIMITS.bodyChars),
})

const uniqueEntries = z.array(sedimentEntrySchema).max(SEDIMENT_LIMITS.skillsPerSession).refine(
  (entries) => new Set(entries.map((entry) => entry.name)).size === entries.length,
  'sediment skill names must be unique',
)

export const sedimentChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('snapshot'), skills: uniqueEntries }),
  z.object({ kind: z.literal('add'), skill: sedimentEntrySchema }),
  z.object({ kind: z.literal('remove'), name: nameSchema }),
])

/** Fold dynamic lore from known plugin message payloads. */
export const sedimentProjection = {
  key: RRP_SEDIMENT_KEY,
  stateSchema: uniqueEntries,
  stateVersion: 1,
  init: (): SedimentEntry[] => [],
  apply: (state: SedimentEntry[], event: { type: string; data?: unknown }): SedimentEntry[] => {
    const candidate = rrpPayloadOf(event)?.sediment
    if (candidate === undefined) return state
    const parsed = sedimentChangeSchema.safeParse(candidate)
    return parsed.success ? applySedimentChange(state, parsed.data) : state
  },
  wire: {
    viewSchema: uniqueEntries,
    view: (state: SedimentEntry[]): SedimentEntry[] => state,
  },
}
