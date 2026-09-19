/**
 * dsh-rrp — worldline archive store (issue #28): the soft-hide ledger.
 *
 * "Hide a line" must never touch the host session (no delete, no archive
 * API games): the map simply prunes what this table lists. Same posture as
 * the copilot store (#21) — plugin-owned records, host-owned durability via
 * the storage domain, in-memory fallback when no domain service exists.
 */
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'

const hiddenRecordSchema = z.object({ at: z.string() })
type HiddenRecord = z.infer<typeof hiddenRecordSchema>

export const worldlineDomainSpec = defineDomain({
  name: 'dsh_rrp_worldlines',
  version: 1,
  tables: { hidden: domainTable<string, HiddenRecord>(hiddenRecordSchema) },
})

export interface WorldlineStoreHandle {
  /** All soft-archived session ids (map prunes these subtrees). */
  listHidden(): string[]
  setHidden(sessionId: string, hidden: boolean): Promise<void>
  close(): Promise<void>
}

interface DomainTableLike {
  get(key: string): HiddenRecord | undefined
  put(key: string, value: HiddenRecord): Promise<void>
  delete(key: string): Promise<boolean>
  keys?(): Iterable<string>
}
interface DomainLike {
  table(name: 'hidden'): DomainTableLike
  close(): Promise<void>
}
interface DomainFacilityLike {
  open(spec: typeof worldlineDomainSpec): Promise<DomainLike>
}

/** Open the archive domain, falling back to a process-lifetime memory set. */
export async function openWorldlineStore(get: (name: string) => unknown): Promise<{ handle: WorldlineStoreHandle; viaHost: boolean }> {
  const facility = get('storageDomain') as DomainFacilityLike | undefined
  if (facility === undefined) {
    console.warn('[dsh-rrp] worldline archive in memory-only mode (storageDomain unavailable)')
    return { handle: memoryHandle(), viaHost: false }
  }
  const domain = await facility.open(worldlineDomainSpec)
  const table = domain.table('hidden')
  return {
    viaHost: true,
    handle: {
      listHidden() {
        return table.keys === undefined ? [] : [...table.keys()]
      },
      async setHidden(sessionId, hidden) {
        if (hidden) await table.put(sessionId, { at: new Date().toISOString() })
        else await table.delete(sessionId)
      },
      close: () => domain.close(),
    },
  }
}

function memoryHandle(): WorldlineStoreHandle {
  const hidden = new Set<string>()
  return {
    listHidden: () => [...hidden],
    async setHidden(sessionId, value) {
      if (value) hidden.add(sessionId)
      else hidden.delete(sessionId)
    },
    close: async () => {},
  }
}
