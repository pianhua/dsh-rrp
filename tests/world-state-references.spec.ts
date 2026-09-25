import { describe, expect, it } from 'vitest'
import { applyWorldStatePatch, preparePlayerWorldState } from '../src/world-state-references.ts'
import { emptyWorldState, type WorldState } from '../src/world-state.ts'

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort()) sorted[key] = sortKeys(source[key])
    return sorted
  }
  return value
}

function stableStateFor(state: WorldState): string {
  return JSON.stringify(sortKeys(state))
}

function baseState(): WorldState {
  return {
    ...emptyWorldState(),
    trackedObjects: {
      mia: {
        id: 'mia',
        kind: 'character',
        name: '米娅',
        character: { presence: 'present', affinity: 20 },
        fields: {
          trust: { type: 'number', value: 20, definition: 'undeclared' },
        },
      },
      inn: {
        id: 'inn',
        kind: 'scene',
        name: '客栈',
        fields: {},
      },
    },
    globalFields: {
      weather: { type: 'string', value: '晴', definition: 'card-defined' },
    },
    objectives: [
      {
        id: 'stay-safe',
        owners: [{ objectId: 'mia' }],
        desiredOutcome: '安全留在客栈',
        status: 'active',
      },
    ],
    conflicts: [
      {
        id: 'storm',
        parties: [{ objectId: 'mia' }, { objectId: 'inn' }],
        stakes: '客栈安全',
        pressure: '暴雨',
        status: 'active',
      },
    ],
    cognition: [
      {
        id: 'mia-knows-storm',
        character: { objectId: 'mia' },
        proposition: '今晚有暴雨',
        markers: ['known'],
      },
    ],
    relations: [
      {
        id: 'mia-inn',
        a: { objectId: 'mia' },
        b: { objectId: 'inn' },
        labels: ['守护'],
      },
    ],
    currentEvents: [
      {
        id: 'promise',
        type: 'promise',
        fact: '米娅答应留守',
        relatedObjects: [{ objectId: 'mia' }],
        status: 'active',
      },
    ],
  }
}

describe('WorldState v2 safe writes', () => {
  it('merges object, relation, objective, conflict, cognition, event and card fields', () => {
    const prior = baseState()
    const result = applyWorldStatePatch(prior, {
      trackedObjects: {
        mia: {
          character: { affinity: 80 },
          fields: {
            trust: { type: 'number', value: 90, definition: 'undeclared' },
          },
        },
      },
      globalFields: {
        weather: { type: 'string', value: '暴雨', definition: 'card-defined' },
      },
      objectives: [{ ...prior.objectives[0]!, nextStep: '关好窗', status: 'blocked' }],
      conflicts: [{ ...prior.conflicts[0]!, pressure: '屋顶漏水' }],
      cognition: [{ ...prior.cognition[0]!, markers: ['suspected'] }],
      relations: [{ ...prior.relations[0]!, labels: ['互信'] }],
      currentEvents: [{ ...prior.currentEvents[0]!, fact: '米娅答应守住后门' }],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.trackedObjects.mia?.character?.affinity).toBe(80)
    expect(result.state.trackedObjects.mia?.fields.trust.value).toBe(90)
    expect(result.state.globalFields.weather.value).toBe('暴雨')
    expect(result.state.objectives[0]?.status).toBe('blocked')
    expect(result.state.conflicts[0]?.pressure).toBe('屋顶漏水')
    expect(result.state.cognition[0]?.markers).toEqual(['suspected'])
    expect(result.state.relations[0]?.labels).toEqual(['互信'])
    expect(result.state.currentEvents[0]?.fact).toContain('后门')
    expect(result.diff.changes.length).toBeGreaterThan(0)
  })

  it('blocks direct player writes to hidden content without truncating visible text', () => {
    const prior = baseState()
    prior.globalFields.secret = {
      type: 'string',
      value: '不公开的秘密',
      definition: 'undeclared',
      visibility: 'hidden',
    }
    const candidate = structuredClone(prior)
    candidate.globalFields.secret!.value = '玩家试图改写'
    const result = preparePlayerWorldState(prior, candidate)
    expect(result).toMatchObject({ ok: false, reason: 'hidden-content' })

    prior.globalFields.modelOnly = {
      type: 'string',
      value: '模型提示',
      definition: 'undeclared',
      visibility: 'model',
    }
    const modelCandidate = structuredClone(prior)
    modelCandidate.globalFields.modelOnly!.value = '玩家试图改写模型字段'
    expect(preparePlayerWorldState(prior, modelCandidate)).toMatchObject({
      ok: false,
      reason: 'hidden-content',
    })

    const visible = structuredClone(prior)
    visible.globalFields.weather!.value = '暴雨'.repeat(2001)
    const saved = preparePlayerWorldState(prior, visible)
    expect(saved.ok).toBe(true)
    if (saved.ok) {
      expect(saved.state.globalFields.weather!.value).toHaveLength('暴雨'.repeat(2001).length)
      expect(saved.diagnostics.some((item) => item.kind === 'string-length')).toBe(true)
    }
  })

  it('restores every kind of prior hidden content missing from the player candidate', () => {
    // 客户端投影按 player 受众过滤，玩家候选态天然不携带 hidden 内容；
    // 缺失时必须从 prior 恢复而不是拒绝，否则任何带秘密的卡都无法保存矫正。
    const cases: Array<[string, (state: WorldState) => void, (state: WorldState) => void]> = [
      [
        'tracked object',
        (state) => {
          state.trackedObjects.inn!.visibility = 'hidden'
        },
        (state) => {
          delete state.trackedObjects.inn
        },
      ],
      [
        'tracked object field',
        (state) => {
          state.trackedObjects.mia!.fields.trust!.visibility = 'hidden'
        },
        (state) => {
          delete state.trackedObjects.mia!.fields.trust
        },
      ],
      [
        'global field',
        (state) => {
          state.globalFields.weather!.visibility = 'hidden'
        },
        (state) => {
          delete state.globalFields.weather
        },
      ],
      [
        'objective',
        (state) => {
          state.objectives[0]!.visibility = 'hidden'
        },
        (state) => {
          state.objectives = []
        },
      ],
      [
        'conflict',
        (state) => {
          state.conflicts[0]!.visibility = 'hidden'
        },
        (state) => {
          state.conflicts = []
        },
      ],
      [
        'cognition',
        (state) => {
          state.cognition[0]!.visibility = 'hidden'
        },
        (state) => {
          state.cognition = []
        },
      ],
      [
        'relation',
        (state) => {
          state.relations[0]!.visibility = 'hidden'
        },
        (state) => {
          state.relations = []
        },
      ],
      [
        'current event',
        (state) => {
          state.currentEvents[0]!.visibility = 'hidden'
        },
        (state) => {
          state.currentEvents = []
        },
      ],
    ]

    for (const [name, markHidden, remove] of cases) {
      const prior = baseState()
      markHidden(prior)
      const candidate = structuredClone(prior)
      remove(candidate)
      const result = preparePlayerWorldState(prior, candidate)
      expect(result.ok, name).toBe(true)
      if (!result.ok) continue
      // hidden 内容被原样恢复，且恢复本身不计入 diff
      expect(stableStateFor(result.state), name).toBe(stableStateFor(prior))
      expect(result.diff.changes, name).toEqual([])
    }
  })

  it('still allows deleting a visible object that carries hidden fields', () => {
    const prior = baseState()
    prior.trackedObjects.mia!.fields.trust!.visibility = 'hidden'
    const candidate = structuredClone(prior)
    delete candidate.trackedObjects.mia
    const result = preparePlayerWorldState(prior, candidate, ['mia'])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.trackedObjects.mia).toBeUndefined()
    expect(result.deletedObjectIds).toEqual(['mia'])
  })

  it('requires explicit delete confirmation and downgrades every reference without cascading', () => {
    const prior = baseState()
    const candidate = structuredClone(prior)
    delete candidate.trackedObjects.mia
    const blocked = preparePlayerWorldState(prior, candidate)
    expect(blocked).toMatchObject({ ok: false, reason: 'references', objectId: 'mia' })

    const confirmed = preparePlayerWorldState(prior, candidate, ['mia'])
    expect(confirmed.ok).toBe(true)
    if (!confirmed.ok) return
    expect(confirmed.state.trackedObjects.mia).toBeUndefined()
    expect(confirmed.state.objectives[0]?.owners[0]).toEqual({
      external: { name: '米娅', kind: 'character' },
    })
    expect(confirmed.state.relations[0]?.a).toEqual({
      external: { name: '米娅', kind: 'character' },
    })
    expect(confirmed.state.currentEvents[0]?.relatedObjects[0]).toEqual({
      external: { name: '米娅', kind: 'character' },
    })
  })

  it('keeps archive and restore as non-destructive edits', () => {
    const prior = baseState()
    const archived = applyWorldStatePatch(prior, { archiveObjectIds: ['mia'] })
    expect(archived.ok).toBe(true)
    if (!archived.ok) return
    expect(archived.state.trackedObjects.mia?.archived).toBe(true)

    const restored = applyWorldStatePatch(archived.state, { restoreObjectIds: ['mia'] })
    expect(restored.ok).toBe(true)
    if (restored.ok) expect(restored.state.trackedObjects.mia?.archived).toBe(false)
  })
})
