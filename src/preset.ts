/**
 * dsh-rrp — the RP mode presets (materialization + ownership).
 *
 * A DSH "mode" is an agent preset: a directory holding `agent.cordis.yml` that
 * the agent-presets roster mounts once per process and every session naming it
 * joins. We ship the base mode inside this package (`presets/rp/`) and
 * materialize it into the harness-home user preset root
 * (`<dshHome>/.agent-presets/<id>/`), which `@deepseek-ai/dsh-agent-presets`
 * scans by default.
 *
 * Card skills are SCOPED BY PRESET: the base `rp` preset carries no card lore,
 * and each card gets a derived `rp-<card-id>` preset whose own `skills/` root
 * holds only that card's bundles (see ./preset-id.ts). Mounting every card into
 * one shared root would leak one card's world knowledge into every session.
 * The composition carries a `bundledSkillDir` placeholder that materialization
 * replaces with the copy's absolute `skills/` path.
 *
 * Ownership: a marker records the hash of every file we wrote. We refresh only
 * our own unmodified copy; a user-edited preset is never overwritten, and
 * dispose removes directories only while they are still our unmodified copy —
 * and only on uninstall, never on a reload/restart.
 */
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listCards, mountSkillsForCard } from './cards.ts'
import { harnessHome } from './home.ts'
import { BASE_PRESET_ID, belongsToRpPreset, isCardId, presetIdForCard } from './preset-id.ts'

/** Base preset id, also the directory name; must satisfy the roster's PRESET_ID. */
export const PRESET_ID = BASE_PRESET_ID

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

/** The user preset directory for one preset id. */
export function presetDir(home: string = harnessHome(), id: string = PRESET_ID): string {
  return join(home, '.agent-presets', id)
}

/** Outcome of one materialization pass. */
export interface MaterializeOutcome {
  /** Absolute preset directory. */
  dir: string
  /** `created` on first write, `refreshed` on our own copy, `left-user` when foreign/edited. */
  action: 'created' | 'refreshed' | 'left-user'
  /** Per-card preset outcomes when the base was materialized as a family. */
  cards?: MaterializeOutcome[]
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
 * Materialize (or refresh) ONE preset directory, templating the composition
 * with the copy's own skills path and, for a card preset, mounting only that
 * card's world-knowledge bundles.
 */
function materializeOne(dir: string, cardId: string | undefined, home: string | undefined): MaterializeOutcome {
  const sourceComposition = join(SOURCE_DIR, COMPOSITION_FILE)
  if (!existsSync(sourceComposition)) {
    throw new Error(`dsh-rrp: shipped RP preset missing at ${SOURCE_DIR} — rebuild before linking`)
  }

  const existed = existsSync(dir)
  if (existed && !isOursUnmodified(dir)) return { dir, action: 'left-user' }

  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  cpSync(SOURCE_DIR, dir, { recursive: true, force: true })
  if (cardId !== undefined) mountSkillsForCard(dir, cardId, home)

  const templated = readFileSync(sourceComposition, 'utf8')
    .replaceAll(SKILL_DIR_TOKEN, join(dir, 'skills'))
  writeFileSync(join(dir, COMPOSITION_FILE), templated)

  const marker = { managedBy: MANAGED_BY, files: contentHashes(dir) }
  writeFileSync(join(dir, MARKER_FILE), JSON.stringify(marker, null, 2) + '\n')
  return { dir, action: existed ? 'refreshed' : 'created' }
}

/**
 * Materialize one card's preset when it is missing — a card dropped into
 * `cards/` after the plugin booted has no `rp-<card-id>` preset yet, and the
 * gallery's start flow (`agentPresets.select`) needs it to exist. Called from
 * the read-only cards route so discovery of a new card makes it startable
 * without a plugin reload. Existing presets are left untouched (user edits
 * win; stale own-copies refresh at the next boot).
 * @param cardId - the card's canonical id.
 * @param home - harness home override; defaults to DSH_HOME or ~/.dsh.
 * @returns the materialization action (`exists` when already materialized),
 *   or undefined for an illegal id.
 */
export function ensureCardPreset(cardId: string, home?: string): MaterializeOutcome['action'] | 'exists' | undefined {
  if (!isCardId(cardId)) return undefined
  const dir = presetDir(home, presetIdForCard(cardId))
  if (existsSync(dir)) {
    return isOursUnmodified(dir) ? 'exists' : 'left-user'
  }
  return materializeOne(dir, cardId, home).action
}

/**
 * Materialize the base RP preset plus one scoped preset per visible card.
 * @param home - harness home override; defaults to DSH_HOME or ~/.dsh.
 * @returns the base outcome (with each card preset outcome in `cards`).
 * @throws when the shipped source is missing (a build/package error).
 */
export function materializePreset(home?: string): MaterializeOutcome {
  const base = materializeOne(presetDir(home), undefined, home)
  const cards: MaterializeOutcome[] = []
  for (const meta of listCards(home)) {
    cards.push(materializeOne(presetDir(home, presetIdForCard(meta.id)), meta.id, home))
  }
  return { ...base, cards }
}

/**
 * Dispose-time cleanup, mirroring the community preset-materializer pattern:
 * a session records the preset id it was composed from, so presets must keep
 * resolving across a reload, restart, or update. Only a vanished package
 * (an uninstall) removes our unmodified copies.
 * @param home - harness home override; defaults to DSH_HOME or ~/.dsh.
 * @returns `kept-installed`, `removed`, `left-user`, or `absent`.
 */
export function cleanupPreset(home?: string): 'kept-installed' | 'removed' | 'left-user' | 'absent' {
  if (existsSync(PACKAGE_MANIFEST)) return 'kept-installed'
  return removeAllPresets(home)
}

/**
 * Remove the base materialization, unless the user edited or replaced it.
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

/**
 * Remove every unmodified RP-family preset (base + card presets).
 * @param home - harness home override; defaults to DSH_HOME or ~/.dsh.
 * @returns `removed` when any were removed, `left-user` when one was edited, else `absent`.
 */
export function removeAllPresets(home?: string): 'removed' | 'left-user' | 'absent' {
  const root = join(home ?? harnessHome(), '.agent-presets')
  if (!existsSync(root)) return 'absent'
  let sawAny = false
  let leftUser = false
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !belongsToRpPreset(entry.name)) continue
    sawAny = true
    const dir = join(root, entry.name)
    if (!isOursUnmodified(dir)) {
      leftUser = true
      continue
    }
    rmSync(dir, { recursive: true, force: true })
  }
  if (!sawAny) return 'absent'
  return leftUser ? 'left-user' : 'removed'
}
