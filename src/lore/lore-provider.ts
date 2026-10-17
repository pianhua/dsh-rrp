/**
 * dsh-rrp — the worldline-scoped lore skill provider.
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
import type { LoreEntry } from './lore-state.ts'

/** Unique provider name within one agent layer. */
export const LORE_PROVIDER = 'dsh-rrp-lore'
/** Discovery source label shown to the model. */
export const LORE_SOURCE = 'dsh-rrp/lore'
/** Between runtime (250) and custom (300): a session's own lore is near-first. */
export const LORE_RANK = 260

/** One candidate (local structural face of the host's SkillCandidate). */
export interface LoreCandidate {
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
export interface LoreDefinition extends LoreCandidate {
  content: string
  resourceBase?: { kind: 'directory'; path: string }
}

/** The provider face the host registry calls. */
export interface LoreProvider {
  name: string
  list(options: { cwd?: string; signal?: AbortSignal }): Promise<readonly LoreCandidate[]>
  get(
    candidate: LoreCandidate,
    options: { cwd?: string; signal?: AbortSignal },
  ): Promise<LoreDefinition | undefined>
}

/** The per-registration lifecycle control the host hands us. */
export interface LoreProviderControl {
  signal: AbortSignal
  invalidate(): void
}

/**
 * Build the provider for one worldline.
 * @param options.sessionId - the owning Session id.
 * @param options.read - live read of the owning Session projection.
 * @returns a read-only provider over that Session's dynamic lore.
 */
export function createLoreProvider(options: {
  sessionId: string
  read: () => readonly LoreEntry[]
}): LoreProvider {
  return {
    name: LORE_PROVIDER,
    async list(): Promise<readonly LoreCandidate[]> {
      return options.read().map((skill) => ({
        name: skill.name,
        description: skill.description,
        invocation: { modelInvocable: true, userInvocable: true },
        source: LORE_SOURCE,
        provider: LORE_PROVIDER,
        rank: LORE_RANK,
        locator: skill.name,
      }))
    },
    async get(candidate: LoreCandidate): Promise<LoreDefinition | undefined> {
      const draft = options.read().find((skill) => skill.name === candidate.name)
      if (draft === undefined) return undefined
      return {
        name: draft.name,
        description: draft.description,
        content: draft.body,
        invocation: { modelInvocable: true, userInvocable: true },
        source: LORE_SOURCE,
        provider: LORE_PROVIDER,
        rank: LORE_RANK,
        locator: candidate.locator,
      }
    },
  }
}
