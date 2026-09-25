import { describe, expect, it } from 'vitest'
import { parseChroniclerReply } from '../src/agents/chronicler.ts'
import { createDynamicField, emptyWorldState, pruneWorldState } from '../src/world-state.ts'

describe('WorldState v2 normalization', () => {
  it('keeps the same reference when no constraints need normalization', () => {
    const state = emptyWorldState()
    expect(pruneWorldState(state)).toBe(state)
  })

  it('clamps constrained object and global scalar fields without deleting state', () => {
    const state = {
      ...emptyWorldState(),
      trackedObjects: {
        mia: {
          id: 'mia',
          kind: 'character' as const,
          name: '米娅',
          fields: {
            energy: { ...createDynamicField('number', 140, { min: 0, max: 100 }) },
          },
        },
      },
      globalFields: {
        danger: { ...createDynamicField('number', -3, { min: 0, max: 10 }) },
      },
    }
    const normalized = pruneWorldState(state)
    expect(normalized.trackedObjects.mia?.fields.energy?.value).toBe(100)
    expect(normalized.globalFields.danger?.value).toBe(0)
  })

  it('does not prune tracked objects or fields by count or string length', () => {
    const trackedObjects = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [
        'object-' + String(index),
        {
          id: 'object-' + String(index),
          kind: 'item' as const,
          name: '物品' + String(index),
          fields: { note: createDynamicField('string', 'x'.repeat(5000)) },
        },
      ]),
    )
    const state = { ...emptyWorldState(), trackedObjects }
    const normalized = pruneWorldState(state)
    expect(Object.keys(normalized.trackedObjects)).toHaveLength(40)
    expect(normalized.trackedObjects['object-39']?.fields.note.value).toHaveLength(5000)
  })

  it('parses a complete v2 snapshot without reviving flat domains', () => {
    const state = {
      ...emptyWorldState(),
      trackedObjects: {
        mia: {
          id: 'mia',
          kind: 'character' as const,
          name: '米娅',
          character: { affinity: 8 },
          fields: {},
        },
      },
    }
    const parsed = parseChroniclerReply(JSON.stringify({ state, changeSummary: '', evidence: [] }))
    expect(parsed?.state.trackedObjects.mia?.character?.affinity).toBe(8)
    expect(parsed?.state).not.toHaveProperty('characters')
  })
})
