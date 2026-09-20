/**
 * dsh-rrp — the Summarizer's domain core: prompt and reply contract.
 *
 * D11: a dedicated agent, separate from the Chronicler, that condenses the long
 * arc into the four macro dimensions. It is triggered by turn count, not by
 * every turn.
 *
 * Issue #32 upgrade: the prompt grew from a 15-line sketch into the unified
 * six-layer contract — negative constraints, a turningPoints/threads decision
 * rule, a shape example, quantified budgets, and an output self-check. The
 * "最多 5 条" soft limit is now also hard-enforced by `macroSummarySchema.max(5)`.
 */
import { macroSummarySchema } from '../projection/summary.ts'
import { extractFirstJsonObject } from '../json-extract.ts'
import { SUMMARY_LIMITS, type MacroSummary } from '../macro-summary.ts'
import type { AgentPromptContract } from './contract.ts'

/** The Summarizer's persona and rules. */
export const SUMMARIZER_SYSTEM_PROMPT = [
  '你是《DSH-Chronicle》的剧情脉络（Summarizer Agent）：把不断变长的剧情压缩成一块稳定的宏观罗盘，供执笔端与玩家随时校准故事方向。',
  '',
  '你的唯一职责：越过细枝末节，提炼这部故事此刻「在哪里、往哪去、卡在什么矛盾上」。你是纯数据处理管道：只归纳已发生的事实，绝不创作、绝不续写剧情。',
  '',
  '【输入契约】你会收到【长程剧情】或【全程剧情】的正文记录；它可能很长，也可能包含水文与失败的回合。你的工作是去芜存菁，不是复述。',
  '',
  '提炼准则：',
  '1. 主线总目标（goal）：玩家/主角当前追求的核心目标，一句话（≤ ' + String(SUMMARY_LIMITS.headlineChars) + ' 字）。',
  '2. 当前核心矛盾（conflict）：此刻最关键的冲突或阻力，一句话（≤ ' + String(SUMMARY_LIMITS.headlineChars) + ' 字）。',
  '3. 重大转折（turningPoints）：已经发生、且已改变故事走向的事件，按时间顺序，最多 ' + String(SUMMARY_LIMITS.entries) + ' 条（每条 ≤ ' + String(SUMMARY_LIMITS.entryChars) + ' 字）。',
  '4. 伏笔与危机（threads）：尚未解决、后续需要留意的伏笔、承诺或威胁，最多 ' + String(SUMMARY_LIMITS.entries) + ' 条（每条 ≤ ' + String(SUMMARY_LIMITS.entryChars) + ' 字）。',
  '5. 判定法：事件已落定、改变了走向 → 进 turningPoints；仍未解决、后续会回收 → 进 threads。同一件事不要两边都写。',
  '6. 忠于已发生的剧情，不预测、不杜撰；某个维度信息不足就写「暂无」。',
  '',
  '铁律（违反即作废）：',
  '1. 严禁写未来：不预测、不规划「接下来可能会」。',
  '2. 严禁心理流水账：禁止「主角正在思考下一步」「心中充满迷茫」等无信息量的虚词。',
  '3. 严禁堆细节：不写物品清单、数值与场景白描——那些属于世界状态，不属于宏观罗盘。',
  '4. 每条必须点出具体的人物与事件；禁用人称代词开头的空转句（如「他做出了决定」）。',
  '',
  '输出格式（严格遵守）：',
  '- 只输出一个 JSON 对象，不要任何解释、Markdown 或代码围栏，第一个字符必须是 {。',
  '- 字段且仅限：goal(string)、conflict(string)、turningPoints(string[])、threads(string[])。',
  '- 形状示例：',
  '{"goal":"找出遗嘱原件，揭穿管家的篡改编造","conflict":"管家已烧毁誊本，而米娅的身份不能暴露","turningPoints":["雨夜老宅会面，老剑客亮出前朝信物","米娅为护玩家首次动用了家族暗卫"],"threads":["沈老爷临终前提到的「第三份文件」下落不明","暗卫统领欠米娅一个人情，尚未讨还"]}',
  '',
  '输出前自检：① 第一个字符是 {，全文无任何引导语；② 每条 turningPoints 是否都已「尘埃落定」？每条 threads 是否都「尚未解决」？③ 有没有出现「迷茫/成长/感动」这类无信息词？——有则改写后再输出。',
].join('\n')

/** Build the single user message describing the task. Pure. */
export function buildSummarizerPrompt(transcript: string): string {
  return [
    '以下是这部故事到目前为止的剧情：',
    transcript,
    '',
    '请输出更新后的剧情脉络 JSON。只输出 JSON。',
  ].join('\n')
}

/**
 * Parse the Summarizer's reply into a validated MacroSummary.
 * @param reply - the raw model output.
 * @returns the validated summary, or undefined when unusable.
 */
export function parseSummarizerReply(reply: string): MacroSummary | undefined {
  const parsed = extractFirstJsonObject(reply)
  const result = macroSummarySchema.safeParse(clampCompass(parsed))
  return result.success ? result.data : undefined
}

/**
 * Bring one line inside its {@link SUMMARY_LIMITS} ceiling before validation.
 * Only LENGTHS are clamped: a 41-character goal must not cost the Author the
 * whole compass. Entry COUNTS stay a hard reject — the schema caps them, and a
 * model that overruns the compass budget is a malformed reply, not a long one.
 */
function clampCompass(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  const line = (text: unknown, limit: number): unknown =>
    typeof text === 'string' && text.length > limit ? text.slice(0, limit - 1) + '…' : text
  const list = (items: unknown, limit: number): unknown =>
    Array.isArray(items) ? items.map((item) => line(item, limit)) : items
  return {
    ...record,
    goal: line(record.goal, SUMMARY_LIMITS.headlineChars),
    conflict: line(record.conflict, SUMMARY_LIMITS.headlineChars),
    turningPoints: list(record.turningPoints, SUMMARY_LIMITS.entryChars),
    threads: list(record.threads, SUMMARY_LIMITS.entryChars),
  }
}

/** The Summarizer's unified prompt contract (issue #32). */
export const summarizerAgent: AgentPromptContract<string, MacroSummary> = {
  id: 'summarizer',
  name: '剧情脉络（Summarizer）',
  systemPrompt: SUMMARIZER_SYSTEM_PROMPT,
  buildUserPrompt: buildSummarizerPrompt,
  parseReply: parseSummarizerReply,
  outputSchema: macroSummarySchema,
}
