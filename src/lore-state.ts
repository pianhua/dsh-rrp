/** dsh-rrp — dependency-free vocabulary for fork-aware dynamic lore. */

/** Stable Session projection key. */
export const RRP_LORE_KEY = 'rrpSediment'

/** Bounded growth for one save. */
export const LORE_LIMITS = {
  nameChars: 64,
  descriptionChars: 400,
  bodyChars: 8192,
  skillsPerSession: 40,
} as const

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** One complete dynamic Skill stored in the Session log. */
export interface LoreEntry {
  name: string
  description: string
  body: string
}

/** Incremental log operation; snapshot is reserved for legacy migration. */
export type LoreChange =
  | { kind: 'snapshot'; skills: LoreEntry[] }
  | { kind: 'add'; skill: LoreEntry }
  | { kind: 'remove'; name: string }

export type LoreValidation = { ok: true; skill: LoreEntry } | { ok: false; error: string }

/** Whether a name is a legal, bounded Skill name. */
export function isLoreName(name: string): boolean {
  return name.length > 0 && name.length <= LORE_LIMITS.nameChars && SKILL_NAME.test(name)
}

/** Validate and normalize a player/Scribe draft before appending an event. */
export function validateLoreEntry(
  candidate: Partial<LoreEntry> | null | undefined,
  existing: readonly string[] = [],
  reserved: readonly string[] = [],
): LoreValidation {
  const name = String(candidate?.name ?? '').trim()
  const description = String(candidate?.description ?? '').trim()
  const body = String(candidate?.body ?? '').trim()
  if (!isLoreName(name)) return { ok: false, error: '名称必须是 kebab-case（小写字母/数字/连字符）' }
  if (description.length === 0) return { ok: false, error: '描述不能为空' }
  if (description.length > LORE_LIMITS.descriptionChars) {
    return { ok: false, error: '描述过长（上限 ' + String(LORE_LIMITS.descriptionChars) + ' 字）' }
  }
  if (body.length === 0) return { ok: false, error: '正文不能为空' }
  if (body.length > LORE_LIMITS.bodyChars) {
    return { ok: false, error: '正文过长（上限 ' + String(LORE_LIMITS.bodyChars) + ' 字）' }
  }
  if (reserved.includes(name)) return { ok: false, error: '该名称已存在（只新增，不覆写）' }
  if (existing.includes(name)) return { ok: false, error: '该名称已沉淀过（只新增，不覆写）' }
  if (existing.length >= LORE_LIMITS.skillsPerSession) {
    return { ok: false, error: '本会话的沉淀条目已达上限（' + String(LORE_LIMITS.skillsPerSession) + '）' }
  }
  return { ok: true, skill: { name, description, body } }
}

/** Defensive structural read for provider/route boundaries. */
export function loreEntriesOf(value: unknown): LoreEntry[] {
  if (!Array.isArray(value)) return []
  const entries: LoreEntry[] = []
  const names = new Set<string>()
  for (const candidate of value) {
    const parsed = validateLoreEntry(candidate as Partial<LoreEntry>, [...names])
    if (!parsed.ok) continue
    names.add(parsed.skill.name)
    entries.push(parsed.skill)
    if (entries.length >= LORE_LIMITS.skillsPerSession) break
  }
  return entries
}

/** Purely fold one validated operation without mutating the prior slice. */
export function applyLoreChange(state: LoreEntry[], change: LoreChange): LoreEntry[] {
  if (change.kind === 'snapshot') return loreEntriesOf(change.skills)
  if (change.kind === 'remove') {
    return state.some((entry) => entry.name === change.name)
      ? state.filter((entry) => entry.name !== change.name)
      : state
  }
  const parsed = validateLoreEntry(change.skill, state.map((entry) => entry.name))
  return parsed.ok ? [...state, parsed.skill] : state
}
