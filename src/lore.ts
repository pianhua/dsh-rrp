/**
 * dsh-rrp — read-only adapter for the pre-projection sediment sidecar.
 *
 * Current dynamic lore lives in Session events. This module exists only to
 * import installations created by older builds and preserve their files as a
 * recoverable `.legacy.bak` directory after a successful event append.
 */
import { existsSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parseFrontmatter } from './cards.ts'
import { harnessHome } from './home.ts'
import { isSedimentName, validateSedimentEntry, type SedimentEntry } from './sediment-state.ts'

/** Compatibility name used by the Scribe's draft contract. */
export type SedimentDraft = SedimentEntry

/** A legacy file entry plus diagnostics retained for migration logs. */
export interface LegacySedimentSkill extends SedimentEntry {
  bytes: number
  updatedAt: string
  path: string
}

/** Historical sidecar root. New writes must never target this path. */
export function legacySedimentRoot(home: string = harnessHome()): string {
  return join(home, '.dsh-rrp', 'sediment', 'sessions')
}

/** Historical per-Session directory. */
export function legacySessionSedimentDir(home: string, sessionId: string): string {
  return join(legacySedimentRoot(home), sessionId)
}

function legacySkillDir(home: string, sessionId: string, name: string): string {
  return join(legacySessionSedimentDir(home, sessionId), name)
}

/** Render the old standard `SKILL.md` form for fixtures and diagnostics. */
export function renderSediment(entry: SedimentEntry): string {
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
export function readLegacySediment(home: string, sessionId: string, name: string): SedimentEntry | undefined {
  if (!isSedimentName(name)) return undefined
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
    const validated = validateSedimentEntry(candidate)
    return validated.ok ? validated.skill : undefined
  } catch {
    return undefined
  }
}

/** List valid old entries. Unreadable files are skipped, never fatal. */
export function listLegacySediment(home: string, sessionId: string): LegacySedimentSkill[] {
  const dir = legacySessionSedimentDir(home, sessionId)
  if (!existsSync(dir)) return []
  const out: LegacySedimentSkill[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isSedimentName(entry.name)) continue
    const value = readLegacySediment(home, sessionId, entry.name)
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
export function backupLegacySediment(home: string, sessionId: string): string | undefined {
  const source = legacySessionSedimentDir(home, sessionId)
  if (!existsSync(source)) return undefined
  const target = source + '.legacy.bak'
  if (existsSync(target)) return undefined
  renameSync(source, target)
  return target
}
