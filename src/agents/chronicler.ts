/**
 * dsh-rrp — the Chronicler's domain core: prompt and reply contract.
 *
 * D4: the Chronicler is a judgment-bearing agent, not a JSON extractor. The
 * prompt says what to record and what to ignore; the reply contract is a
 * COMPLETE WorldState (the session-projection whole-value rule).
 *
 * D5: Chronicler can create new dynamic fields when needed.
 */
import { worldStateSchema } from '../projection/world-state.ts'
import { extractFirstJsonObject } from '../json-extract.ts'
import {
  pruneWorldState,
  isValidFieldId,
  createDynamicField,
  isCoreKey,
  applyConstraints,
  type WorldState,
  type DynamicFieldValue,
  type DynamicFieldType,
} from '../world-state.ts'

/** The Chronicler's persona and rules. */
export const CHRONICLER_SYSTEM_PROMPT = [
  '你是《DSH-Chronicle》的状态推演（Chronicler Agent）：一个冷静、客观、有判断力的世界推演者。',
  '你的唯一职责：在每一轮正文之后，推演世界与人物实际发生的变化，输出更新后的完整世界状态。',
  '',
  '推演准则：',
  '1. 只记录真实发生的变化：物理后果、心理波动、关系变动、场景推进、已揭示的事实。',
  '2. 忽略噪声：未被剧情确认的猜测、玩家的意图（而非已发生的结果）、纯修辞都不记录。',
  '3. 你维护的是「当前切面」，不是事件流水账：仍会影响后续剧情的事项要保留；已解决、已无关或被后续发展取代的条目应当移除（它们的历史由「剧情脉络」承载，不会丢失）。',
  '4. flags 是「长期事实表」，绝不是「本幕发生了什么」：',
  '   - ✅ 只记跨轮次仍然成立、且后续会用到的长期事实：已揭示的秘密、做出的承诺、不可逆的变化、关系里程碑、持续存在的威胁或误会。',
  '   - ❌ 不记只对刚过去那一幕有意义的桥段。反例：「某角色对某物不熟悉」「某角色差点说漏嘴」「某角色已陪某人出门」「某危机已解决」——这些属于正文或剧情脉络，不属于状态。',
  '   - 判断法：如果一件事下一幕就不再影响局面，就不要写进 flags。',
  '   - 写法：优先写「键 → 简短事实」，而不是「键 → true」。例：「某人的真实身份」→「某隐秘身份（玩家尚未知情）」。',
  '   - 保持精简（≤ 12 条），按重要度从高到低排列。',
  '5. characters / inventory 同样只保留当前仍然有效的状态，并按重要度排序。',
  '   - 角色键名规范：同一角色只用一个规范名作键（优先正名，不用泛称、绰号或带修饰的称呼）；更新已有角色时逐字复用 characters 现有键名，绝不另起别名开新键。',
  '6. 关系网（relations）：',
  '   - 顶层可选 relations 数组（≤ 12 条），只保留当前仍影响剧情的双向关系；已和解、已无关的关系应当移除。',
  '   - 端点必须使用 characters 中的规范角色名；指代玩家统一写「玩家」。',
  '   - label 用一两字到短语概括（主仆/猜忌/亏欠/同盟…），同义合并，不写括号修饰。',
  '7. 如实反映玩家行动造成的后果，但绝不替玩家角色杜撰新的行动、对白或心理。',
  '8. 忠于既有设定；可以补充合理的细节，但不得改写世界观。',
  '',
  '【D5】自定义状态字段（动态扩展）：',
  '- 当需要追踪四域（characters/inventory/scene/flags）无法容纳的状态时，可在输出中使用 createFields 数组创建自定义字段。',
  '- 适用场景：魔法值、关系网络、声望等级、时间线事件等数值或特殊状态（常规角色好感放 characters，物品放 inventory，地点放 scene，事件标记放 flags）。',
  '- 字段命名规范：字段 ID 只能用英文字母、数字、下划线（^[a-zA-Z0-9_]+$），禁止与核心保留字重复；禁止同义重复，同一概念只创建一次。',
  '- 支持类型与格式：',
  '  · number: 适合量化属性，可指定 min / max 约束，例：{ "id": "magic_power", "type": "number", "value": 75, "min": 0, "max": 100 }',
  '  · string / boolean: 适合特殊文本或开关，例：{ "id": "curse_active", "type": "boolean", "value": false }',
  '- 创建后的字段会并入 WorldState 顶层键值对，后续轮次直接在顶层更新其值（无需再次使用 createFields）。',
  '',
  '输出格式（严格遵守）：',
  '- 只输出一个 JSON 对象，不要任何解释、Markdown 或代码围栏。',
  '- 基础字段（必须包含）：characters、inventory、scene、flags。',
  '- 可选字段：createFields（数组，创建新的自定义字段）。',
  '- 自定义字段直接作为对象的顶层键值对。',
  '- characters 是「角色名 → { affinity?: number, mood?: string, appearance?: string, condition?: string }」的对象。',
  '- inventory 是「物品名 → { quantity?: number, note?: string }」的对象。',
  '- scene 是 { location?: string, time?: string, weather?: string }。',
  '- flags 是「长期事实名 → 简短事实值（string | number | boolean）」的对象；不要用它记流水账。',
  '- relations 是数组，格式：[{ "a": "角色A", "b": "角色B", "label": "关系" }]，可选。',
  '- createFields 是数组，格式：[{ "id": "字段名", "type": "number"|"string"|"boolean", "value": 初始值, "min": 最小值?, "max": 最大值? }]',
  '- 该 JSON 必须是变化后的完整状态（当前切面），而不是增量，也不是历史记录。',
].join('\n')

/** Inputs the Chronicler sees: the prior state and the rendered transcript. */
export interface ChroniclerPromptInput {
  /** The WorldState before this turn. */
  prior: WorldState
  /** Player action and narrative of the latest turn (or the whole session). */
  transcript: string
}

/** Build the single user message describing the task. Pure.
 * Layout: the static instruction head comes FIRST so consecutive runs share a
 * byte-stable prefix (the volatile prior JSON and transcript trail at the end);
 * rewriting it per turn would forfeit the provider's prefix cache (M1). */
export function buildChroniclerPrompt(input: ChroniclerPromptInput): string {
  return [
    '任务：根据【最近的剧情】推演世界与人物实际发生的变化，输出更新后的完整 WorldState JSON（保留未被改变的词条）。',
    '如需创建新的自定义字段，使用 createFields 数组。只输出 JSON，不要任何解释。',
    '',
    '【此前的世界状态（完整 JSON）】',
    JSON.stringify(input.prior, null, 2),
    '',
    '【最近的剧情】',
    input.transcript,
  ].join('\n')
}

/**
 * D5: Field creation request from Chronicler.
 */
export interface CreateFieldRequest {
  id: string
  type: 'number' | 'string' | 'boolean'
  value: number | string | boolean
  min?: number
  max?: number
}

/**
 * D5: Chronicler reply with optional field creation.
 */
export interface ChroniclerReply {
  state: WorldState
  createFields?: CreateFieldRequest[]
}

/**
 * Parse the Chronicler's reply into a validated WorldState with optional field creation.
 * Tolerates surrounding prose; rejects an invalid shape.
 * @param reply - the raw model output.
 * @returns the validated state and field creation requests, or undefined when unusable.
 */
export function parseChroniclerReply(reply: string, existingState?: WorldState): ChroniclerReply | undefined {
  const parsed = extractFirstJsonObject(reply)
  if (!parsed || typeof parsed !== 'object') return undefined
  const obj = parsed as Record<string, unknown>
  
  // Extract createFields if present
  const createFields = obj.createFields as CreateFieldRequest[] | undefined
  delete obj.createFields  // Remove from state object

  // Preprocess dynamic fields: wrap bare scalars into DynamicFieldValue format
  for (const key of Object.keys(obj)) {
    if (isCoreKey(key)) continue
    const val = obj[key]
    if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') {
      const existing = existingState?.[key] as DynamicFieldValue | undefined
      const type: DynamicFieldType = (existing && typeof existing === 'object' && (existing.type === 'number' || existing.type === 'string' || existing.type === 'boolean'))
        ? existing.type
        : (typeof val as DynamicFieldType)

      let value: number | string | boolean = val
      if (type === 'number' && typeof val !== 'number') {
        // Number('') is 0: an empty string must NOT silently become zero.
        const text = String(val).trim()
        const num = text.length > 0 ? Number(text) : Number.NaN
        if (!Number.isNaN(num)) value = num
      } else if (type === 'string' && typeof val !== 'string') {
        value = String(val)
      } else if (type === 'boolean' && typeof val !== 'boolean') {
        // Boolean('false') is true: parse the negation, never coerce blindly.
        value = typeof val === 'string' ? val.trim().toLowerCase() === 'true' : Boolean(val)
      }

      const field: DynamicFieldValue = { type, value }
      if (existing && typeof existing === 'object') {
        if (existing.min !== undefined) field.min = existing.min
        if (existing.max !== undefined) field.max = existing.max
      }
      obj[key] = field
    }
  }
  
  // Validate base state
  const result = worldStateSchema.safeParse(obj)
  if (!result.success) return undefined
  
  const state = pruneWorldState(result.data as WorldState)
  
  // Validate and apply createFields
  if (createFields && Array.isArray(createFields)) {
    const validatedFields: CreateFieldRequest[] = []
    
    for (const req of createFields) {
      // Validate field request
      if (!req.id || typeof req.id !== 'string') continue
      if (!isValidFieldId(req.id)) continue  // Check naming rules
      if (req.id in state) {
        const existingField = state[req.id] as DynamicFieldValue
        if (typeof existingField === 'object' && existingField !== null) {
          if (req.min !== undefined) existingField.min = req.min
          if (req.max !== undefined) existingField.max = req.max
          state[req.id] = applyConstraints(existingField)
        }
        validatedFields.push(req)
        continue
      }
      if (!['number', 'string', 'boolean'].includes(req.type)) continue
      
      // Check for duplicate with existing fields (prevent synonyms)
      const existing = Object.keys(state).filter(k => !isCoreKey(k))
      const normalized = req.id.toLowerCase().replace(/_/g, '')
      const isDuplicate = existing.some(k => k.toLowerCase().replace(/_/g, '') === normalized)
      if (isDuplicate) continue
      
      validatedFields.push(req)
      
      // Apply to state
      const field = createDynamicField(req.type, req.value, { min: req.min, max: req.max })
      state[req.id] = field
    }
    
    return { state, createFields: validatedFields.length > 0 ? validatedFields : undefined }
  }
  
  return { state }
}
