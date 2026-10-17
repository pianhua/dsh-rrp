/**
 * scripts/host-runtime.mjs — Shared host-runtime discovery for the dev runner and the E2E harness.
 *
 * Both `host-runner.mjs` (manual dev flow) and `tests/e2e/support/isolated-host.mjs` need the same
 * two things: where the pinned DSH binary is, and an environment free of proxy pollution. Keeping a
 * second copy of either would let the E2E harness silently boot a different runtime than the one we
 * actually develop against.
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Locate `@deepseek-ai/dsh` `lib/bin.js` directly, bypassing the cmd wrapper.
 *
 * The dsh package ships no "main"/"exports" entry (bin-only ESM package), so require.resolve of the
 * bare specifier fails even when installed; resolve the bin subpath instead.
 *
 * @param repoRoot - repository root, probed first for a local dev install.
 * @returns absolute path to `lib/bin.js`, or null when no candidate exists.
 */
export function resolveDshBin(repoRoot) {
  const candidates = [join(repoRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')]
  try {
    candidates.push(
      join(
        process.env.USERPROFILE ?? process.env.HOME ?? '',
        '.dsh-rrp',
        'host',
        'node_modules',
        '@deepseek-ai',
        'dsh',
        'lib',
        'bin.js',
      ),
    )
  } catch {
    // ignore: no home directory to probe
  }
  try {
    const globalRoots = execSync('npm root -g', { encoding: 'utf8' }).trim()
    if (globalRoots) candidates.push(join(globalRoots, '@deepseek-ai', 'dsh', 'lib', 'bin.js'))
  } catch {
    // ignore: global lookup is best-effort
  }
  for (const binJs of candidates) {
    if (existsSync(binJs)) return binJs
  }
  return null
}

/**
 * The directory holding the installed `@deepseek-ai` scope that owns the resolved binary, so a
 * harness can link the same scope the host actually loads.
 *
 * @param repoRoot - repository root, probed first.
 * @returns absolute path to an `@deepseek-ai` directory, or null when the binary is unresolved.
 */
export function resolveDshScope(repoRoot) {
  const bin = resolveDshBin(repoRoot)
  return bin === null ? null : join(bin, '..', '..', '..')
}

/**
 * Environment copy with every proxy variable stripped. A SOCKS proxy silently empties LLM streams
 * (R5 lesson), so no host we boot may inherit one.
 *
 * @param base - environment to copy from; defaults to `process.env`.
 * @returns a proxy-free environment object.
 */
export function getCleanEnv(base = process.env) {
  const cleanEnv = { ...base }
  delete cleanEnv.ALL_PROXY
  delete cleanEnv.all_proxy
  delete cleanEnv.HTTP_PROXY
  delete cleanEnv.http_proxy
  delete cleanEnv.HTTPS_PROXY
  delete cleanEnv.https_proxy
  return cleanEnv
}
