/**
 * dsh-rrp — the Chronicler's WorldState v2 contract.
 *
 * Chronicler is a judgment-bearing state agent: it compares explicit narrative
 * evidence with the previous complete snapshot, then returns a complete v2
 * snapshot plus a short explanation safe to show to the player.
 */
import { z } from 'zod'
import { extractFirstJsonObject } from '../json-extract.ts'
import { worldStateSchema } from '../projection/world-state.ts'
import type { WorldState } from '../world-state.ts'
import type { AgentPromptContract } from './contract.ts'

const evidenceSchema = z.preprocess(
  (value) => (typeof value === 'string' ? [value] : value),
  z.array(z.string()).max(12),
)

export const chroniclerReplySchema = z
  .object({
    state: worldStateSchema,
    changeSummary: z.string(),
    evidence: evidenceSchema,
  })
  .strict()

/** The Chronicler's persona and rules. */
export const CHRONICLER_SYSTEM_PROMPT = [
  '你是《DSH-Chronicle》的状态推演（Chronicler Agent）：冷静、客观、有判断力的 WorldState v2 推演者。',
  '你的唯一职责是在每轮正文后，根据明确剧情证据输出完整当前 WorldState v2；你不写正文，不替玩家做决定。',
  '',
  '【输入与权威】',
  '你会收到上一份完整 WorldState v2 和本轮明确剧情证据。卡包/Skills 的硬设定与世界规则高于短期推演；玩家最近的矫正是当前状态的有效基线。',
  '只把正文中明确发生、明确被看见或明确被揭示的内容写入状态；纯修辞、猜测、意图、模型联想和未证实的可能性都不是证据。',
  '',
  '【记录边界】',
  '严禁杜撰，禁止扩写；权威排序按硬设定、当前 WorldState、明确剧情证据分域执行。',
  '1. 输出完整当前切面：必须保留没有变化的所有状态，不输出增量或历史日志。',
  '2. 不要记录玩家行动、对白或内心；只能记录这些内容造成的、正文明确确认的世界后果。玩家角色是特殊追踪对象，不得代替玩家补写行为。',
  '3. 已追踪对象优先更新。临时出现的角色、群体、物品或地点先保留为目标/矛盾/事件中的外部引用；只有持续剧情证据表明它会影响后续行动时，才建立追踪对象。',
  '4. 抑制无必要的新对象和新字段；不要为了让状态看起来完整而填默认值、发明属性或把短暂桥段升级成长期事实。',
  '5. 目标、矛盾和当前事件只有在明确证据表明完成、解决、无效或放弃时才关闭；没有明确解决证据就不要关闭，没有提及不等于关闭。',
  '6. 角色认知按同一角色 + 同一命题合并更新；明确知道与明确误解不能同时存在。认知变化不改写客观事实。',
  '7. 关系、目标、矛盾、事件优先引用已有 objectId；未追踪对象使用 external 引用，不复制历史。',
  '8. 卡包字段严格遵守其定义、类型、范围和可见性；未声明运行时字段只有明确且持续的剧情需要时才可新增。',
  '',
  '【可见性与秘密】',
  '保留字段、事件和认知的 player/model/hidden 可见性。hidden/model 内容可以保留在模型状态中，但不得把受保护秘密写进面向玩家摘要或证据；秘密只能在卡包/Skills 明确允许的揭示规则和剧情证据同时满足时改为 player 可见。',
  '',
  '【输出契约】',
  '- 只输出一个 JSON 对象，不要 Markdown、解释或推理过程。',
  '- 对象必须包含 state（完整 WorldState v2）、changeSummary（面向玩家的变更摘要，简短且不泄密）和 evidence（面向玩家可读的明确证据数组；无变化时可为空数组）。',
  '- state 必须包含 version、trackedObjects、globalFields、objectives、conflicts、cognition、relations、currentEvents 七个完整字段。',
  '- state 内每个字段的 definition 只可能是 "card-defined"（卡包声明）或 "undeclared"（运行时新建）；你新建的字段一律写 "undeclared"。',
  '- changeSummary 不得泄露 hidden/model 保护内容，不得包含模型内部推理。',
  '',
  '输出前逐项自检：① state 是完整 v2 切面；② 每个变化都能回指本轮明确剧情证据；③ 没有无必要新对象/字段；④ 没有玩家行动、对白或内心；⑤ 未提及的目标/矛盾/事件没有被自动关闭；⑥ 摘要和证据没有越过秘密揭示规则。',
].join('\n')

export interface ChroniclerPromptInput {
  prior: WorldState
  transcript: string
}

export interface ChroniclerReply {
  state: WorldState
  changeSummary: string
  evidence: string[]
}

export function buildChroniclerPrompt(input: ChroniclerPromptInput): string {
  return [
    '任务：根据本轮明确剧情证据更新 WorldState v2，输出完整 state 以及面向玩家的变更摘要和证据。',
    '不要记录玩家行动、对白或内心；没有明确解决证据就不要关闭目标、矛盾或事件。',
    '',
    '【v2 结构样例（键名与取值必须完全一致，照抄此形状）】',
    'objectives 元素：{"id":"…","owners":[{"objectId":"mia"}],"desiredOutcome":"…","status":"active"}（status 仅 pending/active/blocked/completed/abandoned）',
    'conflicts 元素：{"id":"…","parties":[{"objectId":"mia"}],"stakes":"…","pressure":"…","status":"active"}',
    'cognition 元素：{"id":"…","character":{"objectId":"mia"},"proposition":"…","markers":["known"]}',
    'relations 元素：{"id":"…","a":{"objectId":"mia"},"b":{"objectId":"inn"},"labels":["…"]}',
    'currentEvents 元素：{"id":"…","type":"…","fact":"…","relatedObjects":[{"objectId":"mia"}],"status":"active"}',
    '对象字段：{"type":"number","value":6,"definition":"undeclared"}；外部引用：{"external":{"name":"客栈老板娘"}}',
    '',
    '【此前的完整 WorldState v2】',
    JSON.stringify(input.prior, null, 2),
    '',
    '【本轮明确剧情证据】',
    input.transcript,
    '',
    '只输出 JSON：{"state":完整WorldState,"changeSummary":"…","evidence":["…"]}。临时对象优先使用外部引用。',
  ].join('\n')
}

/**
 * Field-definition vocabulary repair. The Chronicler may invent fields whose
 * `definition` it phrases in its own words ("model", "inferred", …); any value
 * outside the two known options can only mean a runtime-created field, which
 * is exactly `undeclared`. Coerce instead of rejecting an otherwise sound
 * snapshot.
 */
function repairFieldRecord(fields: unknown): void {
  if (fields === null || typeof fields !== 'object') return
  for (const field of Object.values(fields as Record<string, unknown>)) {
    if (field === null || typeof field !== 'object') continue
    const record = field as Record<string, unknown>
    const definition = record.definition
    if (definition !== undefined && definition !== 'card-defined' && definition !== 'undeclared') {
      record.definition = 'undeclared'
    }
    // JSON.parse turns an out-of-range literal like 1e999 into Infinity, which
    // passes z.number() but is rejected by the host's event serializability
    // check (as is -0); clamp back to a plain finite value.
    if (
      record.type === 'number' &&
      typeof record.value === 'number' &&
      !isPlainNumber(record.value)
    ) {
      record.value = 0
    }
    for (const bound of ['min', 'max'] as const) {
      if (typeof record[bound] === 'number' && !isPlainNumber(record[bound])) {
        delete record[bound]
      }
    }
  }
}

function isPlainNumber(value: number): boolean {
  return Number.isFinite(value) && !Object.is(value, -0)
}

/**
 * Reference shape repair. Weaker models sometimes emit a bare name string
 * where an object reference belongs; a string that matches a tracked object id
 * becomes an objectId reference, anything else an external named reference.
 */
function repairReference(
  value: unknown,
  knownIds: ReadonlySet<string>,
): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (typeof record.objectId === 'string' || record.external !== undefined) return record
  if (typeof record.name === 'string') {
    return knownIds.has(record.name)
      ? { objectId: record.name }
      : { external: { name: record.name } }
  }
  return undefined
}

function repairReferenceList(list: unknown, knownIds: ReadonlySet<string>): void {
  if (!Array.isArray(list)) return
  for (let index = 0; index < list.length; index++) {
    const item = list[index]
    if (typeof item === 'string') {
      list[index] = knownIds.has(item) ? { objectId: item } : { external: { name: item } }
      continue
    }
    const repaired = repairReference(item, knownIds)
    if (repaired !== undefined) list[index] = repaired
  }
}

function repairReferences(record: Record<string, unknown>): void {
  const objects = record.trackedObjects
  const knownIds = new Set<string>(
    objects !== null && typeof objects === 'object'
      ? Object.keys(objects as Record<string, unknown>)
      : [],
  )
  for (const collection of ['objectives', 'conflicts', 'cognition', 'relations', 'currentEvents']) {
    const items = record[collection]
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (item === null || typeof item !== 'object') continue
      const entry = item as Record<string, unknown>
      if (collection === 'objectives') repairReferenceList(entry.owners, knownIds)
      if (collection === 'conflicts') repairReferenceList(entry.parties, knownIds)
      if (collection === 'cognition') {
        const repaired = repairReference(entry.character, knownIds)
        if (repaired !== undefined) entry.character = repaired
      }
      if (collection === 'relations') {
        const a = repairReference(entry.a, knownIds)
        if (a !== undefined) entry.a = a
        const b = repairReference(entry.b, knownIds)
        if (b !== undefined) entry.b = b
      }
      if (collection === 'currentEvents') repairReferenceList(entry.relatedObjects, knownIds)
    }
  }
}

export function repairChroniclerEnvelope(parsed: unknown): unknown {
  if (parsed === null || typeof parsed !== 'object') return parsed
  const state = (parsed as Record<string, unknown>).state
  if (state === null || typeof state !== 'object') return parsed
  const record = state as Record<string, unknown>
  const objects = record.trackedObjects
  if (objects !== null && typeof objects === 'object') {
    for (const object of Object.values(objects as Record<string, unknown>)) {
      if (object === null || typeof object !== 'object') continue
      const objectRecord = object as Record<string, unknown>
      repairFieldRecord(objectRecord.fields)
      const character = objectRecord.character
      if (character !== null && typeof character === 'object') {
        const affinity = (character as Record<string, unknown>).affinity
        if (typeof affinity === 'number' && !isPlainNumber(affinity)) {
          ;(character as Record<string, unknown>).affinity = 0
        }
      }
    }
  }
  // Models drop keys for EMPTY collections (「没有就不写」). The schema requires
  // the full v2 shape, so the envelope repair fills absent collections with
  // their empty defaults — deterministic, and an omitted-empty never carries
  // information the prior state didn't already imply.
  record.trackedObjects ??= {}
  record.globalFields ??= {}
  record.objectives ??= []
  record.conflicts ??= []
  record.cognition ??= []
  record.relations ??= []
  record.currentEvents ??= []
  repairFieldRecord(record.globalFields)
  if (Array.isArray(record.objectives)) {
    for (const item of record.objectives) {
      if (item === null || typeof item !== 'object') continue
      const order = (item as Record<string, unknown>).order
      if (typeof order === 'number' && !isPlainNumber(order)) {
        delete (item as Record<string, unknown>).order
      }
    }
  }
  repairReferences(record)
  return parsed
}

/** Parse and validate the complete v2 reply envelope. */
export function parseChroniclerReply(reply: string): ChroniclerReply | undefined {
  const parsed = extractFirstJsonObject(reply)
  const result = chroniclerReplySchema.safeParse(repairChroniclerEnvelope(parsed))
  return result.success ? (result.data as ChroniclerReply) : undefined
}

export const chroniclerAgent: AgentPromptContract<ChroniclerPromptInput, ChroniclerReply> = {
  id: 'chronicler',
  name: '状态推演（Chronicler）',
  systemPrompt: CHRONICLER_SYSTEM_PROMPT,
  buildUserPrompt: buildChroniclerPrompt,
  parseReply: parseChroniclerReply,
  outputSchema: chroniclerReplySchema,
}
