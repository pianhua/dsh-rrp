import { describe, expect, it } from 'vitest'
import { SCRIBE_SYSTEM_PROMPT, buildScribePrompt, parseScribeReply } from '../src/agents/scribe.ts'
import { LORE_LIMITS } from '../src/lore-state.ts'

describe('Scribe reply contract', () => {
  it('parses a bare JSON draft and tolerates surrounding prose', () => {
    const draft = { name: 'qingqiu-fox-clan', description: '青丘狐族；涉及青丘时使用。', body: '# 青丘' }
    expect(parseScribeReply(JSON.stringify(draft))).toEqual(draft)
    expect(parseScribeReply('好的：\n' + JSON.stringify(draft) + '\n以上。')).toEqual(draft)
  })

  it('tolerates Markdown fences and mid-stream truncation (issue #32 P0)', () => {
    const draft = { name: 'qingqiu-fox-clan', description: '青丘狐族；涉及青丘时使用。', body: '# 青丘' }
    // Fenced output — the old indexOf slicer choked on the fence text.
    expect(parseScribeReply('```json\n' + JSON.stringify(draft) + '\n```')).toEqual(draft)
    // Cut mid-body: the shared ladder salvages the last COMPLETE field prefix
    // and drops the dangling partial string; a draft without its required body
    // degrades to "nothing to lore" (the runtime logs `failed`, next round
    // re-drafts) instead of sealing a half-word into the lore body.
    const truncated = JSON.stringify(draft).slice(0, -2)
    expect(parseScribeReply(truncated)).toBeUndefined()
  })

  it('treats an empty candidate as "nothing to lore"', () => {
    expect(parseScribeReply('{"name":"","description":"","body":""}')).toBeUndefined()
    expect(parseScribeReply('没有可沉淀的内容')).toBeUndefined()
    expect(parseScribeReply('{ not json }')).toBeUndefined()
  })

  it('rejects an illegal name or missing fields', () => {
    expect(parseScribeReply('{"name":"Bad Name","description":"d","body":"b"}')).toBeUndefined()
    expect(parseScribeReply('{"name":"ok-name","description":"","body":"b"}')).toBeUndefined()
    expect(parseScribeReply('{"name":"ok-name","description":"d","body":"b"}')).toEqual({ name: 'ok-name', description: 'd', body: 'b' })
  })

  it('builds a prompt carrying the topic, existing names, state and transcript', () => {
    const prompt = buildScribePrompt({
      topic: '青丘狐族',
      transcript: '【叙述】\n青丘的使者来了。',
      worldState: 'characters: {"青丘使者":{}}',
      existing: ['maid-mia'],
    })
    expect(prompt).toContain('青丘狐族')
    expect(prompt).toContain('maid-mia')
    expect(prompt).toContain('青丘的使者来了')
    expect(SCRIBE_SYSTEM_PROMPT).toContain('只新增')
  })

  it('carries the card baseline (worldCore + persona) when supplied', () => {
    const prompt = buildScribePrompt({
      topic: '',
      transcript: '【叙述】\n青丘的使者来了。',
      worldState: 'characters: {}',
      cardBaseline: '【当前卡包 · 设定基准】\n卡包：女仆与继承人\n—— 世界核心 ——\n青丘法则',
      existing: [],
    })
    expect(prompt).toContain('青丘法则')
    expect(prompt).toContain('不得违背')
  })
})

describe('Scribe reply contract binds its declared schema', () => {
  it('rejects an oversized body instead of waving it through', () => {
    const long = '设'.repeat(LORE_LIMITS.bodyChars + 1)
    expect(parseScribeReply(JSON.stringify({ name: 'qing-qiu-rule', description: '新设定出现时', body: long }))).toBeUndefined()
    expect(parseScribeReply(JSON.stringify({ name: 'Qing Qiu', description: 'x', body: '正文' }))).toBeUndefined()
    expect(parseScribeReply(JSON.stringify({ name: 'qing-qiu-rule', description: '新设定出现时', body: '青丘法则。' }))).toEqual({
      name: 'qing-qiu-rule',
      description: '新设定出现时',
      body: '青丘法则。',
    })
  })

  it('treats the empty candidate as "nothing to lore", not a parse failure', () => {
    expect(parseScribeReply('{"name":"","description":"","body":""}')).toBeUndefined()
  })
})
