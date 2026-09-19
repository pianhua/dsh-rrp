/**
 * dsh-rrp — the Scribe Agent (D8): draft ONE skill from what already happened.
 *
 * D8 permits lore but forbids free-form world rewriting. The Scribe is
 * therefore deliberately constrained: it grounds every claim in the supplied
 * transcript / current state, emits exactly one candidate, and returns an EMPTY
 * candidate rather than inventing when the material does not support a skill.
 * The draft is never written by the model — the player confirms it first.
 */
import { LORE_LIMITS, isLoreName, type LoreEntry as LoreDraft } from '../lore-state.ts'

/** System prompt: one grounded skill, or nothing. */
export const SCRIBE_SYSTEM_PROMPT = [
  '你是《DSH-Chronicle》的设定集编纂者（Scribe）。',
  '',
  '你的唯一任务：把这次游玩中**已经真实发生并确立**的一条新设定，整理成一个可长期检索的技能条目。',
  '',
  '铁律：',
  '1. 只写已经发生并被正文确认的事实；不得发明、不得推演、不得把猜测写成设定。',
  '2. 一次只写一个主题，对应一个技能；不要在一份草稿里塞多个设定。',
  '3. 只新增，不覆写：不要与「已有技能名」重复；若主题与已有技能重合，直接输出空草稿。',
  '4. 若材料不足以支撑一条稳定设定，直接输出空草稿，不要勉强编造。',
  '',
  '输出格式：只输出一个 JSON 对象，不要任何解释：',
  '{"name":"<kebab-case-英文名>","description":"<一句话：这是什么，什么时候该加载它>","body":"<Markdown 正文，精炼、只含稳定事实>"}',
  '',
  '约束：',
  '- name 只能用小写字母、数字、连字符（如 qingqiu-fox-clan）；',
  '- description 不超过 ' + String(LORE_LIMITS.descriptionChars) + ' 字，必须写清「何时使用」；',
  '- body 不超过 ' + String(LORE_LIMITS.bodyChars) + ' 字；',
  '- 无法沉淀时输出：{"name":"","description":"","body":""}。',
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

/** Extract a draft from a model reply, tolerating surrounding prose. */
export function parseScribeReply(text: string): LoreDraft | undefined {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object') return undefined
  const record = parsed as Record<string, unknown>
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const description = typeof record.description === 'string' ? record.description.trim() : ''
  const body = typeof record.body === 'string' ? record.body.trim() : ''
  // An empty candidate is the Scribe's sanctioned "nothing to lore" answer.
  if (name.length === 0 && description.length === 0 && body.length === 0) return undefined
  if (!isLoreName(name)) return undefined
  if (description.length === 0 || body.length === 0) return undefined
  if (description.length > LORE_LIMITS.descriptionChars || body.length > LORE_LIMITS.bodyChars) return undefined
  return { name, description, body }
}
