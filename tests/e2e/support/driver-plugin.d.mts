/**
 * Type surface for tests/e2e/support/driver-plugin.mjs. Plain .mjs because the host loads
 * the driver plugin without a TypeScript loader; see stub-model.d.mts for the same pattern.
 */

export interface DriverSessionCreated {
  sessionId: string
  agentPreset?: string
}

export interface DriverPromptReceipt {
  accepted: true
}

export interface DriverObservedEvents {
  cursor: number
  revision: unknown
  header: unknown
  projections: unknown
  events: Array<{ seq: number; type: string; data?: unknown }>
}

export const name: string
export const inject: string[]
export function apply(ctx: unknown): void
