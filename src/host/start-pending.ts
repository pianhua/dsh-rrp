/**
 * dsh-rrp — lazy-opening pending store (ADR 0028 / issue 06).
 *
 * Between POST /dsh-rrp/start and the session's first player turn the log must
 * stay empty (any pre-written closed turn collides with the host loop's frozen
 * turn counter at cold read; any surface append before the first system commit
 * breaks the protected-head rule). The start payload therefore waits here, in
 * the host storage domain, keyed by sessionId — restart-safe, out of the log,
 * out of the transcript — until the opening materializer consumes it at the
 * first turn's first system/message event. Disposal clears the record.
 */
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { CardContext } from '../cards/card-types.ts'
import type { WorldState } from '../world-state/world-state.ts'
import type { WorldStateTimelineBatch } from '../world-state/world-state-timeline.ts'

export interface StartPending {
  card?: CardContext
  state?: WorldState
  baseline?: WorldStateTimelineBatch
  /** Raw opening prose; player-name interpolation happens at materialize time. */
  opening?: string
  /** Set once the facts rode an agent/pre-step decision into the log. */
  factsInjected?: boolean
}

// The route validates card/state before saving; the table schema stays loose on
// purpose (passthrough of already-validated JSON), same trust level as the
// worldline hide ledger.
const pendingSchema = z.looseObject({}) as unknown as z.ZodType<StartPending>

export const startPendingDomainSpec = defineDomain({
  name: 'dsh_rrp_start_pending',
  version: 1,
  tables: { pending: domainTable<string, StartPending>(pendingSchema) },
})

export interface StartPendingHandle {
  /** Synchronous read; undefined when nothing waits for this session. */
  peek(sessionId: string): StartPending | undefined
  save(sessionId: string, value: StartPending): Promise<void>
  /** Fire-and-forget delete (called from synchronous event listeners). */
  clear(sessionId: string): void
  close(): Promise<void>
}

interface DomainFacilityLike {
  open(spec: unknown): Promise<{
    table(name: string): {
      get(key: string): StartPending | undefined
      put(key: string, value: StartPending): Promise<void>
      delete(key: string): Promise<boolean>
    }
    close(): Promise<void>
  }>
}

function memoryHandle(): StartPendingHandle & { viaHost: boolean } {
  const map = new Map<string, StartPending>()
  return {
    viaHost: false,
    peek: (id) => map.get(id),
    async save(id, value) {
      map.set(id, value)
    },
    clear(id) {
      map.delete(id)
    },
    async close() {},
  }
}

/**
 * Open the pending domain over the host facility. Memory-only fallback when the
 * profile has no storage-domain service (pending then dies with the process —
 * the materializer simply never fires after a restart, and the opening is lost,
 * same degradation as copilot history).
 */
export async function openStartPending(
  get: (name: string) => unknown,
): Promise<{ handle: StartPendingHandle; viaHost: boolean }> {
  const facility = get('storageDomain') as DomainFacilityLike | undefined
  if (facility === undefined) {
    console.warn('[dsh-rrp] start pending in memory-only mode (storageDomain unavailable)')
    return { handle: memoryHandle(), viaHost: false }
  }
  const domain = await facility.open(startPendingDomainSpec)
  const table = domain.table('pending')
  return {
    viaHost: true,
    handle: {
      peek: (id) => table.get(id),
      save: async (id, value) => {
        await table.put(id, value)
      },
      clear: (id) => {
        void table.delete(id).catch(() => {})
      },
      close: () => domain.close(),
    },
  }
}
