/**
 * dsh-rrp — the RP mode preset (materialization + ownership).
 *
 * A DSH "mode" is an agent preset: a directory holding `agent.cordis.yml` that
 * the agent-presets roster mounts once per process and every session naming it
 * joins. We ship ours inside this package (`presets/rp/`), including its own
 * `skills/` bundles, and materialize the whole tree into the harness-home user
 * preset root (`<dshHome>/.agent-presets/rp/`), which
 * `@deepseek-ai/dsh-agent-presets` scans by default.
 *
 * The composition carries a `bundledSkillDir` placeholder that materialization
 * replaces with the copy's absolute `skills/` path, so the RP scope's
 * skill-filesystem provider discovers the world-knowledge bundles (D7).
 *
 * Ownership: a marker records the hash of every file we wrote. We refresh only
 * our own unmodified copy; a user-edited preset is never overwritten, and
 * dispose removes the directory only while it is still our unmodified copy —
 * and only on uninstall, never on a reload/restart.
 */
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Preset id, also the directory name; must satisfy the roster's PRESET_ID. */
export const PRESET_ID = 'rp'

/** Ownership marker written beside the materialized copy. */
const MARKER_FILE = '.dsh-rrp.json'
const MANAGED_BY = 'dsh-rrp'

/** Composition file, and the token replaced with the materialized skills root. */
const COMPOSITION_FILE = 'agent.cordis.yml'
const SKILL_DIR_TOKEN = '__DSH_RRP_SKILL_DIR__'

/** The shipped preset source (resolved against the bundled lib/index.js). */
const SOURCE_DIR = fileURLToPath(new URL('../presets/rp/', import.meta.url))

/** This package's own manifest, used to tell a reload from an uninstall. */
const PACKAGE_MANIFEST = fileURLToPath(new URL('../package.json', import.meta.url))

/** The harness home; mirrors @deepseek-ai/dsh-agent-presets' shipped default. */
function harnessHome(): string {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/** The user preset directory this plugin owns. */
export function presetDir(home: string = harnessHome()): string {
  return join(home, '.agent-presets', PRESET_ID)
}

/** Outcome of one materialization pass. */
export interface MaterializeOutcome {
  /** Absolute preset directory. */
  dir: string
  /** `created` on first write, `refreshed` on our own copy, `left-user` when foreign/edited. */
  action: 'created' | 'refreshed' | 'left-user'
}

/** Every file under `root` as sorted POSIX relative paths. */
function walkFiles(root: string): string[] {
  const out: string[] = []
  const visit = (base: string): void => {
    const abs = base === '' ? root : join(root, base)
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const rel = base === '' ? entry.name : `${base}/${entry.name}`
      if (entry.isDirectory()) visit(rel)
      else if (entry.isFile()) out.push(rel)
    }
  }
  visit('')
  return out.sort()
}

/** Content hashes of every managed file (the marker itself excluded). */
function contentHashes(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!existsSync(dir)) return out
  for (const rel of walkFiles(dir)) {
    if (rel === MARKER_FILE) continue
    out[rel] = createHash('sha256').update(readFileSync(join(dir, rel))).digest('hex')
  }
  return out
}

/** Parse our ownership marker, or undefined when absent/foreign. */
function readMarker(dir: string): { files?: Record<string, string> } | undefined {
  try {
    const parsed = JSON.parse(readFileSync(join(dir, MARKER_FILE), 'utf8')) as {
      managedBy?: string
      files?: Record<string, string>
    }
    if (parsed.managedBy === MANAGED_BY && parsed.files !== undefined) return parsed
  } catch {
    /* absent or unreadable → not ours */
  }
  return undefined
}

/** Whether `dir` is our materialization and still byte-identical to it. */
function isOursUnmodified(dir: string): boolean {
  const marker = readMarker(dir)
  if (marker === undefined) return false
  const recorded = marker.files ?? {}
  const current = contentHashes(dir)
  const keys = Object.keys(recorded)
  if (keys.length !== Object.keys(current).length) return false
  return keys.every((key) => current[key] === recorded[key])
}

/**
 * Materialize (or refresh) the shipped RP preset, templating the composition
 * with the copy's own skills path.
 * @param home - harness home override; defaults to DSH_HOME or ~/.dsh.
 * @returns the directory and the action taken.
 * @throws when the shipped source is missing (a build/package error).
 */
export function materializePreset(home?: string): MaterializeOutcome {
  const dir = presetDir(home)
  const sourceComposition = join(SOURCE_DIR, COMPOSITION_FILE)
  if (!existsSync(sourceComposition)) {
    throw new Error(`dsh-rrp: shipped RP preset missing at ${SOURCE_DIR} — rebuild before linking`)
  }

  const existed = existsSync(dir)
  if (existed && !isOursUnmodified(dir)) return { dir, action: 'left-user' }

  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  cpSync(SOURCE_DIR, dir, { recursive: true, force: true })

  const templated = readFileSync(sourceComposition, 'utf8')
    .replaceAll(SKILL_DIR_TOKEN, join(dir, 'skills'))
  writeFileSync(join(dir, COMPOSITION_FILE), templated)

  const marker = { managedBy: MANAGED_BY, files: contentHashes(dir) }
  writeFileSync(join(dir, MARKER_FILE), JSON.stringify(marker, null, 2) + '\n')
  return { dir, action: existed ? 'refreshed' : 'created' }
}

/**
 * Dispose-time cleanup, mirroring the community preset-materializer pattern:
 * a session records the preset id it was composed from, so the preset must
 * keep resolving across a reload, restart, or update. Only a vanished package
 * (an uninstall) removes our unmodified copy.
 * @param home - harness home override; defaults to DSH_HOME or ~/.dsh.
 * @returns `kept-installed`, `removed`, `left-user`, or `absent`.
 */
export function cleanupPreset(home?: string): 'kept-installed' | 'removed' | 'left-user' | 'absent' {
  if (existsSync(PACKAGE_MANIFEST)) return 'kept-installed'
  return removePreset(home)
}

/**
 * Remove our materialization, unless the user edited or replaced it.
 * @param home - harness home override; defaults to DSH_HOME or ~/.dsh.
 * @returns `removed`, `left-user`, or `absent`.
 */
export function removePreset(home?: string): 'removed' | 'left-user' | 'absent' {
  const dir = presetDir(home)
  if (!existsSync(dir)) return 'absent'
  if (!isOursUnmodified(dir)) return 'left-user'
  rmSync(dir, { recursive: true, force: true })
  return 'removed'
}
