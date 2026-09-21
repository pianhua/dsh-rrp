/**
 * dsh-rrp — read-only adapter for the pre-projection lore sidecar.
 *
 * Current dynamic lore lives in Session events. This module exists only to
 * import installations created by older builds and preserve their files as a
 * recoverable `.legacy.bak` directory after a successful event append.
 */
import { existsSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parseFrontmatter } from './cards.ts'
import { harnessHome } from './home.ts'
import { isLoreName, validateLoreEntry, type LoreEntry } from './lore-state.ts'

/** Compatibility name used by the Scribe's draft contract. */
export type LoreDraft = LoreEntry

/** A legacy file entry plus diagnostics retained for migration logs. */
export interface LegacyLoreSkill extends LoreEntry {
  bytes: number
  updatedAt: string
  path: string
}

/** Historical sidecar root. New writes must never target this path. */
export function legacyLoreRoot(home: string = harnessHome()): string {
  return join(home, '.dsh-rrp', 'sediment', 'sessions')
}

/** Historical per-Session directory. */
export function legacySessionLoreDir(home: string, sessionId: string): string {
  return join(legacyLoreRoot(home), sessionId)
}

function legacySkillDir(home: string, sessionId: string, name: string): string {
  return join(legacySessionLoreDir(home, sessionId), name)
}

/** Render the old standard `SKILL.md` form for fixtures and diagnostics. */
export function renderLore(entry: LoreEntry): string {
  const quote = (value: string): string => JSON.stringify(value.replace(/[\r\n]+/g, ' ').trim())
  return [
    '---',
    'name: ' + quote(entry.name),
    'description: ' + quote(entry.description),
    '---',
    '',
    entry.body.trim(),
    '',
  ].join('\n')
}

/** Read one old `SKILL.md` into the canonical event vocabulary. */
export function readLegacyLore(
  home: string,
  sessionId: string,
  name: string,
): LoreEntry | undefined {
  if (!isLoreName(name)) return undefined
  const file = join(legacySkillDir(home, sessionId, name), 'SKILL.md')
  if (!existsSync(file)) return undefined
  try {
    const raw = readFileSync(file, 'utf8')
    const parsed = parseFrontmatter(raw)
    const candidate = {
      name,
      description: parsed === undefined ? '' : String(parsed.data.description ?? ''),
      body: parsed === undefined ? raw.trim() : parsed.body.trim(),
    }
    const validated = validateLoreEntry(candidate)
    return validated.ok ? validated.skill : undefined
  } catch {
    return undefined
  }
}

/** List valid old entries. Unreadable files are skipped, never fatal. */
export function listLegacyLore(home: string, sessionId: string): LegacyLoreSkill[] {
  const dir = legacySessionLoreDir(home, sessionId)
  if (!existsSync(dir)) return []
  const out: LegacyLoreSkill[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isLoreName(entry.name)) continue
    const value = readLegacyLore(home, sessionId, entry.name)
    const path = join(dir, entry.name, 'SKILL.md')
    if (value === undefined || !existsSync(path)) continue
    try {
      const stat = statSync(path)
      out.push({
        ...value,
        bytes: stat.size,
        updatedAt: new Date(stat.mtimeMs).toISOString(),
        path,
      })
    } catch {
      /* skip an entry whose metadata cannot be read */
    }
  }
  return out.sort((left, right) => left.name.localeCompare(right.name))
}

/**
 * Preserve the imported sidecar by renaming its Session directory. The caller
 * invokes this only after the snapshot event has committed.
 */
export function backupLegacyLore(home: string, sessionId: string): string | undefined {
  const source = legacySessionLoreDir(home, sessionId)
  if (!existsSync(source)) return undefined
  const target = source + '.legacy.bak'
  if (existsSync(target)) return undefined
  renameSync(source, target)
  return target
}
