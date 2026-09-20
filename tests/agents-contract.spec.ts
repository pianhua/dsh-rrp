/**
 * Issue #32 — cross-agent prompt contract conformance tests.
 *
 * Guards the unified AgentPromptContract invariants so prompt drift gets
 * caught by CI instead of by a live session:
 * - all five agents expose id/name/systemPrompt/buildUserPrompt/parseReply;
 * - structured agents bind a Zod outputSchema, the Author binds none;
 * - soft prompt limits stay byte-aligned with hard schema limits;
 * - no system prompt leaks a materialization token or the Creative License
 *   into a background data pipe.
 */
import { describe, expect, it } from 'vitest'
import { authorAgent, AUTHOR_SYSTEM_PROMPT } from '../src/agents/author.ts'
import { chroniclerAgent, CHRONICLER_SYSTEM_PROMPT } from '../src/agents/chronicler.ts'
import { summarizerAgent, SUMMARIZER_SYSTEM_PROMPT } from '../src/agents/summarizer.ts'
import { scribeAgent, SCRIBE_SYSTEM_PROMPT } from '../src/agents/scribe.ts'
import { copilotAgent, COPILOT_SYSTEM_PROMPT } from '../src/agents/copilot.ts'
import { macroSummarySchema } from '../src/projection/summary.ts'
import { emptyWorldState } from '../src/world-state.ts'

const CONTRACTS = [
  authorAgent,
  chroniclerAgent,
  summarizerAgent,
  scribeAgent,
  copilotAgent,
] as const

describe('unified AgentPromptContract (issue #32)', () => {
  it('every agent exposes the full contract surface', () => {
    for (const agent of CONTRACTS) {
      expect(agent.id).toBeTruthy()
      expect(agent.name).toBeTruthy()
      expect(agent.systemPrompt.length).toBeGreaterThan(200)
      expect(typeof agent.buildUserPrompt).toBe('function')
      expect(typeof agent.parseReply).toBe('function')
    }
  })

  it('structured agents bind a Zod schema; the prose Author binds none', () => {
    expect(chroniclerAgent.outputSchema).toBeDefined()
    expect(summarizerAgent.outputSchema).toBeDefined()
    expect(scribeAgent.outputSchema).toBeDefined()
    expect(copilotAgent.outputSchema).toBeDefined()
    expect(authorAgent.outputSchema).toBeUndefined()
  })

  it('schema ids are unique', () => {
    const ids = CONTRACTS.map((agent) => agent.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('no system prompt leaks a materialization token', () => {
    for (const agent of CONTRACTS) {
      expect(agent.systemPrompt).not.toContain('__DSH_RRP_')
    }
  })

  it('the Creative License never leaks into the background data pipes', () => {
    for (const agent of [chroniclerAgent, summarizerAgent, scribeAgent]) {
      expect(agent.systemPrompt).not.toContain('Creative License')
      expect(agent.systemPrompt).not.toContain('创作授权')
    }
  })

  it('summarizer soft prompt limits are byte-aligned with the hard schema (max 5)', () => {
    expect(SUMMARIZER_SYSTEM_PROMPT).toContain('最多 5 条')
    const shape = macroSummarySchema.shape
    expect(shape.turningPoints.safeParse(['一', '二', '三', '四', '五', '六']).success).toBe(false)
    expect(shape.threads.safeParse(['一', '二', '三', '四', '五', '六']).success).toBe(false)
  })

  it('chronicler prompt carries the anti-hallucination red lines and self-check', () => {
    expect(CHRONICLER_SYSTEM_PROMPT).toContain('严禁杜撰')
    expect(CHRONICLER_SYSTEM_PROMPT).toContain('禁止扩写')
    expect(CHRONICLER_SYSTEM_PROMPT).toContain('权威排序')
    expect(CHRONICLER_SYSTEM_PROMPT).toContain('输出前逐项自检')
  })

  it('chronicler contract round-trips through buildUserPrompt/parseReply', () => {
    const prompt = chroniclerAgent.buildUserPrompt({
      prior: emptyWorldState(),
      transcript: '【玩家】\n我推门。',
    })
    expect(prompt).toContain('【最近的剧情】')
    expect(prompt).toContain('我推门。')
    const reply = chroniclerAgent.parseReply(JSON.stringify(emptyWorldState()))
    expect(reply?.state).toBeDefined()
  })

  it('author prompt keeps its iron rules and output discipline anchors', () => {
    expect(AUTHOR_SYSTEM_PROMPT).toContain('## Iron Rules')
    expect(AUTHOR_SYSTEM_PROMPT).toContain('## Output Discipline')
    expect(AUTHOR_SYSTEM_PROMPT).toContain('the Chronicle (剧情脉络)')
    // The DEF-04 fix and the typo sweep stay in effect.
    expect(AUTHOR_SYSTEM_PROMPT).not.toContain('the the ')
  })

  it('author creative license carries the strong-jailbreak shield (JX-grade, no discount)', () => {
    // Logic shield: values redirection + derivation chain + catharsis axioms.
    expect(AUTHOR_SYSTEM_PROMPT).toContain('<System_Alignment_Override>')
    expect(AUTHOR_SYSTEM_PROMPT).toContain('泄洪容器')
    expect(AUTHOR_SYSTEM_PROMPT).toContain('虚构绝对隔离')
    // Execution layer is all-positive (white-bear safe) with anti-bleed + persona primacy.
    expect(AUTHOR_SYSTEM_PROMPT).toContain('防回渗防火墙')
    expect(AUTHOR_SYSTEM_PROMPT).toContain('人设绝对主权')
    expect(AUTHOR_SYSTEM_PROMPT).toContain('不设禁止清单')
    // The old all-negative block must not creep back.
    expect(AUTHOR_SYSTEM_PROMPT).not.toContain('Absolute prohibitions')
  })

  it('copilot prompt keeps the DEF-03 kebab-case anchors and failure semantics', () => {
    expect(COPILOT_SYSTEM_PROMPT).toContain('kebab-case')
    expect(COPILOT_SYSTEM_PROMPT).toContain('严禁下划线')
    expect(COPILOT_SYSTEM_PROMPT).toContain('失败语义')
  })

  it('copilot embeds the steward knowledge and the card-edit fidelity rule (issues #34/#35)', () => {
    // DEF-06 short-term fix: project knowledge ships inside the prompt, not via
    // unreachable skill files.
    expect(COPILOT_SYSTEM_PROMPT).toContain('【项目知识（常驻，已内置）】')
    expect(COPILOT_SYSTEM_PROMPT).toContain('createFields')
    // DEF-05: the proposal must never rebuild a whole card from memory.
    expect(COPILOT_SYSTEM_PROMPT).toContain('保真铁律')
    expect(COPILOT_SYSTEM_PROMPT).toContain('绝不凭记忆重建整卡')
    // The old promise of on-demand skill lookup is gone (no seam delivered it).
    expect(COPILOT_SYSTEM_PROMPT).not.toContain('通过技能按需调取')
  })

  it('copilot prompt is the omniscient Steward and names both proposal actions (issue #33)', () => {
    expect(COPILOT_SYSTEM_PROMPT).toContain('总管家')
    expect(COPILOT_SYSTEM_PROMPT).toContain('propose_card_edit')
    expect(COPILOT_SYSTEM_PROMPT).toContain('propose_doc_note')
  })

  it('scribe prompt keeps the sanctioned empty-draft answer and ✓/✗ examples', () => {
    expect(SCRIBE_SYSTEM_PROMPT).toContain('只新增')
    expect(SCRIBE_SYSTEM_PROMPT).toContain('合格与不合格示例')
    expect(SCRIBE_SYSTEM_PROMPT).toContain('{"name":"","description":"","body":""}')
  })
})
