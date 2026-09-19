/** dsh-rrp — pure Session projection for dynamic lore. */
import { z } from 'zod'
import {
  RRP_LORE_KEY,
  LORE_LIMITS,
  applyLoreChange,
  type LoreEntry,
} from '../lore-state.ts'
import { rrpPayloadOf } from '../state-payload.ts'

const nameSchema = z.string().min(1).max(LORE_LIMITS.nameChars).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
export const loreEntrySchema = z.object({
  name: nameSchema,
  description: z.string().min(1).max(LORE_LIMITS.descriptionChars),
  body: z.string().min(1).max(LORE_LIMITS.bodyChars),
})

const uniqueEntries = z.array(loreEntrySchema).max(LORE_LIMITS.skillsPerSession).refine(
  (entries) => new Set(entries.map((entry) => entry.name)).size === entries.length,
  'lore skill names must be unique',
)

export const loreChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('snapshot'), skills: uniqueEntries }),
  z.object({ kind: z.literal('add'), skill: loreEntrySchema }),
  z.object({ kind: z.literal('remove'), name: nameSchema }),
])

/** Fold dynamic lore from known plugin message payloads. */
export const loreProjection = {
  key: RRP_LORE_KEY,
  stateSchema: uniqueEntries,
  stateVersion: 1,
  init: (): LoreEntry[] => [],
  apply: (state: LoreEntry[], event: { type: string; data?: unknown }): LoreEntry[] => {
    const candidate = rrpPayloadOf(event)?.sediment
    if (candidate === undefined) return state
    const parsed = loreChangeSchema.safeParse(candidate)
    return parsed.success ? applyLoreChange(state, parsed.data) : state
  },
  wire: {
    viewSchema: uniqueEntries,
    view: (state: LoreEntry[]): LoreEntry[] => state,
  },
}
