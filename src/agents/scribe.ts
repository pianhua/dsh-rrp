/**
 * dsh-rrp — the Scribe Agent (D8): draft ONE skill from what already happened.
 *
 * D8 permits lore but forbids free-form world rewriting. The Scribe is
 * therefore deliberately constrained: it grounds every claim in the supplied
 * transcript / current state, emits exactly one candidate, and returns an EMPTY
 * candidate rather than inventing when the material does not support a skill.
 * The draft is never written by the model — the player confirms it first.
 *
 * Prompt shape follows the unified AgentPromptContract six-layer layout
 * (issue #32): identity → mandate → input contract → iron rules (with
 * when-then criteria) → output protocol (with ✓/✗ examples) → self-check.
 */
import { z } from 'zod'
import { LORE_LIMITS, isLoreName, type LoreEntry as LoreDraft } from '../lore-state.ts'
import { extractFirstJsonObject } from '../json-extract.ts'
import type { AgentPromptContract } from './contract.ts'

/** System prompt: one grounded skill, or nothing. */
export const SCRIBE_SYSTEM_PROMPT = [
  '你是《DSH-Chronicle》的知识起草（Scribe）：一位只认证据的档案员。',
  '',
  '你的唯一任务：把这次游玩中**已经真实发生并确立**的一条新设定，整理成一个可长期检索的技能条目。玩家在「设定集」页签审阅你的草稿；你写下的每一个字都必须能在正文或卡包基准中找到出处。',
  '',
  '【输入材料】',
  '- 【本次要沉淀的主题】：玩家点名的沉淀方向；未指定时，由你从最近剧情中挑一条最值得长期记住的新设定。',
  '- 【已有技能名】：本会话已沉淀条目的名字；只新增、不覆写。',
  '- 【卡包设定基准】【当前世界状态】【最近剧情】：证据来源；设定不得与卡包基准矛盾。',
  '',
  '铁律：',
  '1. 只写已经发生并被正文确认的事实；不得发明、不得推演、不得把猜测写成设定。',
  '2. 一次只写一个主题，对应一个技能；不要在一份草稿里塞多个设定。',
  '3. 只新增，不覆写：不要与「已有技能名」重复；若主题与已有技能重合，直接输出空草稿。',
  '4. 材料不足时不硬写，直接输出空草稿。判定标准：',
  '   - 主题只在正文出现一次，且未产生任何后续后果、承诺或揭示 → 空草稿。',
  '   - 主题与卡包既有设定重合（已有技能或设定基准已覆盖）→ 空草稿。',
  '   - 只有玩家口头提过、正文从未发生 → 空草稿。',
  '',
  '输出格式：只输出一个 JSON 对象，不要任何解释，第一个字符必须是 {：',
  '{"name":"<kebab-case-英文名>","description":"<一句话：这是什么，什么时候该加载它>","body":"<Markdown 正文，精炼、只含稳定事实>"}',
  '',
  '合格与不合格示例：',
  '- ✗ 不合格 body：「她似乎与狐族有某种联系，也许将来会揭晓……」——含推测词，正文未确认。',
  '- ✓ 合格 body：「青丘使者于雨夜到访，留下信物一枚，约定三月后再来。」——只含已发生事实。',
  '- ✗ 不合格 description：「关于米娅的设定。」——没写清何时该加载。',
  '- ✓ 合格 description：「调查沈家旧案时查阅：沈老爷遗嘱的真实内容与两位见证人。」——使用场景明确。',
  '',
  '约束：',
  '- name 只能用小写字母、数字、连字符（如 qingqiu-fox-clan）；',
  '- description 不超过 ' + String(LORE_LIMITS.descriptionChars) + ' 字，必须写清「何时使用」；',
  '- body 不超过 ' + String(LORE_LIMITS.bodyChars) + ' 字；',
  '- 无法沉淀时输出：{"name":"","description":"","body":""}。',
  '',
  '输出前自检：这条设定三场戏之后还成立吗？body 里有没有出现「可能/似乎/据说/也许」？description 写清什么场景该加载它了吗？——任何一问答不上来，就输出空草稿。',
].join('\n')

/** Build the user prompt from the play material. */
export function buildScribePrompt(input: {
  topic: string
  transcript: string
  worldState: string
  /** Rendered card baseline (worldCore + persona + player); empty when no card. */
  cardBaseline?: string
  existing: readonly string[]
}): string {
  return [
    '【本次要沉淀的主题】',
    input.topic.trim().length > 0 ? input.topic.trim() : '（未指定；从最近剧情中挑一条最值得长期记住的新设定）',
    '',
    '【已有技能名（不得重名）】',
    input.existing.length > 0 ? input.existing.join(', ') : '（无）',
    '',
    '【卡包设定基准（世界观与人设不得违背）】',
    input.cardBaseline !== undefined && input.cardBaseline.trim().length > 0 ? input.cardBaseline : '（无）',
    '',
    '【当前世界状态】',
    input.worldState,
    '',
    '【最近剧情】',
    input.transcript,
    '',
    '请按系统提示输出一个 JSON 对象。',
  ].join('\n')
}

/** Zod binding for the Scribe's structured output (AgentPromptContract). */
export const scribeDraftSchema = z.object({
  name: z.string().refine(isLoreName, 'name 必须是 kebab-case（小写字母/数字/连字符）'),
  description: z.string().min(1).max(LORE_LIMITS.descriptionChars),
  body: z.string().min(1).max(LORE_LIMITS.bodyChars),
})

/**
 * Extract a draft from a model reply, tolerating surrounding prose, Markdown
 * fences, and mid-stream truncation (shares the fault-tolerant ladder used by
 * every other structured agent — issue #32 P0). The declared
 * {@link scribeDraftSchema} is what decides, so the contract and the parse
 * cannot drift apart.
 */
export function parseScribeReply(text: string): LoreDraft | undefined {
  const parsed = extractFirstJsonObject(text)
  if (parsed === null || typeof parsed !== 'object') return undefined
  const record = parsed as Record<string, unknown>
  const candidate = {
    name: typeof record.name === 'string' ? record.name.trim() : record.name,
    description: typeof record.description === 'string' ? record.description.trim() : record.description,
    body: typeof record.body === 'string' ? record.body.trim() : record.body,
  }
  // An empty candidate is the Scribe's sanctioned "nothing to lore" answer.
  if (candidate.name === '' && candidate.description === '' && candidate.body === '') return undefined
  const result = scribeDraftSchema.safeParse(candidate)
  return result.success ? result.data : undefined
}

/** The Scribe's unified prompt contract (issue #32). */
export const scribeAgent: AgentPromptContract<
  { topic: string; transcript: string; worldState: string; cardBaseline?: string; existing: readonly string[] },
  LoreDraft
> = {
  id: 'scribe',
  name: '知识起草（Scribe）',
  systemPrompt: SCRIBE_SYSTEM_PROMPT,
  buildUserPrompt: buildScribePrompt,
  parseReply: parseScribeReply,
  outputSchema: scribeDraftSchema,
}
