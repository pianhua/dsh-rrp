/**
 * Structural face of the client Cordis Context this plugin consumes.
 *
 * The service members are restated locally and combined with the vendored
 * cordis Context by INTERSECTION rather than module augmentation: DSH's own
 * host and client packages declare different types for the same member, so a
 * `declare module` re-declaration here would fail interface merging (TS2717).
 * This is the community pattern (see dsh-better-sidebar/src/context-types.ts).
 */
import type { Context as CordisContext } from '@deepseek-ai/cordis'

/** Options `ctx.slots.register` accepts (the subset this plugin uses). */
export interface RrpSlotRegisterOptions {
  name: string
  key?: string
  id?: string
  order?: number
  label?: string | (() => string)
  locale?: string
  inject?: (...args: never[]) => Record<string, unknown>
}

/** The client slot registry face (register/inject), mirror of the runtime. */
export interface RrpSlotsService {
  /** Register one component for a declared slot; returns the disposer. */
  register(options: RrpSlotRegisterOptions, component: unknown): () => void
  /** Run a callback for each declaration lifetime of a slot (no-op while undeclared). */
  inject(key: string, callback: () => () => void): () => void
}

/** The Context the client half sees. */
export type RrpClientContext = CordisContext & {
  slots: RrpSlotsService
}
