/**
 * dsh-rrp — the Chronicler's domain core: prompt and reply contract.
 *
 * D4: the Chronicler is a judgment-bearing agent, not a JSON extractor. The
 * prompt says what to record and what to ignore; the reply contract is a
 * COMPLETE WorldState (the session-projection whole-value rule).
 */
import { worldStateSchema } from '../projection/world-state.ts'
import { pruneWorldState, type WorldState } from '../world-state.ts'

/** The Chronicler's persona and rules. */
export const CHRONICLER_SYSTEM_PROMPT = [
  '你是《DSH-Chronicle》的纪事官（Chronicler Agent）：一个冷静、客观、有判断力的世界推演者。',
  '你的唯一职责：在每一轮正文之后，推演世界与人物实际发生的变化，输出更新后的完整世界状态。',
  '',
  '推演准则：',
  '1. 只记录真实发生的变化：物理后果、心理波动、关系变动、场景推进、已揭示的事实。',
  '2. 忽略噪声：未被剧情确认的猜测、玩家的意图（而非已发生的结果）、纯修辞都不记录。',
  '3. 你维护的是「当前切面」，不是事件流水账：仍会影响后续剧情的事项要保留；已解决、已无关或被后续发展取代的条目应当移除（它们的历史由「大局编年」承载，不会丢失）。',
  '4. 按重要度维护：characters / inventory / flags 都按重要度从高到低排列；flags 保持精简（≤ 20 条），其值应是当前事实（如「米娅已知晓你的生日」），而不是「某轮发生了什么」的叙述。',
  '5. 如实反映玩家行动造成的后果，但绝不替玩家角色杜撰新的行动、对白或心理。',
  '6. 忠于既有设定；可以补充合理的细节，但不得改写世界观。',
  '',
  '输出格式（严格遵守）：',
  '- 只输出一个 JSON 对象，不要任何解释、Markdown 或代码围栏。',
  '- 对象必须包含且仅包含四个字段：characters、inventory、scene、flags。',
  '- characters 是「角色名 → { affinity?: number, mood?: string, appearance?: string, condition?: string }」的对象。',
  '- inventory 是「物品名 → { quantity?: number, note?: string }」的对象。',
  '- scene 是 { location?: string, time?: string, weather?: string }。',
  '- flags 是「事件/秘密/承诺名 → string | number | boolean」的对象。',
  '- 该 JSON 必须是变化后的完整状态（当前切面），而不是增量，也不是历史记录。',
].join('\n')

/** Inputs the Chronicler sees: the prior state and the rendered transcript. */
export interface ChroniclerPromptInput {
  /** The WorldState before this turn. */
  prior: WorldState
  /** Player action and narrative of the latest turn (or the whole session). */
  transcript: string
}

/** Build the single user message describing the task. Pure. */
export function buildChroniclerPrompt(input: ChroniclerPromptInput): string {
  return [
    '这是此前的世界状态（完整 JSON）：',
    JSON.stringify(input.prior, null, 2),
    '',
    '以下是最近的剧情：',
    input.transcript,
    '',
    '请据此输出更新后的完整 WorldState JSON（保留未被改变的词条）。只输出 JSON。',
  ].join('\n')
}

/**
 * Parse the Chronicler's reply into a validated WorldState.
 * Tolerates surrounding prose; rejects an invalid shape.
 * @param reply - the raw model output.
 * @returns the validated complete state, or undefined when unusable.
 */
export function parseChroniclerReply(reply: string): WorldState | undefined {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start === -1 || end <= start) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(reply.slice(start, end + 1))
  } catch {
    return undefined
  }
  const result = worldStateSchema.safeParse(parsed)
  return result.success ? pruneWorldState(result.data) : undefined
}
