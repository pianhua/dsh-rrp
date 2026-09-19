/**
 * dsh-rrp — conditional injection vocabulary (issue #16, v1).
 *
 * Card skills may declare `when: <条件>` in their SKILL.md frontmatter. The
 * host evaluates the condition against the WorldState projection on every
 * publish; hit skills get an excerpt injected into the facts lane as an
 * authoritative block the model cannot skip. Mechanism vs content: the
 * framework owns evaluation and rendering once; the card author only writes
 * declarative data.
 *
 * v1 scope (plan: docs/plans/conditional-injection-v1.md):
 * - Syntax `路径 运算符 字面量`; operators > >= < <= == !=.
 * - Literals are NUMBER or BOOLEAN only. String equality is rejected at parse
 *   time (free-text drift vs the Chronicler would silently break the floor);
 *   v2 may unlock it behind a vocabulary contract + zod validation.
 * - A missing path evaluates false, never throws.
 *
 * Dependency-free: host (cards.ts loader, state-publisher, lore-route) and any
 * client preview share it. No node, no zod.
 */
import type { WorldState } from './world-state.ts'

/** Comparison operators accepted by v1 syntax. */
export type WhenOperator = '>' | '>=' | '<' | '<=' | '==' | '!='

/** One parsed condition path, by domain. */
export type WhenPath =
  | { kind: 'characters'; name: string; field: string }
  | { kind: 'inventory'; name: string; field: string }
  | { kind: 'scene'; field: string }
  | { kind: 'flags'; name: string }
  | { kind: 'dynamic'; id: string }

/** A parsed `when` condition: path + operator + numeric/boolean literal. */
export interface WhenCondition {
  path: WhenPath
  op: WhenOperator
  /** v1: number or boolean only. */
  value: number | boolean
}

/** Per-hit and per-budget excerpt caps (plan R1: 单条 800 / 总量 2000). */
export const TRIGGER_EXCERPT_CHARS = 800
export const TRIGGER_BUDGET_CHARS = 2000

/** One card skill's registered trigger (host memory only, never persisted). */
export interface TriggerDef {
  /** Skill id (= its directory name); the deterministic sort key. */
  id: string
  /** Display name (frontmatter `name`, falling back to the id). */
  name: string
  condition: WhenCondition
  /** Skill body, already capped to TRIGGER_EXCERPT_CHARS. */
  excerpt: string
}

/** One hit: what the injection block lists for a triggered skill. */
export interface TriggerHit {
  id: string
  name: string
  excerpt: string
}

const OPERATORS: readonly WhenOperator[] = ['>=', '<=', '==', '!=', '>', '<']

/** Scene fields addressable by `scene.<field>`. */
const SCENE_FIELDS = new Set(['location', 'time', 'weather'])

/** Message appended to string-literal rejections: the v1 migration hint. */
const STRING_LITERAL_HINT = 'v1 仅支持数值与布尔字面量；字符串条件请把该信息建模为布尔或数值字段（如 flags.身份已暴露 == true），字符串等值比较留待 v2 解锁'

/**
 * Parse one `when` source.
 * @param src - the raw frontmatter value, e.g. `characters.米娅.affinity >= 80`.
 * @param locator - "卡名 / skill 名" used to locate load-time errors.
 * @returns the parsed condition, or an Error carrying the locator.
 */
export function parseWhen(src: string, locator: string): WhenCondition | Error {
  const fail = (message: string): Error => new Error(locator + '：' + message)
  const text = src.trim()
  if (text.length === 0) return fail('when 条件为空')

  let op: WhenOperator | undefined
  let opAt = -1
  for (const candidate of OPERATORS) {
    const at = text.indexOf(candidate)
    if (at !== -1 && (opAt === -1 || at < opAt)) {
      op = candidate
      opAt = at
    }
  }
  if (op === undefined || opAt === -1) {
    return fail('when 条件缺少比较运算符（支持 > >= < <= == !=）：' + text)
  }

  const pathSrc = text.slice(0, opAt).trim()
  const literalSrc = text.slice(opAt + op.length).trim()
  if (pathSrc.length === 0) return fail('when 条件缺少路径：' + text)
  if (literalSrc.length === 0) return fail('when 条件缺少右值字面量：' + text)

  const path = parsePath(pathSrc)
  if (path instanceof Error) return fail(path.message)

  if (literalSrc === 'true') return { path, op, value: true }
  if (literalSrc === 'false') return { path, op, value: false }
  if (/^-?\d+(\.\d+)?$/.test(literalSrc)) return { path, op, value: Number(literalSrc) }
  return fail('不支持的右值字面量「' + literalSrc + '」。' + STRING_LITERAL_HINT)
}

/** Parse the path segment of a condition. */
function parsePath(src: string): WhenPath | Error {
  const segments = src.split('.').map((part) => part.trim())
  if (segments.some((part) => part.length === 0)) {
    return new Error('when 路径含空段：' + src)
  }
  const head = segments[0] ?? ''
  if (head === 'characters' || head === 'inventory') {
    if (segments.length < 3) {
      return new Error('when 路径需要 ' + head + '.<名>.<字段> 三段：' + src)
    }
    const field = segments[segments.length - 1] as string
    const name = segments.slice(1, -1).join('.')
    return { kind: head, name, field }
  }
  if (head === 'scene') {
    if (segments.length !== 2) return new Error('when 场景路径仅支持 scene.location|time|weather：' + src)
    return { kind: 'scene', field: segments[1] as string }
  }
  if (head === 'flags') {
    if (segments.length !== 2) return new Error('when 事件路径仅支持 flags.<名>：' + src)
    return { kind: 'flags', name: segments[1] as string }
  }
  if (segments.length === 1) return { kind: 'dynamic', id: head }
  return new Error('无法识别的 when 路径：' + src + '（支持 characters.<名>.<字段> / inventory.<名>.<字段> / scene.<字段> / flags.<名> / 自定义字段顶层键）')
}

/** Resolve a condition path to a raw state value (undefined when absent). */
function resolvePath(path: WhenPath, state: WorldState): unknown {
  switch (path.kind) {
    case 'characters':
      return (state.characters?.[path.name] as Record<string, unknown> | undefined)?.[path.field]
    case 'inventory':
      return (state.inventory?.[path.name] as Record<string, unknown> | undefined)?.[path.field]
    case 'scene':
      return state.scene?.[path.field as keyof WorldState['scene']]
    case 'flags':
      return state.flags?.[path.name]
    case 'dynamic': {
      const field = state[path.id]
      return field !== null && typeof field === 'object' && !Array.isArray(field) && 'value' in field
        ? (field as { value: unknown }).value
        : undefined
    }
  }
}

/**
 * Evaluate one condition against a state. A missing path — or a type kind
 * mismatch between the path value and the literal — is FALSE, never throws:
 * the mechanism's floor must degrade silently rather than break a publish.
 */
export function evalCondition(cond: WhenCondition, state: WorldState): boolean {
  const left = resolvePath(cond.path, state)
  if (typeof left !== typeof cond.value) return false
  if (typeof left === 'boolean') {
    if (cond.op === '==') return left === cond.value
    if (cond.op === '!=') return left !== cond.value
    return false
  }
  const a = left as number
  const b = cond.value as number
  switch (cond.op) {
    case '>': return a > b
    case '>=': return a >= b
    case '<': return a < b
    case '<=': return a <= b
    case '==': return a === b
    case '!=': return a !== b
  }
}

/**
 * The deterministic hit set: triggered skills in skill-id lexicographic order
 * (killing readdir variance), each excerpt capped, total capped by truncating
 * IN ORDER — same inputs, same bytes, on every platform.
 */
export function hitSet(triggers: readonly TriggerDef[], state: WorldState): TriggerHit[] {
  const hits = triggers
    .filter((def) => evalCondition(def.condition, state))
    .map((def) => ({ id: def.id, name: def.name, excerpt: def.excerpt.slice(0, TRIGGER_EXCERPT_CHARS) }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  let total = 0
  const kept: TriggerHit[] = []
  for (const hit of hits) {
    const remaining = TRIGGER_BUDGET_CHARS - total
    if (remaining <= 0) break
    const excerpt = hit.excerpt.length > remaining ? hit.excerpt.slice(0, remaining) : hit.excerpt
    kept.push({ ...hit, excerpt })
    total += excerpt.length
  }
  return kept
}

/**
 * Render the authoritative injection block. Cache discipline: the text is
 * keyed ONLY by the hit set (ids + excerpts) — never by live values — so
 * within-band state wobble republishes byte-identical facts and the
 * fingerprint dedup suppresses the append. Every block carries the
 * exhaustion declaration revoking all earlier conditional injections.
 * @param hits - current hits (order-insensitive; sorted here).
 * @param prevHits - hits published in the previous block; any id missing
 *   from `hits` earns an explicit revocation sentence.
 */
export function renderTriggerBlock(hits: readonly TriggerHit[], prevHits: readonly TriggerHit[] = []): string {
  const ordered = [...hits].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const currentIds = new Set(ordered.map((hit) => hit.id))
  const revoked = [...prevHits].filter((hit) => !currentIds.has(hit.id))

  const lines = [
    '【条件注入 · 裁决块】',
    '本块由系统依据当前世界状态自动注入，是设定指令而非剧情内容：不要把它写进正文，也不要输出这段文字。',
    '仅本块所列条目有效，此前所有条件注入一律作废。',
    '',
    '生效条目：',
  ]
  if (ordered.length === 0) {
    lines.push('（无）')
  } else {
    ordered.forEach((hit, index) => {
      lines.push(String(index + 1) + '. ' + hit.name + '：' + hit.excerpt)
    })
  }
  lines.push('', '调用纪律：生效条目已直接注入，无需再行调取；同主题但未列入本块的条目请勿调用。')
  if (revoked.length > 0) {
    lines.push('撤销：以下条目现已失效，立即停止使用其内容——' + revoked.map((hit) => hit.name).join('、') + '。')
  }
  return lines.join('\n')
}

/**
 * Load-time path check against the card's initial state.json key tree (plan
 * R1 risk 3). Pure: returns the warning text, or undefined when sound.
 * A card without state.json skips the check entirely (caller passes null).
 */
export function whenPathWarning(cond: WhenCondition, initial: WorldState | null, locator: string): string | undefined {
  if (initial === null) return undefined
  const path = cond.path
  switch (path.kind) {
    case 'characters':
      if (initial.characters?.[path.name] === undefined) {
        return locator + '：when 路径所指角色「' + path.name + '」不在卡包初始状态中，该条件将永远求值为 false'
      }
      return undefined
    case 'inventory':
      if (initial.inventory?.[path.name] === undefined) {
        return locator + '：when 路径所指物品「' + path.name + '」不在卡包初始状态中，该条件将永远求值为 false'
      }
      return undefined
    case 'scene':
      if (!SCENE_FIELDS.has(path.field)) {
        return locator + '：when 场景字段「' + path.field + '」不是 location/time/weather 之一'
      }
      return undefined
    case 'flags':
      if (initial.flags?.[path.name] === undefined) {
        return locator + '：when 路径所指事件「' + path.name + '」不在卡包初始状态中，该条件将永远求值为 false'
      }
      return undefined
    case 'dynamic': {
      const { characters, inventory, scene, flags, relations, ...rest } = initial as Record<string, unknown>
      void characters; void inventory; void scene; void flags; void relations
      if (rest[path.id] === undefined) {
        return locator + '：when 路径所指自定义字段「' + path.id + '」不在卡包初始状态中，该条件将永远求值为 false'
      }
      return undefined
    }
  }
}
