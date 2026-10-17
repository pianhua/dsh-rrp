/**
 * Type surface for tests/e2e/support/stub-model.mjs, the stub-model Cordis plugin. It is loaded by
 * the host process, so the implementation stays plain .mjs.
 */

/** Provider id the isolated profile selects as `agent-default-model`. */
export const STUB_PROVIDER: string

export const name: string
export const inject: string[]

/** Cordis apply: registers the stub adapter on `ctx.llm`. */
export function apply(ctx: {
  llm: { registerAdapter: (providers: string[], adapter: unknown) => unknown }
}): void
