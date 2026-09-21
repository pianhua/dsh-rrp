/**
 * Dev-only: link THIS checkout into a DSH profile.
 *
 * Why this exists instead of plain `dsh plugin add .`:
 * `dsh plugin` forwards to pnpm, and pnpm's `link:` protocol stores the
 * literal path it was given and resolves it RELATIVE to the profile directory.
 * When the profile (`$DSH_HOME/profiles/...`, normally on C:) and this repo
 * live on different Windows drives, that produces a broken symlink — and the
 * bundle-declaration reconciliation then reports:
 *   "dsh-rrp declares no dsh.bundle — installed as a plain dependency".
 *
 * An NTFS directory junction works across drives and is followed by Node's
 * resolver, so this script creates one at the exact node_modules path the
 * loader resolves, and registers the package in `dsh.profile.bundles`.
 *
 * Usage:
 *   node scripts/link-dev.mjs            # links into $DSH_HOME/profiles/rp-dev
 *   node scripts/link-dev.mjs my-profile
 *
 * The referenced built artifacts (lib/) must exist: run `pnpm run build` first.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
const profileName = process.argv[2] ?? 'rp-dev'
const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const profileDir = join(dshHome, 'profiles', profileName)
const manifestPath = join(profileDir, 'package.json')
const linkPath = join(profileDir, 'node_modules', pkg.name)

if (!pkg.dsh?.bundle?.patch)
  throw new Error(`${pkg.name} declares no dsh.bundle.patch; run 'pnpm run build' first`)
if (!existsSync(manifestPath))
  throw new Error(`profile ${profileName} not found at ${profileDir}; create it first`)
if (!existsSync(join(repoRoot, 'lib', 'index.js')))
  throw new Error('lib/index.js missing — run "pnpm run build" first')

mkdirSync(join(profileDir, 'node_modules'), { recursive: true })
rmSync(linkPath, { recursive: true, force: true })
symlinkSync(repoRoot, linkPath, 'junction')

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const bundles = manifest.dsh?.profile?.bundles ?? []
if (!bundles.includes(pkg.name)) bundles.push(pkg.name)
manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles } }
// The junction is the dev link; drop the broken pnpm link: dependency so a
// later `pnpm install` cannot recreate it.
if (manifest.dependencies?.[pkg.name] !== undefined) {
  delete manifest.dependencies[pkg.name]
  if (Object.keys(manifest.dependencies).length === 0) delete manifest.dependencies
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

console.log(`linked ${pkg.name}`)
console.log(`  junction : ${linkPath} -> ${repoRoot}`)
console.log(`  profile  : ${profileName} (${manifestPath})`)
console.log(`  bundles  : ${bundles.join(', ')}`)
