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
import { summarizerAgent, SUMMARIZER_SYSTEM_PROMPT, parseSummarizerReply } from '../src/agents/summarizer.ts'
import { scribeAgent, SCRIBE_SYSTEM_PROMPT, scribeDraftSchema } from '../src/agents/scribe.ts'
import { copilotAgent, COPILOT_SYSTEM_PROMPT } from '../src/agents/copilot.ts'
import { macroSummarySchema } from '../src/projection/summary.ts'
import { SUMMARY_LIMITS } from '../src/macro-summary.ts'
import { LORE_LIMITS } from '../src/lore-state.ts'
import { applyConstraints, emptyWorldState, WORLD_STATE_LIMITS, WORLD_STATE_TARGETS } from '../src/world-state.ts'

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

  it('summarizer prompt states the same caps the parser enforces', () => {
    expect(SUMMARIZER_SYSTEM_PROMPT).toContain('最多 ' + String(SUMMARY_LIMITS.entries) + ' 条')
    expect(SUMMARIZER_SYSTEM_PROMPT).toContain('≤ ' + String(SUMMARY_LIMITS.entryChars) + ' 字')
    expect(SUMMARIZER_SYSTEM_PROMPT).toContain('≤ ' + String(SUMMARY_LIMITS.headlineChars) + ' 字')
    const shape = macroSummarySchema.shape
    const tooMany = Array.from({ length: SUMMARY_LIMITS.entries + 1 }, (_, index) => '第' + String(index) + '条')
    expect(shape.turningPoints.safeParse(tooMany).success).toBe(false)
    expect(shape.threads.safeParse(tooMany).success).toBe(false)
    // An over-long line is clamped, never a reason to lose the whole compass.
    const long = '一'.repeat(SUMMARY_LIMITS.headlineChars + 20)
    const clamped = parseSummarizerReply(JSON.stringify({
      goal: long,
      conflict: long,
      turningPoints: ['一'.repeat(SUMMARY_LIMITS.entryChars + 20)],
      threads: [],
    }))
    expect(clamped?.goal.length).toBe(SUMMARY_LIMITS.headlineChars)
    expect(clamped?.turningPoints[0]?.length).toBe(SUMMARY_LIMITS.entryChars)
    // Count, in contrast, stays a hard reject.
    expect(parseSummarizerReply(JSON.stringify({ goal: '目标', conflict: '矛盾', turningPoints: tooMany, threads: [] }))).toBeUndefined()
  })

  it('chronicler prompt states a lean target inside the hard cap it is pruned by', () => {
    expect(WORLD_STATE_TARGETS.flags).toBeLessThanOrEqual(WORLD_STATE_LIMITS.flags)
    expect(WORLD_STATE_TARGETS.relations).toBeLessThanOrEqual(WORLD_STATE_LIMITS.relations)
    expect(CHRONICLER_SYSTEM_PROMPT).toContain('目标 ≤ ' + String(WORLD_STATE_TARGETS.flags) + ' 条，硬上限 ' + String(WORLD_STATE_LIMITS.flags) + ' 条')
    expect(CHRONICLER_SYSTEM_PROMPT).toContain('目标 ≤ ' + String(WORLD_STATE_TARGETS.relations) + ' 条，硬上限 ' + String(WORLD_STATE_LIMITS.relations) + ' 条')
    // A dynamic string field is clamped to the declared ceiling on every write path.
    const long = '记'.repeat(WORLD_STATE_LIMITS.dynamicStringChars + 40)
    const capped = applyConstraints({ type: 'string', value: long })
    expect(typeof capped.value === 'string' ? capped.value.length : -1).toBe(WORLD_STATE_LIMITS.dynamicStringChars)
  })

  it('scribe prompt states the same limits its schema binds', () => {
    expect(SCRIBE_SYSTEM_PROMPT).toContain(String(LORE_LIMITS.descriptionChars) + ' 字')
    expect(SCRIBE_SYSTEM_PROMPT).toContain(String(LORE_LIMITS.bodyChars) + ' 字')
    expect(scribeDraftSchema.safeParse({
      name: 'valid-name',
      description: 'x'.repeat(LORE_LIMITS.descriptionChars + 1),
      body: '正文',
    }).success).toBe(false)
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
    expect(AUTHOR_SYSTEM_PROMPT).toContain('macro compass (剧情脉络)')
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

  it('copilot prompt is the omniscient 月停 and names both proposal actions (issue #33)', () => {
    expect(COPILOT_SYSTEM_PROMPT).toContain('月停')
    expect(COPILOT_SYSTEM_PROMPT).toContain('propose_card_edit')
    expect(COPILOT_SYSTEM_PROMPT).toContain('propose_doc_note')
  })

  it('scribe prompt keeps the sanctioned empty-draft answer and ✓/✗ examples', () => {
    expect(SCRIBE_SYSTEM_PROMPT).toContain('只新增')
    expect(SCRIBE_SYSTEM_PROMPT).toContain('合格与不合格示例')
    expect(SCRIBE_SYSTEM_PROMPT).toContain('{"name":"","description":"","body":""}')
  })
})
