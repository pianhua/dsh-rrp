/**
 * dsh-rrp — worldline archive store (issue #28): the soft-hide ledger + the
 * cold card-attribution index.
 *
 * "Hide a line" must never touch the host session (no delete, no archive
 * API games): the map simply prunes what this table lists. Same posture as
 * the copilot store (#21) — plugin-owned records, host-owned durability via
 * the storage domain, in-memory fallback when no domain service exists.
 *
 * The cards table is a DISPLAY cache, not a parallel truth: every entry is
 * copied from a LIVE session's rrpCard projection (topology and card
 * ownership still come from the host — sessions.list + projections when
 * live, header.preset as a cold hint). It exists because the host persists
 * agentPreset unreliably for gallery-started sessions ("standard" at the log
 * level), so a cold main line would otherwise vanish from its own card's map.
 */
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'

const hiddenRecordSchema = z.object({ at: z.string() })
type HiddenRecord = z.infer<typeof hiddenRecordSchema>

const cardRecordSchema = z.object({
  cardId: z.string(),
  cardName: z.string(),
  at: z.string(),
})
type CardRecord = z.infer<typeof cardRecordSchema>

const cutRecordSchema = z.object({
  parentId: z.string(),
  turn: z.number().int().min(0),
  at: z.string(),
})
type CutRecord = z.infer<typeof cutRecordSchema>

export const worldlineDomainSpec = defineDomain({
  name: 'dsh_rrp_worldlines',
  version: 1,
  tables: {
    hidden: domainTable<string, HiddenRecord>(hiddenRecordSchema),
    cards: domainTable<string, CardRecord>(cardRecordSchema),
    cuts: domainTable<string, CutRecord>(cutRecordSchema),
  },
})

export interface WorldlineStoreHandle {
  /** All soft-archived session ids (map prunes these subtrees). */
  listHidden(): string[]
  setHidden(sessionId: string, hidden: boolean): Promise<void>
  /**
   * Card attribution copied from a live session's rrpCard projection.
   * Fire-and-forget: failures are swallowed by the caller's context.
   */
  cardOf(sessionId: string): { cardId: string; cardName: string } | undefined
  setCard(sessionId: string, cardId: string, cardName: string): Promise<void>
  /**
   * Fork cut observed at fork time (childId → parent + absolute cut turn).
   * The host's sessionQuery.readSession cannot read seeded sessions on
   * 0.1.6-alpha.2 (snapshot invariant vs the end-seed marker), so this table
   * is what keeps cold fork positioning exact. Topology still comes from the
   * host header — this only supplies the display position.
   */
  cutOf(childId: string): { parentId: string; turn: number } | undefined
  setCut(childId: string, parentId: string, turn: number): Promise<void>
  close(): Promise<void>
}

interface HiddenTableLike {
  get(key: string): HiddenRecord | undefined
  put(key: string, value: HiddenRecord): Promise<void>
  delete(key: string): Promise<boolean>
  keys?(): Iterable<string>
  entries?(): Iterable<[string, HiddenRecord]>
}
interface CardsTableLike {
  get(key: string): CardRecord | undefined
  put(key: string, value: CardRecord): Promise<void>
  entries?(): Iterable<[string, CardRecord]>
}
interface CutsTableLike {
  get(key: string): CutRecord | undefined
  put(key: string, value: CutRecord): Promise<void>
}
interface DomainLike {
  table(name: 'hidden'): HiddenTableLike
  table(name: 'cards'): CardsTableLike
  table(name: 'cuts'): CutsTableLike
  close(): Promise<void>
}
interface DomainFacilityLike {
  open(spec: typeof worldlineDomainSpec): Promise<DomainLike>
}

/** Open the archive domain, falling back to a process-lifetime memory set. */
export async function openWorldlineStore(
  get: (name: string) => unknown,
): Promise<{ handle: WorldlineStoreHandle; viaHost: boolean }> {
  const facility = get('storageDomain') as DomainFacilityLike | undefined
  if (facility === undefined) {
    console.warn('[dsh-rrp] worldline archive in memory-only mode (storageDomain unavailable)')
    return { handle: memoryHandle(), viaHost: false }
  }
  const domain = await facility.open(worldlineDomainSpec)
  const hidden = domain.table('hidden')
  const cards = domain.table('cards')
  const cuts = domain.table('cuts')
  return {
    viaHost: true,
    handle: {
      listHidden() {
        if (hidden.keys !== undefined) return [...hidden.keys()]
        if (hidden.entries !== undefined) return [...hidden.entries()].map(([key]) => key)
        return []
      },
      async setHidden(sessionId, hiddenValue) {
        if (hiddenValue) await hidden.put(sessionId, { at: new Date().toISOString() })
        else await hidden.delete(sessionId)
      },
      cardOf(sessionId) {
        const record = cards.get(sessionId)
        return record === undefined
          ? undefined
          : { cardId: record.cardId, cardName: record.cardName }
      },
      async setCard(sessionId, cardId, cardName) {
        await cards.put(sessionId, { cardId, cardName, at: new Date().toISOString() })
      },
      cutOf(childId) {
        const record = cuts.get(childId)
        return record === undefined ? undefined : { parentId: record.parentId, turn: record.turn }
      },
      async setCut(childId, parentId, turn) {
        await cuts.put(childId, { parentId, turn, at: new Date().toISOString() })
      },
      close: () => domain.close(),
    },
  }
}

function memoryHandle(): WorldlineStoreHandle {
  const hidden = new Set<string>()
  const cards = new Map<string, { cardId: string; cardName: string }>()
  const cuts = new Map<string, { parentId: string; turn: number }>()
  return {
    listHidden: () => [...hidden],
    async setHidden(sessionId, value) {
      if (value) hidden.add(sessionId)
      else hidden.delete(sessionId)
    },
    cardOf: (sessionId) => cards.get(sessionId),
    async setCard(sessionId, cardId, cardName) {
      cards.set(sessionId, { cardId, cardName })
    },
    cutOf: (childId) => cuts.get(childId),
    async setCut(childId, parentId, turn) {
      cuts.set(childId, { parentId, turn })
    },
    close: async () => {},
  }
}
