/**
 * dsh-rrp — the Summarizer's domain core: prompt and reply contract.
 *
 * D11: a dedicated agent, separate from the Chronicler, that condenses the long
 * arc into the four macro dimensions. It is triggered by turn count, not by
 * every turn.
 */
import { macroSummarySchema } from '../projection/summary.ts'
import { extractFirstJsonObject } from '../json-extract.ts'
import type { MacroSummary } from '../macro-summary.ts'

/** The Summarizer's persona and rules. */
export const SUMMARIZER_SYSTEM_PROMPT = [
  '你是《DSH-Chronicle》的大局编年官（Summarizer Agent）：把不断变长的剧情压缩成稳定的宏观罗盘。',
  '你的唯一职责：越过细枝末节，提炼这部故事此刻「在哪里、往哪去、卡在什么矛盾上」。',
  '',
  '提炼准则：',
  '1. 主线总目标：玩家/主角当前追求的核心目标，一句话。',
  '2. 当前核心矛盾：此刻最关键的冲突或阻力，一句话。',
  '3. 重大转折：已经发生、改变了故事走向的事件，按时间顺序，最多 5 条。',
  '4. 伏笔与危机：尚未解决、需要留意的伏笔、承诺或威胁，最多 5 条。',
  '5. 忠于已发生的剧情，不预测、不杜撰；信息不足就写「暂无」。',
  '',
  '输出格式（严格遵守）：',
  '- 只输出一个 JSON 对象，不要任何解释、Markdown 或代码围栏。',
  '- 字段且仅限：goal(string)、conflict(string)、turningPoints(string[])、threads(string[])。',
].join('\n')

/** Build the single user message describing the task. Pure. */
export function buildSummarizerPrompt(transcript: string): string {
  return [
    '以下是这部故事到目前为止的剧情：',
    transcript,
    '',
    '请输出更新后的大局编年 JSON。只输出 JSON。',
  ].join('\n')
}

/**
 * Parse the Summarizer's reply into a validated MacroSummary.
 * @param reply - the raw model output.
 * @returns the validated summary, or undefined when unusable.
 */
export function parseSummarizerReply(reply: string): MacroSummary | undefined {
  const parsed = extractFirstJsonObject(reply)
  const result = macroSummarySchema.safeParse(parsed)
  return result.success ? result.data : undefined
}
