import { describe, expect, it } from 'vitest'
import { SCRIBE_SYSTEM_PROMPT, buildScribePrompt, parseScribeReply } from '../src/agents/scribe.ts'

describe('Scribe reply contract', () => {
  it('parses a bare JSON draft and tolerates surrounding prose', () => {
    const draft = { name: 'qingqiu-fox-clan', description: '青丘狐族；涉及青丘时使用。', body: '# 青丘' }
    expect(parseScribeReply(JSON.stringify(draft))).toEqual(draft)
    expect(parseScribeReply('好的：\n' + JSON.stringify(draft) + '\n以上。')).toEqual(draft)
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
