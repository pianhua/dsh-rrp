/**
 * Type surface for scripts/host-runtime.mjs, shared by the dev host-runner and the E2E harness.
 * Declaration-file-per-script-module is this repository's existing convention (see
 * host-runner-ownership.d.mts); scripts stay plain .mjs so `node` can run them without a loader.
 */

/**
 * Locate `@deepseek-ai/dsh` `lib/bin.js`, probing the repo install, the pinned host at
 * `~/.dsh-rrp/host`, then the global npm root.
 */
export function resolveDshBin(repoRoot: string): string | null

/**
 * The `@deepseek-ai` scope directory that owns the resolved binary, so a harness links the same
 * runtime scope the host actually loads.
 */
export function resolveDshScope(repoRoot: string): string | null

/** Copy of `base` (default `process.env`) with every proxy variable removed. */
export function getCleanEnv(base?: NodeJS.ProcessEnv): NodeJS.ProcessEnv
