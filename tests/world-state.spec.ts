import { describe, expect, it } from 'vitest'
import { worldStateProjection, worldStateSchema } from '../src/projection/world-state.ts'
import { rrpStateMessage } from '../src/state-payload.ts'
import {
  WORLD_STATE_LIMITS,
  diffWorldState,
  emptyWorldState,
  normalizeRelationEndpoint,
  normalizeRelations,
  pruneWorldState,
  renderWorldState,
  withPlayerPersona,
} from '../src/world-state.ts'

/** One plugin context message carrying a structured world-state payload. */
const stateEvent = (payload: Record<string, unknown>) => ({
  type: 'user/message',
  data: rrpStateMessage('m1', 'context text', payload),
})

describe('WorldState projection unit', () => {
  it('adopts the complete state from a state-bearing context message', () => {
    const before = emptyWorldState()
    const next = {
      ...before,
      scene: { location: '归离客栈', time: '入夜' },
      characters: { 毓忻: { affinity: 3, mood: '警惕' } },
    }
    const after = worldStateProjection.apply(before, stateEvent({ worldState: next }))
    expect(after).toBe(next)
    expect(worldStateSchema.parse(after)).toEqual(next)
  })

  it('returns the same reference for unrelated events (Object.is gate)', () => {
    const state = emptyWorldState()
    expect(worldStateProjection.apply(state, { type: 'user/message', data: {} })).toBe(state)
    expect(
      worldStateProjection.apply(
        state,
        stateEvent({ card: { id: 'c', name: 'n', persona: '', worldCore: '' } }),
      ),
    ).toBe(state)
  })

  it('initializes a fresh empty state per session', () => {
    const a = worldStateProjection.init()
    const b = worldStateProjection.init()
    expect(a).not.toBe(b)
    expect(a).toEqual(emptyWorldState())
  })

  it('wire view reuses the state reference', () => {
    const state = emptyWorldState()
    expect(worldStateProjection.wire.view(state)).toBe(state)
  })

  it('backfills relations: [] for a legacy payload without the domain', () => {
    // Pre-relations session log: the four core domains only.
    const legacy = { characters: {}, inventory: {}, scene: {}, flags: {} }
    const after = worldStateProjection.apply(emptyWorldState(), stateEvent({ worldState: legacy }))
    expect(after.relations).toEqual([])
    expect(after).not.toBe(legacy)
    expect(worldStateSchema.parse(after)).toEqual(after)
  })

  it('adopts relations from a state-bearing payload', () => {
    const state = {
      ...emptyWorldState(),
      relations: [{ a: '米娅', b: '玩家', label: '主仆' }],
    }
    const after = worldStateProjection.apply(emptyWorldState(), stateEvent({ worldState: state }))
    expect(after).toBe(state)
  })
})

describe('Relation normalization', () => {
  it('normalizeRelationEndpoint strips bracket modifiers and trims', () => {
    expect(normalizeRelationEndpoint(' 米娅（女仆长） ')).toBe('米娅')
    expect(normalizeRelationEndpoint('洛克[已黑化]')).toBe('洛克')
    expect(normalizeRelationEndpoint('白狼（旧称：灰影）')).toBe('白狼')
    expect(normalizeRelationEndpoint('【幕后】东家')).toBe('东家')
  })

  it('normalizeRelationEndpoint maps player aliases case-insensitively', () => {
    for (const alias of ['我', '你', '玩家', '主角', 'user', 'USER', 'Player']) {
      expect(normalizeRelationEndpoint(alias)).toBe('玩家')
    }
  })

  it('normalizeRelationEndpoint leaves other names untouched (incl. traditional)', () => {
    expect(normalizeRelationEndpoint('雲長')).toBe('雲長')
    expect(normalizeRelationEndpoint('米娅')).toBe('米娅')
  })

  it('normalizeRelations dedupes undirected pairs, last write wins', () => {
    const out = normalizeRelations([
      { a: '米娅', b: '玩家', label: '主仆' },
      { a: '我', b: '米娅', label: '猜忌' },
      { a: '米娅', b: '主角', label: '信赖' },
    ])
    expect(out).toEqual([{ a: '米娅', b: '玩家', label: '信赖' }])
  })

  it('normalizeRelations drops blank entries and keeps the input reference when unchanged', () => {
    expect(
      normalizeRelations([
        { a: ' ', b: 'x', label: 'y' },
        { a: 'a', b: 'b', label: ' ' },
      ]),
    ).toEqual([])
    const intact = [{ a: 'a', b: 'b', label: 'x' }]
    expect(normalizeRelations(intact)).toBe(intact)
  })

  it('pruneWorldState caps relations at the limit, keeping the head', () => {
    const relations = Array.from({ length: WORLD_STATE_LIMITS.relations + 4 }, (_, index) => ({
      a: '甲' + String(index),
      b: '乙',
      label: 'r',
    }))
    const pruned = pruneWorldState({ ...emptyWorldState(), relations })
    expect(pruned.relations).toHaveLength(WORLD_STATE_LIMITS.relations)
    expect(pruned.relations[0]?.a).toBe('甲0')
    expect(pruned.relations[WORLD_STATE_LIMITS.relations - 1]?.a).toBe(
      '甲' + String(WORLD_STATE_LIMITS.relations - 1),
    )
  })

  it('pruneWorldState normalizes relations on the write path', () => {
    const pruned = pruneWorldState({
      ...emptyWorldState(),
      relations: [{ a: '我', b: '米娅（女仆）', label: '主仆 ' }],
    })
    expect(pruned.relations).toEqual([{ a: '玩家', b: '米娅', label: '主仆' }])
  })

  it('diffWorldState reports relation additions, removals and label changes', () => {
    const prior = {
      ...emptyWorldState(),
      relations: [
        { a: '米娅', b: '玩家', label: '主仆' },
        { a: '甲', b: '乙', label: '旧谊' },
      ],
    }
    const next = {
      ...emptyWorldState(),
      relations: [
        { a: '玩家', b: '米娅', label: '信赖' },
        { a: '丙', b: '丁', label: '同盟' },
      ],
    }
    const digest = diffWorldState(prior, next)
    // Label-change clause renders the `next` side's endpoint order.
    expect(digest).toContain('「玩家 × 米娅」关系 主仆 → 信赖')
    expect(digest).toContain('移除关系「甲 × 乙（旧谊）」')
    expect(digest).toContain('新增关系「丙 × 丁（同盟）」')
  })

  it('renderWorldState carries a stable relations line', () => {
    expect(renderWorldState(emptyWorldState())).toContain('relations: []')
    const rendered = renderWorldState({
      ...emptyWorldState(),
      relations: [{ a: '米娅', b: '玩家', label: '主仆' }],
    })
    expect(rendered).toContain('relations: ')
    expect(rendered).toContain('主仆')
  })
})

describe('withPlayerPersona (issue #31 P1-B)', () => {
  it('empty persona passes the state through untouched (same ref)', () => {
    const state = emptyWorldState()
    expect(withPlayerPersona(state, '   ')).toBe(state)
    expect(withPlayerPersona(null, '')).toBe(null)
  })

  it('merges the persona as the player dynamic string field', () => {
    const state = { ...emptyWorldState(), scene: { location: '客栈' } }
    const merged = withPlayerPersona(state, '  黑衣剑客，寡言，背负旧案。 ')
    expect(merged).not.toBe(state)
    expect(merged?.scene.location).toBe('客栈')
    expect(merged?.player).toEqual({ type: 'string', value: '黑衣剑客，寡言，背负旧案。' })
    // The Author's fact baseline renders it like any D5 field.
    expect(renderWorldState(merged!)).toContain('player: "黑衣剑客，寡言，背负旧案。"')
  })

  it('builds a fresh state for cards without an initial state', () => {
    const merged = withPlayerPersona(null, '旅人')
    expect(merged?.characters).toEqual({})
    expect(merged?.player).toEqual({ type: 'string', value: '旅人' })
  })

  it('caps an overlong persona and survives pruneWorldState round-trips', () => {
    const long = '长'.repeat(500)
    const merged = withPlayerPersona(emptyWorldState(), long)
    const field = merged?.player as { type: string; value: string }
    expect(field.value).toHaveLength(400)
    expect(pruneWorldState(merged!)).toEqual(merged)
  })
})
