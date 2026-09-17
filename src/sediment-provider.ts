/**
 * dsh-rrp — the worldline-scoped sediment skill provider.
 *
 * Registered through the AGENT-scoped context (`agent.ctx`), so its layer is
 * visible to exactly one agent/session: the one whose worldline produced the lore.
 * That is the host's own scoping mechanism — no per-session preset, no global
 * leak.
 *
 * The provider reads the owning Session's projection on every catalog read.
 * A write only invalidates the official skill catalog; no sidecar store exists
 * on the active path.
 */
import type { SedimentEntry } from './sediment-state.ts'

/** Unique provider name within one agent layer. */
export const SEDIMENT_PROVIDER = 'dsh-rrp-sediment'
/** Discovery source label shown to the model. */
export const SEDIMENT_SOURCE = 'dsh-rrp/sediment'
/** Between runtime (250) and custom (300): a session's own lore is near-first. */
export const SEDIMENT_RANK = 260

/** One candidate (local structural face of the host's SkillCandidate). */
export interface SedimentCandidate {
  name: string
  description: string
  invocation: { modelInvocable: boolean; userInvocable: boolean }
  source: string
  provider: string
  rank: number
  locator: unknown
  path?: string
}

/** One loaded definition (local structural face of the host's SkillDefinition). */
export interface SedimentDefinition extends SedimentCandidate {
  content: string
  resourceBase?: { kind: 'directory'; path: string }
}

/** The provider face the host registry calls. */
export interface SedimentProvider {
  name: string
  list(options: { cwd?: string; signal?: AbortSignal }): Promise<readonly SedimentCandidate[]>
  get(candidate: SedimentCandidate, options: { cwd?: string; signal?: AbortSignal }): Promise<SedimentDefinition | undefined>
}

/** The per-registration lifecycle control the host hands us. */
export interface SedimentProviderControl {
  signal: AbortSignal
  invalidate(): void
}

/**
 * Build the provider for one worldline.
 * @param options.sessionId - the owning Session id.
 * @param options.read - live read of the owning Session projection.
 * @returns a read-only provider over that Session's dynamic lore.
 */
export function createSedimentProvider(options: { sessionId: string; read: () => readonly SedimentEntry[] }): SedimentProvider {
  return {
    name: SEDIMENT_PROVIDER,
    async list(): Promise<readonly SedimentCandidate[]> {
      return options.read().map((skill) => ({
        name: skill.name,
        description: skill.description,
        invocation: { modelInvocable: true, userInvocable: true },
        source: SEDIMENT_SOURCE,
        provider: SEDIMENT_PROVIDER,
        rank: SEDIMENT_RANK,
        locator: skill.name,
      }))
    },
    async get(candidate: SedimentCandidate): Promise<SedimentDefinition | undefined> {
      const draft = options.read().find((skill) => skill.name === candidate.name)
      if (draft === undefined) return undefined
      return {
        name: draft.name,
        description: draft.description,
        content: draft.body,
        invocation: { modelInvocable: true, userInvocable: true },
        source: SEDIMENT_SOURCE,
        provider: SEDIMENT_PROVIDER,
        rank: SEDIMENT_RANK,
        locator: candidate.locator,
      }
    },
  }
}
