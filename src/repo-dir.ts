/**
 * dsh-rrp — bundle-aware repo-relative directory resolution.
 *
 * tsdown bundles every host module into lib/index.js, so at production runtime
 * `import.meta.url` is the bundle entry (lib/, shallow = repo root), while under
 * vitest it is the real source file (e.g. src/host/preset.ts, one level deeper).
 * Probe the deep candidate first — from source it is the repo root, from the
 * bundle it normally does not exist and we fall back to the shallow candidate
 * (repo root at bundle depth). Final fallback stays shallow so a broken
 * install reports the production-expected path in its ENOENT.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function repoDirOf(importMetaUrl: string, rel: string): string {
  const here = fileURLToPath(new URL('.', importMetaUrl))
  const shallow = join(here, '..', rel)
  const deep = join(here, '..', '..', rel)
  if (existsSync(deep)) return deep
  return shallow
}
