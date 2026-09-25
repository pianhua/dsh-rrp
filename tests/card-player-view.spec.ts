import { describe, expect, it } from 'vitest'
import { toPlayerSafeCardPack, type CardPack } from '../src/card-types.ts'
import { emptyWorldState } from '../src/world-state.ts'
import { mergePlayerVisibleWorldState } from '../src/world-state-visibility.ts'

function pack(): CardPack {
  return {
    id: 'demo',
    dir: 'C:/private/demo',
    meta: { id: 'demo', name: '示例卡', tags: [], opening: 'default' },
    persona: '卡包人设',
    worldCore: '世界核心',
    openings: [{ id: 'default', body: '开场' }],
    initialState: {
      ...emptyWorldState(),
      globalFields: {
        weather: { type: 'string', value: '雨', definition: 'card-defined', visibility: 'player' },
        secret: { type: 'string', value: '暗号', definition: 'card-defined', visibility: 'hidden' },
      },
    },
    stateSchema: {
      version: 3,
      fields: [
        {
          id: 'weather',
          label: '天气',
          appliesTo: ['global'],
          type: 'string',
          component: 'text',
          visibility: 'player',
        },
        {
          id: 'secret',
          label: '秘密暗号',
          appliesTo: ['global'],
          type: 'string',
          component: 'text',
          visibility: 'hidden',
        },
      ],
      migrations: [{ fromVersion: 2, toVersion: 3, aliases: [{ from: 'code', to: 'secret' }] }],
    },
    skills: [{ id: 'secret-skill', name: '秘密', description: 'desc', dir: 'C:/private/skill' }],
  }
}

describe('player-safe card pack view', () => {
  it('removes filesystem paths and protected initial state/schema values', () => {
    const view = toPlayerSafeCardPack(pack())
    expect(view).not.toHaveProperty('dir')
    expect(view.initialState?.globalFields.weather?.value).toBe('雨')
    expect(view.initialState?.globalFields.secret).toBeUndefined()
    expect(view.stateSchema?.fields.map((field) => field.id)).toEqual(['weather'])
    expect(view.stateSchema?.migrations).toBeUndefined()
    expect(view.skills).toEqual([{ id: 'secret-skill', name: '秘密', description: 'desc' }])
    const serialized = JSON.stringify(view)
    expect(serialized).not.toContain('暗号')
    expect(serialized).not.toContain('C:/private')
  })

  it('hydrates a player-safe initial state without dropping protected card facts', () => {
    const original = pack().initialState!
    const visible = toPlayerSafeCardPack(pack()).initialState!
    const hydrated = mergePlayerVisibleWorldState(original, visible)
    expect(hydrated.globalFields.weather?.value).toBe('雨')
    expect(hydrated.globalFields.secret?.value).toBe('暗号')
  })
})
