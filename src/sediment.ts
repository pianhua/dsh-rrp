/**
 * dsh-rrp — knowledge sedimentation (D8): the durable, per-session store.
 *
 * D8 allows lore discovered during play to become knowledge, but demands it be
 * CONTROLLED, REVIEWABLE, and INCREMENTAL. This module is the storage half:
 *
 * - one directory per SESSION (the player asked for per-session isolation, so a
 *   worldline's discoveries never leak into another save);
 * - one directory per skill, each holding a standard `SKILL.md`;
 * - ADD-ONLY: an existing skill name is refused, never overwritten;
 * - bounded: name / description / body / count caps;
 * - atomic: written to a temp file and renamed, so a watcher never sees a torn
 *   `SKILL.md`.
 *
 * The files are ordinary skills, so the host's skill-filesystem/provider layer
 * discovers them progressively — no custom activation table.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseFrontmatter } from './cards.ts'
import { harnessHome } from './home.ts'

/** Safety caps. One pass writes one skill; a session cannot grow without bound. */
export const SEDIMENT_LIMITS = {
  nameChars: 64,
  descriptionChars: 400,
  bodyChars: 8192,
  skillsPerSession: 40,
} as const

/** Public skill-name grammar (kebab-case), matching the host's registry. */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Whether a name is a legal, bounded skill name. */
export function isSedimentName(name: string): boolean {
  return name.length > 0 && name.length <= SEDIMENT_LIMITS.nameChars && SKILL_NAME.test(name)
}

/** One sedimented skill as the panel lists it. */
export interface SedimentSkill {
  name: string
  description: string
  /** UTF-8 bytes of the whole `SKILL.md`. */
  bytes: number
  /** ISO mtime. */
  updatedAt: string
  path: string
}

/** One candidate skill (a Scribe draft or a manual add). */
export interface SedimentDraft {
  name: string
  description: string
  body: string
}

/** Result of one write attempt. */
export type SedimentWrite = { ok: true; path: string } | { ok: false; error: string }

/** Root holding every session's sediment. */
export function sedimentRoot(home: string = harnessHome()): string {
  return join(home, '.dsh-rrp', 'sediment', 'sessions')
}

/** One session's sediment directory. */
export function sessionSedimentDir(home: string, sessionId: string): string {
  return join(sedimentRoot(home), sessionId)
}

/** One skill's directory. */
export function sedimentSkillDir(home: string, sessionId: string, name: string): string {
  return join(sessionSedimentDir(home, sessionId), name)
}

/** Render one `SKILL.md` (quoted single-line scalars, body verbatim). */
export function renderSediment(draft: SedimentDraft): string {
  const quote = (value: string): string => JSON.stringify(value.replace(/[\r\n]+/g, ' ').trim())
  return [
    '---',
    'name: ' + quote(draft.name),
    'description: ' + quote(draft.description),
    '---',
    '',
    draft.body.trim(),
    '',
  ].join('\n')
}

/**
 * List one session's sedimented skills. Unreadable entries are skipped, never
 * fatal; the directory name is the skill identity (what deletes address).
 * @param home - harness home.
 * @param sessionId - the owning session.
 * @returns sorted skills.
 */
export function listSediment(home: string, sessionId: string): SedimentSkill[] {
  const dir = sessionSedimentDir(home, sessionId)
  if (!existsSync(dir)) return []
  const out: SedimentSkill[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isSedimentName(entry.name)) continue
    const file = join(dir, entry.name, 'SKILL.md')
    if (!existsSync(file)) continue
    try {
      const raw = readFileSync(file, 'utf8')
      const parsed = parseFrontmatter(raw)
      const description = parsed === undefined ? '' : String(parsed.data.description ?? '')
      const stat = statSync(file)
      out.push({
        name: entry.name,
        description,
        bytes: Buffer.byteLength(raw, 'utf8'),
        updatedAt: new Date(stat.mtimeMs).toISOString(),
        path: file,
      })
    } catch {
      /* skip an unreadable skill */
    }
  }
  return out.sort((left, right) => left.name.localeCompare(right.name))
}

/** Read one sedimented skill's full draft. */
export function readSediment(home: string, sessionId: string, name: string): SedimentDraft | undefined {
  if (!isSedimentName(name)) return undefined
  const file = join(sedimentSkillDir(home, sessionId, name), 'SKILL.md')
  if (!existsSync(file)) return undefined
  try {
    const raw = readFileSync(file, 'utf8')
    const parsed = parseFrontmatter(raw)
    return {
      name,
      description: parsed === undefined ? '' : String(parsed.data.description ?? ''),
      body: parsed === undefined ? raw.trim() : parsed.body.trim(),
    }
  } catch {
    return undefined
  }
}

/**
 * Validate and atomically add one skill. ADD-ONLY: a name already present in
 * this session's sediment, or in `reserved` (e.g. the active card's bundled
 * skills), is refused — D8 forbids overwriting established lore.
 * @param home - harness home.
 * @param sessionId - the owning session.
 * @param draft - the candidate skill.
 * @param reserved - additional names that may not be taken.
 * @returns the write result.
 */
export function writeSediment(
  home: string,
  sessionId: string,
  draft: SedimentDraft,
  reserved: readonly string[] = [],
): SedimentWrite {
  const name = draft.name.trim()
  const description = draft.description.trim()
  const body = draft.body.trim()
  if (!isSedimentName(name)) return { ok: false, error: '名称必须是 kebab-case（小写字母/数字/连字符）' }
  if (description.length === 0) return { ok: false, error: '描述不能为空' }
  if (description.length > SEDIMENT_LIMITS.descriptionChars) {
    return { ok: false, error: '描述过长（上限 ' + String(SEDIMENT_LIMITS.descriptionChars) + ' 字）' }
  }
  if (body.length === 0) return { ok: false, error: '正文不能为空' }
  if (body.length > SEDIMENT_LIMITS.bodyChars) {
    return { ok: false, error: '正文过长（上限 ' + String(SEDIMENT_LIMITS.bodyChars) + ' 字）' }
  }
  if (reserved.includes(name)) return { ok: false, error: '该名称已存在（只新增，不覆写）' }

  const existing = listSediment(home, sessionId)
  if (existing.some((skill) => skill.name === name)) return { ok: false, error: '该名称已沉淀过（只新增，不覆写）' }
  if (existing.length >= SEDIMENT_LIMITS.skillsPerSession) {
    return { ok: false, error: '本会话的沉淀条目已达上限（' + String(SEDIMENT_LIMITS.skillsPerSession) + '）' }
  }

  try {
    const dir = sedimentSkillDir(home, sessionId, name)
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'SKILL.md')
    const temp = join(dir, '.SKILL.md.tmp')
    writeFileSync(temp, renderSediment({ name, description, body }), 'utf8')
    renameSync(temp, file)
    return { ok: true, path: file }
  } catch (error) {
    return { ok: false, error: String((error as { message?: string })?.message ?? error) }
  }
}

/** Remove one sedimented skill. Returns whether anything was removed. */
export function removeSediment(home: string, sessionId: string, name: string): boolean {
  if (!isSedimentName(name)) return false
  const dir = sedimentSkillDir(home, sessionId, name)
  if (!existsSync(dir)) return false
  rmSync(dir, { recursive: true, force: true })
  return true
}
