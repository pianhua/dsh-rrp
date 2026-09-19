import { describe, expect, it } from 'vitest'
import {
  TRIGGER_BUDGET_CHARS,
  TRIGGER_EXCERPT_CHARS,
  evalCondition,
  hitSet,
  parseWhen,
  renderTriggerBlock,
  whenPathWarning,
  type TriggerDef,
  type WhenCondition,
} from '../src/lore-condition.ts'
import { createDynamicField, emptyWorldState, type WorldState } from '../src/world-state.ts'

const LOC = '卡「演示」skill「demo」'

/** Parse and assert success, returning the condition. */
function cond(src: string): WhenCondition {
  const parsed = parseWhen(src, LOC)
  if (parsed instanceof Error) throw parsed
  return parsed
}

const STATE: WorldState = {
  ...emptyWorldState(),
  characters: { 米娅: { affinity: 80, mood: '欣喜' } },
  inventory: { 金币: { quantity: 3 } },
  flags: { 身份已暴露: true },
  trust: createDynamicField('number', 5),
}

const def = (id: string, excerpt: string, condition: WhenCondition): TriggerDef => ({ id, name: id, condition, excerpt })

describe('parseWhen', () => {
  it('parses character paths with every operator and numeric literals', () => {
    expect(cond('characters.米娅.affinity >= 80')).toEqual({
      path: { kind: 'characters', name: '米娅', field: 'affinity' }, op: '>=', value: 80,
    })
    expect(cond('characters.米娅.affinity > 79')).toMatchObject({ op: '>', value: 79 })
    expect(cond('characters.米娅.affinity < 90')).toMatchObject({ op: '<', value: 90 })
    expect(cond('characters.米娅.affinity <= 80')).toMatchObject({ op: '<=', value: 80 })
    expect(cond('characters.米娅.affinity == 80')).toMatchObject({ op: '==', value: 80 })
    expect(cond('characters.米娅.affinity != 0')).toMatchObject({ op: '!=', value: 0 })
  })

  it('parses negative and fractional literals', () => {
    expect(cond('characters.米娅.affinity >= -5')).toMatchObject({ value: -5 })
    expect(cond('characters.米娅.affinity >= 0.5')).toMatchObject({ value: 0.5 })
  })

  it('parses boolean literals for flag and boolean comparisons', () => {
    expect(cond('flags.身份已暴露 == true')).toEqual({
      path: { kind: 'flags', name: '身份已暴露' }, op: '==', value: true,
    })
    expect(cond('flags.身份已暴露 != false')).toMatchObject({ op: '!=', value: false })
  })

  it('parses inventory, scene, and dynamic-field paths', () => {
    expect(cond('inventory.金币.quantity < 10')).toEqual({
      path: { kind: 'inventory', name: '金币', field: 'quantity' }, op: '<', value: 10,
    })
    expect(cond('scene.location == true').path).toEqual({ kind: 'scene', field: 'location' })
    expect(cond('trust >= 5').path).toEqual({ kind: 'dynamic', id: 'trust' })
  })

  it('rejects string literals with the v1 migration hint', () => {
    for (const src of ['characters.米娅.affinity >= 亲密', 'scene.location == "公寓"', 'scene.location == 门口']) {
      const parsed = parseWhen(src, LOC)
      expect(parsed).toBeInstanceOf(Error)
      expect((parsed as Error).message).toContain(LOC)
      expect((parsed as Error).message).toContain('建模为布尔或数值字段')
    }
  })

  it('rejects malformed conditions with the locator', () => {
    for (const src of ['', 'characters.米娅.affinity', '>= 80', 'characters..affinity >= 1', 'unknown.path.x >= 1', 'characters.米娅 >= 1']) {
      const parsed = parseWhen(src, LOC)
      expect(parsed).toBeInstanceOf(Error)
      expect((parsed as Error).message).toContain(LOC)
    }
  })
})

describe('evalCondition', () => {
  it('compares numbers and booleans against the state', () => {
    expect(evalCondition(cond('characters.米娅.affinity >= 80'), STATE)).toBe(true)
    expect(evalCondition(cond('characters.米娅.affinity > 80'), STATE)).toBe(false)
    expect(evalCondition(cond('characters.米娅.affinity < 81'), STATE)).toBe(true)
    expect(evalCondition(cond('flags.身份已暴露 == true'), STATE)).toBe(true)
    expect(evalCondition(cond('flags.身份已暴露 != true'), STATE)).toBe(false)
    expect(evalCondition(cond('inventory.金币.quantity <= 3'), STATE)).toBe(true)
    expect(evalCondition(cond('trust >= 5'), STATE)).toBe(true)
  })

  it('missing paths are false, never throw', () => {
    const empty = emptyWorldState()
    expect(evalCondition(cond('characters.不存在.affinity >= 1'), STATE)).toBe(false)
    expect(evalCondition(cond('characters.米娅.affinity >= 1'), empty)).toBe(false)
    expect(evalCondition(cond('flags.无此事件 == true'), STATE)).toBe(false)
    expect(evalCondition(cond('ghost >= 1'), STATE)).toBe(false)
  })

  it('type-kind mismatches are false (string fields never match v1 literals)', () => {
    expect(evalCondition(cond('characters.米娅.mood >= 1'), STATE)).toBe(false)
    expect(evalCondition(cond('characters.米娅.affinity == true'), STATE)).toBe(false)
    expect(evalCondition(cond('flags.身份已暴露 > 0'), STATE)).toBe(false)
  })
})

describe('hitSet', () => {
  const triggers = [
    def('zeta', 'Z', cond('characters.米娅.affinity >= 10')),
    def('alpha', 'A', cond('characters.米娅.affinity >= 80')),
    def('mid', 'M', cond('characters.米娅.affinity >= 99')),
  ]

  it('returns hits in skill-id lexicographic order regardless of input order', () => {
    expect(hitSet(triggers, STATE).map((hit) => hit.id)).toEqual(['alpha', 'zeta'])
    expect(hitSet([...triggers].reverse(), STATE).map((hit) => hit.id)).toEqual(['alpha', 'zeta'])
  })

  it('truncates to the total budget in order (单条 800 / 总量 2000)', () => {
    const big = (id: string) => def(id, id.repeat(TRIGGER_EXCERPT_CHARS), cond('characters.米娅.affinity >= 10'))
    const hits = hitSet([big('c'), big('a'), big('b')], STATE)
    expect(hits.map((hit) => hit.id)).toEqual(['a', 'b', 'c'])
    expect(hits[0]?.excerpt).toHaveLength(TRIGGER_EXCERPT_CHARS)
    expect(hits[1]?.excerpt).toHaveLength(TRIGGER_EXCERPT_CHARS)
    expect(hits[2]?.excerpt).toHaveLength(TRIGGER_BUDGET_CHARS - 2 * TRIGGER_EXCERPT_CHARS)
    expect(hits.reduce((sum, hit) => sum + hit.excerpt.length, 0)).toBe(TRIGGER_BUDGET_CHARS)
  })

  it('defensively re-caps overlong excerpts', () => {
    const hits = hitSet([def('a', 'x'.repeat(TRIGGER_EXCERPT_CHARS + 500), cond('characters.米娅.affinity >= 10'))], STATE)
    expect(hits[0]?.excerpt).toHaveLength(TRIGGER_EXCERPT_CHARS)
  })
})

describe('renderTriggerBlock', () => {
  const hits = [
    { id: 'b', name: '条目乙', excerpt: '乙的片段' },
    { id: 'a', name: '条目甲', excerpt: '甲的片段' },
  ]

  it('carries disclaimer, exhaustion declaration, entries and calling discipline', () => {
    const block = renderTriggerBlock(hits)
    expect(block).toContain('非剧情内容')
    expect(block).toContain('仅本块所列条目有效，此前所有条件注入一律作废')
    expect(block).toContain('调用纪律')
    expect(block).toContain('1. 条目甲：甲的片段')
    expect(block).toContain('2. 条目乙：乙的片段')
  })

  it('text is keyed only by the hit set: order and identity of inputs do not matter', () => {
    const again = renderTriggerBlock([
      { id: 'a', name: '条目甲', excerpt: '甲的片段' },
      { id: 'b', name: '条目乙', excerpt: '乙的片段' },
    ])
    expect(renderTriggerBlock(hits)).toBe(again)
  })

  it('adds the revocation sentence when the set shrinks or clears', () => {
    const cleared = renderTriggerBlock([], hits)
    expect(cleared).toContain('撤销')
    expect(cleared).toContain('条目甲')
    expect(cleared).toContain('（无）')
    const shrunk = renderTriggerBlock([hits[0]!], hits)
    expect(shrunk).toContain('撤销')
    expect(shrunk).toContain('条目甲')
    expect(shrunk).not.toContain('1. 条目甲')
  })

  it('omits the revocation sentence when the set grows or holds', () => {
    expect(renderTriggerBlock(hits, [hits[0]!])).not.toContain('撤销')
    expect(renderTriggerBlock(hits, hits)).not.toContain('撤销')
    expect(renderTriggerBlock(hits)).not.toContain('撤销')
  })
})

describe('whenPathWarning', () => {
  it('warns by name when the path key is absent from the initial state', () => {
    expect(whenPathWarning(cond('characters.幽灵.affinity >= 1'), STATE, LOC)).toContain('幽灵')
    expect(whenPathWarning(cond('inventory.圣剑.quantity >= 1'), STATE, LOC)).toContain('圣剑')
    expect(whenPathWarning(cond('flags.无此事件 == true'), STATE, LOC)).toContain('无此事件')
    expect(whenPathWarning(cond('ghost >= 1'), STATE, LOC)).toContain('ghost')
    expect(whenPathWarning(cond('scene.place == true'), STATE, LOC)).toContain('place')
  })

  it('stays silent when the path exists, and skips the check without state.json', () => {
    expect(whenPathWarning(cond('characters.米娅.affinity >= 1'), STATE, LOC)).toBeUndefined()
    expect(whenPathWarning(cond('flags.身份已暴露 == true'), STATE, LOC)).toBeUndefined()
    expect(whenPathWarning(cond('trust >= 1'), STATE, LOC)).toBeUndefined()
    expect(whenPathWarning(cond('characters.幽灵.affinity >= 1'), null, LOC)).toBeUndefined()
  })
})
