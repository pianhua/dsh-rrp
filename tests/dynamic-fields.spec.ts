import { describe, expect, it } from 'vitest'
import { worldStateProjection } from '../src/projection/world-state.ts'
import { rrpStateMessage } from '../src/state-payload.ts'
import {
  diagnoseWorldState,
  emptyWorldState,
  normalizeWorldState,
  type WorldState,
} from '../src/world-state.ts'

const event = (worldState: unknown) => ({
  type: 'user/message',
  data: rrpStateMessage('dynamic', 'state', { worldState: worldState as WorldState }),
})

const field = (value: number, min = 0, max = 100) => ({
  type: 'number' as const,
  value,
  definition: 'undeclared' as const,
  min,
  max,
})

const base = (): WorldState => ({
  ...emptyWorldState(),
  trackedObjects: {
    player: { id: 'player', kind: 'character', name: '玩家', isPlayer: true, fields: {} },
  },
})

describe('object-scoped and undeclared scalar fields', () => {
  it('preserves arbitrarily many object-scoped fields without a dynamic-field cap', () => {
    const fields = Object.fromEntries(
      Array.from({ length: 80 }, (_, index) => [String(index), field(index)]),
    )
    const state = {
      ...base(),
      trackedObjects: {
        ...base().trackedObjects,
        player: { ...base().trackedObjects.player!, fields },
      },
    }
    expect(Object.keys(state.trackedObjects.player!.fields)).toHaveLength(80)
    expect(worldStateProjection.apply(emptyWorldState(), event(state))).toEqual(state)
  })

  it('applies numeric min/max constraints without dropping or truncating fields', () => {
    const state = base()
    const next = {
      ...state,
      trackedObjects: {
        ...state.trackedObjects,
        player: {
          ...state.trackedObjects.player!,
          fields: { stamina: field(150) },
        },
      },
    }
    const normalized = normalizeWorldState(next)
    expect(normalized.trackedObjects.player?.fields.stamina.value).toBe(100)
    expect(normalized.trackedObjects.player?.fields.stamina.definition).toBe('undeclared')
  })

  it('reports text and serialized budget diagnostics instead of silently changing state', () => {
    const state = base()
    const next = {
      ...state,
      trackedObjects: {
        ...state.trackedObjects,
        player: {
          ...state.trackedObjects.player!,
          fields: {
            note: {
              type: 'string' as const,
              value: 'x'.repeat(20),
              definition: 'undeclared' as const,
            },
          },
        },
      },
    }
    const diagnostics = diagnoseWorldState(next, {
      diagnosticStringChars: 10,
      diagnosticSerializedChars: 10,
    })
    expect(diagnostics.some((item) => item.kind === 'string-length')).toBe(true)
    expect(diagnostics.some((item) => item.kind === 'serialized-budget')).toBe(true)
    expect(next.trackedObjects.player?.fields.note.value).toHaveLength(20)
  })
})
