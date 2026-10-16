import { describe, expect, it } from 'vitest'
import {
  createRecallScope,
  excerpt,
  recallHistory,
  renderRecall,
  termsOf,
  type RecallRound,
} from '../src/recall.ts'

const SAMPLE_ROUNDS: RecallRound[] = [
  { turn: 0, player: '开局准备', prose: '雨夜里，林遥第一次抵达白塔。' },
  {
    turn: 1,
    player: '我把银钥匙交给守门人。',
    prose: '守门人收下银钥匙，承诺在钟响三次后打开北门。',
  },
  {
    turn: 2,
    player: '林遥和我穿过北门。',
    prose: '穿过狭窄的走廊，前方出现了一座古老的青铜石室。',
  },
  { turn: 3, player: '点燃火把照亮石室。', prose: '火光摇曳，石壁上刻着前朝暗卫的鹰隼纹章。' },
  { turn: 4, player: '仔细观察鹰隼纹章。', prose: '纹章中央似乎藏着一个机关凹槽。' },
]

describe('History Recall Engine (src/recall.ts)', () => {
  it('throws when neither or both query and turn are provided', () => {
    expect(() => recallHistory({ rounds: SAMPLE_ROUNDS })).toThrow('必须且只能提供 query 或 turn')
    expect(() => recallHistory({ rounds: SAMPLE_ROUNDS, query: '钥匙', turn: 1 })).toThrow(
      '必须且只能提供 query 或 turn',
    )
  })

  it('performs keyword search and ranks matches by relevance and recency', () => {
    const result = recallHistory({ rounds: SAMPLE_ROUNDS, query: '银钥匙 守门人' })
    expect(result.found).toBe(true)
    expect(result.mode).toBe('search')
    expect(result.matches.length).toBeGreaterThan(0)
    expect(result.matches[0]?.turn).toBe(1)
    expect(result.matches[0]?.excerpt).toContain('银钥匙')
  })

  it('cuts excerpts to maximum length and centers around matching term', () => {
    const terms = termsOf('暗卫')
    expect(terms).toEqual(['暗卫'])
    const snippet = excerpt('很长的文本很长的文本前朝暗卫的鹰隼纹章很长的文本', terms, 20)
    expect(snippet).toContain('暗卫')
  })

  it('reads specific turn and adjacent radius turns', () => {
    const result = recallHistory({ rounds: SAMPLE_ROUNDS, turn: 2, radius: 1 })
    expect(result.found).toBe(true)
    expect(result.mode).toBe('read')
    expect(result.rounds.map((r) => r.turn)).toEqual([1, 2, 3])
  })

  it('enforces single-scope budget of 6 calls max', () => {
    const scope = createRecallScope()
    for (let i = 0; i < 6; i++) {
      recallHistory({ rounds: SAMPLE_ROUNDS, turn: i % 5, scope })
    }
    const seventh = recallHistory({ rounds: SAMPLE_ROUNDS, query: '白塔', scope })
    expect(seventh.matches).toHaveLength(0)
    expect(seventh.notice).toContain('预算已用尽')
  })

  it('deduplicates identical searches within the same scope', () => {
    const scope = createRecallScope()
    recallHistory({ rounds: SAMPLE_ROUNDS, query: '白塔', scope })
    const second = recallHistory({ rounds: SAMPLE_ROUNDS, query: '白塔', scope })
    expect(second.notice).toContain('相同关键词已检索')
  })

  it('deduplicates overlapping rounds read within the same scope', () => {
    const scope = createRecallScope()
    recallHistory({ rounds: SAMPLE_ROUNDS, turn: 1, radius: 0, scope })
    const second = recallHistory({ rounds: SAMPLE_ROUNDS, turn: 1, radius: 1, scope })
    // Turn 1 was already read, so only turns 0 and 2 are fresh
    expect(second.rounds.map((r) => r.turn)).toEqual([0, 2])
    expect(second.notice).toContain('重叠轮次已读取')
  })

  it('tracks 10-turn cooldown on full text recall', () => {
    const first = recallHistory({
      rounds: SAMPLE_ROUNDS,
      turn: 1,
      radius: 0,
      trackCooldown: true,
      currentTurn: 4,
    })
    expect(first.newCooldowns).toBeDefined()
    expect(first.newCooldowns?.[0]?.turn).toBe(1)
    expect(first.newCooldowns?.[0]?.atTurn).toBe(4)

    // Turn 1 is cooling at turn 10 (10 - 4 <= 10)
    const cooled = recallHistory({
      rounds: SAMPLE_ROUNDS,
      turn: 1,
      radius: 0,
      cooldowns: first.newCooldowns,
      currentTurn: 10,
    })
    expect(cooled.rounds).toHaveLength(0)
    expect(cooled.notice).toContain('处于 10 轮冷却期')

    // At turn 15, cooldown has expired (15 - 4 > 10)
    const expired = recallHistory({
      rounds: SAMPLE_ROUNDS,
      turn: 1,
      radius: 0,
      cooldowns: first.newCooldowns,
      currentTurn: 15,
    })
    expect(expired.rounds).toHaveLength(1)
    expect(expired.rounds[0]?.turn).toBe(1)
  })

  it('prepends anti-hallucination warning in renderRecall', () => {
    const result = recallHistory({ rounds: SAMPLE_ROUNDS, turn: 1, radius: 0 })
    const text = renderRecall(result)
    expect(text.startsWith('【历史回忆资料】')).toBe(true)
    expect(text).toContain('不得当作当前场景继续输出，不得重复演绎')
    expect(text).toContain('【第 1 轮】')
  })

  it('renders clean fallback when not found', () => {
    const result = recallHistory({ rounds: SAMPLE_ROUNDS, query: '外星人' })
    const text = renderRecall(result)
    expect(text).toContain('没有找到相关历史正文')
  })
})
