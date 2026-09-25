import { describe, expect, it } from 'vitest'
import { worldStateProjection } from '../src/projection/world-state.ts'
import {
  emptyWorldState,
  renderWorldState,
  type WorldState,
  type WorldStateDiff,
} from '../src/world-state.ts'
import {
  filterWorldState,
  renderWorldStateForAudience,
  sanitizePlayerText,
  sanitizeWorldStateDiff,
  type WorldStatePlayerView,
} from '../src/world-state-visibility.ts'

function state(): WorldState {
  return {
    ...emptyWorldState(),
    trackedObjects: {
      mia: {
        id: 'mia',
        kind: 'character',
        name: '米娅',
        fields: {
          trust: { type: 'number', value: 80, definition: 'undeclared', visibility: 'player' },
          secretName: {
            type: 'string',
            value: '夜鸦',
            definition: 'card-defined',
            visibility: 'hidden',
          },
        },
      },
      hidden: {
        id: 'hidden',
        kind: 'character',
        name: '不可公开角色',
        visibility: 'hidden',
        fields: {},
      },
      modelOnly: {
        id: 'modelOnly',
        kind: 'group',
        name: '幕后势力',
        visibility: 'model',
        fields: {},
      },
    },
    relations: [
      {
        id: 'mia-hidden',
        a: { objectId: 'mia' },
        b: { objectId: 'hidden' },
        labels: ['秘密关系'],
        visibility: 'player',
      },
    ],
    cognition: [
      {
        id: 'hidden-belief',
        character: { objectId: 'mia' },
        proposition: '夜鸦就是幕后势力的首领',
        markers: ['known'],
        visibility: 'hidden',
      },
    ],
    currentEvents: [
      {
        id: 'hidden-event',
        type: 'secret',
        fact: '夜鸦将在午夜现身',
        relatedObjects: [{ objectId: 'hidden' }],
        status: 'active',
        visibility: 'model',
      },
    ],
  }
}

describe('WorldState visibility boundaries', () => {
  it('keeps internal and model views complete while filtering protected values from player view', () => {
    const current = state()
    expect(filterWorldState(current, 'internal')).toBe(current)
    expect(filterWorldState(current, 'model')).toEqual(current)

    const player = filterWorldState(current, 'player') as WorldStatePlayerView
    expect(player.trackedObjects.mia?.fields.secretName).toBeUndefined()
    expect(player.trackedObjects.hidden).toBeUndefined()
    expect(player.trackedObjects.modelOnly).toBeUndefined()
    expect(player.cognition).toEqual([])
    expect(player.currentEvents).toEqual([])
    expect(player.relations[0]?.b).toEqual({ external: { name: '不公开对象' } })
    expect(player.visibilityNotices).toEqual([
      { kind: 'tracked-object', count: 2, message: '不公开的世界信息' },
      { kind: 'field', count: 1, message: '不公开的世界信息' },
      { kind: 'cognition', count: 1, message: '不公开的世界信息' },
      { kind: 'current-event', count: 1, message: '不公开的世界信息' },
    ])
    const serialized = JSON.stringify(player)
    expect(serialized).not.toContain('夜鸦')
    expect(serialized).not.toContain('幕后势力')
    expect(serialized).not.toContain('不可公开角色')
  })

  it('renders a player-safe snapshot with only generic protected-information diagnostics', () => {
    const rendered = renderWorldStateForAudience(state(), 'player')
    expect(rendered).toContain('不公开的世界信息')
    expect(rendered).toContain('米娅')
    expect(rendered).not.toContain('夜鸦')
    expect(rendered).not.toContain('不可公开角色')
    expect(rendered).not.toContain('幕后势力')
    expect(renderWorldState(state(), 'player')).toBe(rendered)
  })

  it('uses the player-safe view on the projection wire while keeping the internal fold complete', () => {
    const current = state()
    const wire = worldStateProjection.wire.view(current) as WorldStatePlayerView
    expect(wire.trackedObjects.hidden).toBeUndefined()
    expect(wire.trackedObjects.mia?.fields.secretName).toBeUndefined()
    expect(
      worldStateProjection.apply(emptyWorldState(), {
        type: 'user/message',
        data: { source: { kind: 'plugin', plugin: 'dsh-rrp', rrp: { worldState: current } } },
      }),
    ).toEqual(current)
  })

  it('replaces protected values in player-facing text and diffs', () => {
    const current = state()
    const text = sanitizePlayerText('发现夜鸦与不可公开角色的线索', current)
    expect(text).toBe('发现不公开的世界信息与不公开的世界信息的线索')
    const diff: WorldStateDiff = {
      changes: [
        {
          type: 'modified',
          objectId: 'hidden',
          field: 'trackedObjects.name',
          before: '不可公开角色',
          after: '夜鸦',
        },
        {
          type: 'modified',
          objectId: 'mia',
          field: 'trackedObjects.fields.secretName.value',
          before: '夜鸦',
          after: '乌鸦',
        },
      ],
    }
    const safe = sanitizeWorldStateDiff(diff, current, current)
    expect(safe.changes.every((change) => change.objectId === undefined)).toBe(true)
    expect(JSON.stringify(safe)).not.toContain('夜鸦')
    expect(JSON.stringify(safe)).not.toContain('不可公开角色')
  })
})
