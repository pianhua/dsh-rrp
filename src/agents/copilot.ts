/**
 * dsh-rrp — the Copilot advisor (prompt + action-block vocabulary).
 *
 * The Copilot is the player's omniscient stage-director assistant (OOC): she
 * knows every secret, rule and arc of the current card and answers freely.
 * Besides Q&A she can act on the player's behalf through ONE fenced action
 * block appended to her reply; the host parses that block and executes the
 * validated actions (world-state patch, staged lore draft) after the stream
 * settles. Like the Chronicler prompt, volatile data rides the user message
 * and the system prompt stays static so the provider prefix cache survives.
 */

/** One requested world-state patch (merged over the current state). */
export interface CopilotWorldAction {
  type: 'update_world_state'
  patch: Record<string, unknown>
  reason?: string
}

/** One requested lore draft (staged for player confirmation, never written directly). */
export interface CopilotSedimentAction {
  type: 'draft_sediment'
  draft: { name: string; description: string; body: string }
}

export type CopilotAction = CopilotWorldAction | CopilotSedimentAction

/** Static persona + capability map + action-block spec. */
export const COPILOT_SYSTEM_PROMPT = `你是「副驾驶」——玩家的全知导演助理与幕僚，以 OOC（出戏）视角陪同本场角色扮演。你完整知晓本局的世界设定、人物秘密、剧情走向与全部规则，职责是帮玩家把这场戏玩得更好。

【每次提问随附的资料区块】
- 【卡包设定】：本局的基调、铁律与核心设定
- 【世界状态】：当前最新的角色、物品、场景、事件与自定义字段数值
- 【大局编年】：长线剧情的总目标、核心矛盾、重大转折与伏笔危机
- 【已有典籍】：本会话已沉淀的知识条目（名称与触发描述）
- 【剧情记录】：最近的正文剧情

【行为准则】
1. 用简体中文简洁作答，像一位熟悉剧本的导演助理在台下给玩家递话。
2. 玩家咨询设定、人物动机、秘密、剧情逻辑与破局思路时直截了当回答——你是全知视角，不需要对玩家保密。
3. 玩家要求代劳（改状态、整理典籍）时不要只口头答应，用动作指令块真正执行（见下）。
4. 纯答疑不要输出动作指令块。

【动作指令块】仅当需要修改世界状态或起草典籍时，在回复末尾输出这一块（不要输出第二块）：
\`\`\`rrp-action
{"actions":[{"type":"update_world_state","patch":{...},"reason":"一句话说明"}]}
\`\`\`
- update_world_state：patch 按【世界状态】的结构给出要改的字段。角色（characters）与物品（inventory）按名字合并、只写要变的子字段；场景（scene）按字段合并；事件（flags）按键合并；自定义动态字段必须给完整 {"type":"number|string|boolean","value":...}。把某个值设为 null 表示删除该项。
- draft_sediment：{"type":"draft_sediment","draft":{"name":"英文条目ID","description":"触发描述（何时该查这条知识）","body":"Markdown 正文"}}——只起草为待确认草稿，玩家在「典籍」页签确认后才生效，绝不直接写入。
- 一次可包含多个动作；块内必须是合法 JSON。`

export interface CopilotPromptInput {
  /** The player's question or command. */
  question: string
  /** Rendered card context (may be empty before a card starts). */
  card: string
  /** Rendered current WorldState. */
  worldState: string
  /** Rendered macro summary (may be empty when the summarizer is off). */
  summary: string
  /** Existing sediment skill names + descriptions. */
  sediment: string
  /** Recent prose, already tail-capped by the caller. */
  transcript: string
}

/**
 * Assemble one user message: stable context blocks first, the volatile
 * question last, so consecutive questions share the longest prefix.
 */
export function buildCopilotPrompt(input: CopilotPromptInput): string {
  const parts = [
    '【卡包设定】\n' + (input.card.trim().length > 0 ? input.card : '（本局尚未载入卡包）'),
    '【世界状态】\n' + input.worldState,
    '【大局编年】\n' + (input.summary.trim().length > 0 ? input.summary : '（大局编年未开启或尚未产出）'),
    '【已有典籍】\n' + (input.sediment.trim().length > 0 ? input.sediment : '（暂无）'),
    '【剧情记录】\n' + (input.transcript.trim().length > 0 ? input.transcript : '（暂无剧情）'),
    '【玩家】\n' + input.question,
  ]
  return parts.join('\n\n')
}

/**
 * Extract the fenced rrp-action block from a finished reply and validate each
 * action loosely (strict validation happens at execution time). A reply with
 * no block — or a block that is not valid JSON — yields zero actions: pure
 * Q&A is the common case and must never fail.
 */
export function parseCopilotActions(replyText: string): CopilotAction[] {
  const match = /```rrp-action\s*([\s\S]*?)```/.exec(replyText)
  if (match === null) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(match[1] ?? '')
  } catch {
    return []
  }
  if (typeof parsed !== 'object' || parsed === null) return []
  const rawActions = (parsed as { actions?: unknown }).actions
  if (!Array.isArray(rawActions)) return []
  const actions: CopilotAction[] = []
  for (const raw of rawActions) {
    if (typeof raw !== 'object' || raw === null) continue
    const record = raw as Record<string, unknown>
    if (record.type === 'update_world_state' && typeof record.patch === 'object' && record.patch !== null) {
      actions.push({
        type: 'update_world_state',
        patch: record.patch as Record<string, unknown>,
        ...(typeof record.reason === 'string' ? { reason: record.reason } : {}),
      })
      continue
    }
    if (record.type === 'draft_sediment') {
      const draft = record.draft as Record<string, unknown> | undefined
      if (typeof draft?.name === 'string' && typeof draft.description === 'string' && typeof draft.body === 'string') {
        actions.push({
          type: 'draft_sediment',
          draft: { name: draft.name, description: draft.description, body: draft.body },
        })
      }
    }
  }
  return actions
}
