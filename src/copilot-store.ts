/**
 * dsh-rrp — Copilot conversation history on the host Storage domain (issue #21).
 *
 * The advisor's transcript must never enter the session log (the Author must
 * not see the player's private channel), but "out of the log" never meant
 * "self-managed file island": the host storage domain gives the middle ground
 * — plugin-owned records, host-owned durability (atomic writes, schema
 * validation at the durable boundary, lifecycle under the plugin disposer).
 *
 * Fork semantics are deliberate: a record is keyed by sessionId, so a forked
 * worldline starts with an empty advisor. The Copilot's context belongs to the
 * worldline she advised on; carrying her over would quote prose that never
 * happened on the new branch.
 *
 * `node:fs` survives here ONLY to read sidecar files this plugin wrote before
 * the migration; nothing new is ever written to them.
 */
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { worldStateSchema } from './projection/world-state.ts'
import { harnessHome } from './home.ts'
import type { CopilotTurn, CopilotTurnAction } from './route-contract.ts'

const TAG = '[dsh-rrp]'

// ---------------------------------------------------------------------------
// Record vocabulary. The turn/action types are contract vocabulary
// (src/route-contract.ts, shared with the panel); this module owns the schema.

export type { CopilotTurn, CopilotTurnAction } from './route-contract.ts'

export interface CopilotUndoEntry {
  id: string
  at: string
  /** Human digest of what the turn changed (shown on the undo card). */
  digest: string
  /** The WorldState before the turn's world-state actions ran. */
  snapshot: import('./world-state.ts').WorldState
}

export interface CopilotStore {
  version: 1
  turns: CopilotTurn[]
  undo: CopilotUndoEntry[]
}

/** What the panel GETs: recent turns + undo depth. */
export interface CopilotHistoryView {
  turns: CopilotTurn[]
  undoCount: number
}

const turnActionSchema = z.union([
  z.object({ kind: z.literal('world-state'), digest: z.string() }),
  z.object({ kind: z.literal('lore'), name: z.string() }),
  z.object({ kind: z.literal('failed'), error: z.string() }),
])

const turnSchema = z.object({
  role: z.enum(['player', 'copilot']),
  text: z.string(),
  at: z.string(),
  actions: z.array(turnActionSchema).optional(),
})

const undoEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  digest: z.string(),
  // worldStateSchema keeps `relations` optional for pre-relations legacy logs;
  // every folded state carries it, so the stored shape is the declared type.
  snapshot: worldStateSchema as unknown as z.ZodType<import('./world-state.ts').WorldState>,
})

const copilotStoreSchema = z.object({
  version: z.literal(1),
  turns: z.array(turnSchema),
  undo: z.array(undoEntrySchema),
})

export const copilotDomainSpec = defineDomain({
  name: 'dsh_rrp_copilot',
  version: 1,
  tables: { history: domainTable<string, CopilotStore>(copilotStoreSchema) },
})

export function emptyCopilotStore(): CopilotStore {
  return { version: 1, turns: [], undo: [] }
}

// ---------------------------------------------------------------------------
// Legacy sidecar (pre-#21 plugin-written files) — read once, then superseded.

let legacyDir = join(harnessHome(), '.dsh-rrp', 'copilot')

/** Test hook: point the legacy reader at a fixture dir. */
export function setCopilotLegacyDirForTesting(dir: string): void {
  legacyDir = dir
}

function legacyPath(sessionId: string): string {
  return join(legacyDir, sessionId + '.json')
}

/** Parse one sidecar file; anything unusable reads as "no legacy history". */
function readLegacy(sessionId: string): CopilotStore | undefined {
  try {
    const parsed = JSON.parse(readFileSync(legacyPath(sessionId), 'utf8')) as Record<string, unknown>
    if (!Array.isArray(parsed.turns) || !Array.isArray(parsed.undo)) return undefined
    // Sidecars predate the action union: 'sediment' was renamed to 'lore', and
    // unknown shapes must not cost the whole transcript — degrade them to a
    // failed marker so the panel still renders the turn.
    const turns = (parsed.turns as Array<Record<string, unknown>>).flatMap((turn) => {
      if ((turn.role !== 'player' && turn.role !== 'copilot') || typeof turn.text !== 'string' || typeof turn.at !== 'string') return []
      const actions = Array.isArray(turn.actions)
        ? turn.actions.map((entry): CopilotTurnAction => {
            const action = entry as Record<string, unknown> | null
            if (action?.kind === 'lore' || action?.kind === 'sediment') return { kind: 'lore', name: String(action.name ?? '') }
            if (action?.kind === 'world-state' && typeof action.digest === 'string') return { kind: 'world-state', digest: action.digest }
            if (action?.kind === 'failed' && typeof action.error === 'string') return { kind: 'failed', error: action.error }
            return { kind: 'failed', error: 'legacy action record' }
          })
        : undefined
      return [{ role: turn.role as 'player' | 'copilot', text: turn.text, at: turn.at, ...(actions !== undefined ? { actions } : {}) }]
    })
    // One undo snapshot failing validation drops only itself, never the chat.
    const undo = (parsed.undo as Array<Record<string, unknown>>).flatMap((entry) => {
      const snapshot = worldStateSchema.safeParse(entry?.snapshot)
      if (!snapshot.success || typeof entry.id !== 'string' || typeof entry.at !== 'string' || typeof entry.digest !== 'string') return []
      return [{ id: entry.id, at: entry.at, digest: entry.digest, snapshot: snapshot.data as CopilotUndoEntry['snapshot'] }]
    })
    return { version: 1, turns, undo }
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// The handle copilot.ts works through.

export interface CopilotStoreHandle {
  /** Synchronous authoritative read (domain memory; never goes around the write chain). */
  load(sessionId: string): CopilotStore
  /**
   * Atomic read-modify-write on the domain write chain. `fn` receives a
   * private draft (mutate freely, incl. array reassignment) and its return
   * value is handed back after the write is durable.
   */
  mutate<R>(sessionId: string, fn: (draft: CopilotStore) => R): Promise<R>
  /** Clear one session's history (domain record + any leftover sidecar). */
  remove(sessionId: string): Promise<void>
  close(): Promise<void>
}

interface DomainFacilityLike {
  open(spec: typeof copilotDomainSpec): Promise<{
    table(name: 'history'): {
      get(key: string): CopilotStore | undefined
      put(key: string, value: CopilotStore): Promise<void>
      update(key: string, fn: (current: CopilotStore) => CopilotStore): Promise<CopilotStore>
      delete(key: string): Promise<boolean>
    }
    close(): Promise<void>
  }>
}

/**
 * Open the copilot domain over the host facility. Returns undefined when the
 * profile has no storage-domain service — the caller then keeps an
 * in-memory-only handle (history dies with the process; nothing is written
 * to disk, so no file island sneaks back).
 */
export async function openCopilotStore(
  get: (name: string) => unknown,
): Promise<{ handle: CopilotStoreHandle; viaHost: boolean }> {
  const facility = get('storageDomain') as DomainFacilityLike | undefined
  if (facility === undefined) {
    console.warn(TAG + ' copilot history in memory-only mode (storageDomain unavailable)')
    return { handle: memoryHandle(), viaHost: false }
  }
  const domain = await facility.open(copilotDomainSpec)
  const table = domain.table('history')
  const handle: CopilotStoreHandle = {
    load(sessionId) {
      const stored = table.get(sessionId)
      if (stored !== undefined) return stored
      const legacy = readLegacy(sessionId)
      if (legacy !== undefined) {
        void table.put(sessionId, legacy).then(() => unlinkSafe(legacyPath(sessionId)))
        return legacy
      }
      return emptyCopilotStore()
    },
    async mutate(sessionId, fn) {
      if (table.get(sessionId) === undefined) await table.put(sessionId, handle.load(sessionId))
      let result!: ReturnType<typeof fn>
      await table.update(sessionId, (current) => {
        const draft: CopilotStore = { version: 1, turns: [...current.turns], undo: [...current.undo] }
        result = fn(draft)
        return draft
      })
      return result
    },
    async remove(sessionId) {
      await table.delete(sessionId)
      unlinkSafe(legacyPath(sessionId))
    },
    close: () => domain.close(),
  }
  return { handle, viaHost: true }
}

function unlinkSafe(path: string): void {
  try {
    if (existsSync(path)) unlinkSync(path)
  } catch {
    /* a sidecar we cannot remove is already superseded in the domain */
  }
}

/** Fallback when no host storage exists: same semantics, process-lifetime. */
function memoryHandle(): CopilotStoreHandle {
  const records = new Map<string, CopilotStore>()
  const read = (sessionId: string): CopilotStore =>
    records.get(sessionId) ?? readLegacy(sessionId) ?? emptyCopilotStore()
  return {
    load: read,
    async mutate(sessionId, fn) {
      const current = read(sessionId)
      const draft: CopilotStore = { version: 1, turns: [...current.turns], undo: [...current.undo] }
      const result = fn(draft)
      records.set(sessionId, draft)
      return result
    },
    async remove(sessionId) {
      records.delete(sessionId)
      unlinkSafe(legacyPath(sessionId))
    },
    close: async () => {},
  }
}
