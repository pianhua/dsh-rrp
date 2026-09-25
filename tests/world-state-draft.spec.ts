import { describe, expect, it } from 'vitest'
import {
  draftOf,
  isEmptyDraft,
  stateOfDraft,
  type WorldStateDraft,
} from '../src/client/world-state-draft.ts'
import {
  createWorldStateDraftStore,
  getWorldStateDraftStore,
  resetWorldStateDraftStore,
} from '../src/client/world-state-draft-store.ts'
import { emptyWorldState, type WorldStateView } from '../src/world-state.ts'

function view(): WorldStateView {
  return {
    ...emptyWorldState(),
    trackedObjects: {
      player: {
        id: 'player',
        kind: 'character',
        name: '玩家',
        isPlayer: true,
        character: { presence: 'present' },
        fields: {},
      },
      mia: {
        id: 'mia',
        kind: 'character',
        name: '米娅',
        character: { presence: 'present', emotionalState: '警惕' },
        fields: {
          affinity: { type: 'number', value: 8, definition: 'card-defined', visibility: 'player' },
          note: { type: 'string', value: '雨夜', definition: 'undeclared', visibility: 'player' },
        },
      },
    },
    globalFields: {
      weather: { type: 'string', value: '大雪', definition: 'card-defined' },
    },
    objectives: [
      {
        id: 'find-key',
        owners: [{ objectId: 'player' }],
        desiredOutcome: '找到铜钥匙',
        progress: '正在调查',
        status: 'active',
        primary: true,
        order: 0,
      },
    ],
    conflicts: [
      {
        id: 'sealed-cellar',
        parties: [{ objectId: 'player' }, { objectId: 'mia' }],
        stakes: '后窖秘密',
        pressure: '门被封住',
        status: 'active',
      },
    ],
    cognition: [
      {
        id: 'mia-key',
        character: { objectId: 'mia' },
        proposition: '玩家知道后窖的位置',
        markers: ['suspected'],
      },
    ],
    relations: [
      {
        id: 'player-mia',
        a: { objectId: 'player' },
        b: { objectId: 'mia' },
        labels: ['主仆'],
        aToB: { attitude: '信任' },
        bToA: { attitude: '警惕' },
      },
    ],
    currentEvents: [
      {
        id: 'promise',
        type: 'promise',
        fact: '答应调查后窖',
        relatedObjects: [{ objectId: 'player' }],
        status: 'active',
      },
    ],
    visibilityNotices: [],
  }
}

describe('WorldState v2 draft conversion', () => {
  it('clones the player wire view without exposing v1 domains', () => {
    const draft = draftOf(view())
    expect(draft.trackedObjects.mia?.fields.affinity?.value).toBe(8)
    expect(draft.objectives[0]?.desiredOutcome).toBe('找到铜钥匙')
    expect(draft.relations[0]?.aToB?.attitude).toBe('信任')
    expect(draft.currentEvents[0]?.fact).toBe('答应调查后窖')
    expect(draft).not.toHaveProperty('characters')
    expect(draft).not.toHaveProperty('inventory')
    expect(draft).not.toHaveProperty('scene')
    expect(draft).not.toHaveProperty('flags')
    expect(draft).not.toBe(view())
  })

  it('round-trips a v2 draft while removing wire-only notices', () => {
    const draft = draftOf(view())
    draft.trackedObjects.mia!.character!.emotionalState = '从容'
    const state = stateOfDraft(draft)
    expect(state.trackedObjects.mia?.character?.emotionalState).toBe('从容')
    expect(state).not.toHaveProperty('visibilityNotices')
    expect(state.version).toBe(2)
  })

  it('isolates stores by session and merges clean projection fields around dirty paths', () => {
    const first = createWorldStateDraftStore('draft-session-a', view())
    const second = getWorldStateDraftStore('draft-session-b', view())
    const beforeMerge = second.getSnapshot()
    second.mergeProjection(view())
    expect(second.getSnapshot()).toBe(beforeMerge)
    first.setPath('trackedObjects.mia.character.emotionalState', '从容')
    first.setInferring(true)
    first.setPath('trackedObjects.mia.character.emotionalState', '不应写入')
    expect(first.getSnapshot().draft.trackedObjects.mia?.character?.emotionalState).toBe('从容')
    first.mergeProjection({
      ...view(),
      trackedObjects: {
        ...view().trackedObjects,
        mia: {
          ...view().trackedObjects.mia!,
          character: { presence: 'present', emotionalState: '喜悦' },
          fields: {
            ...view().trackedObjects.mia!.fields,
            note: { type: 'string', value: '晴夜', definition: 'undeclared' },
          },
        },
      },
      globalFields: { weather: { type: 'string', value: '小雪', definition: 'card-defined' } },
      visibilityNotices: [],
    })
    expect(first.getSnapshot().draft.trackedObjects.mia?.character?.emotionalState).toBe('从容')
    expect(first.getSnapshot().draft.trackedObjects.mia?.fields.note?.value).toBe('晴夜')
    expect(first.getSnapshot().draft.globalFields.weather?.value).toBe('小雪')
    expect(first.getSnapshot().updateNotice).toBe(true)
    expect(first.getSnapshot().isInferring).toBe(true)
    expect(second.getSnapshot().draft.trackedObjects.mia?.character?.emotionalState).toBe('警惕')
    resetWorldStateDraftStore('draft-session-a')
    expect(getWorldStateDraftStore('draft-session-a', view()).getSnapshot().isDirty).toBe(false)
  })

  it('recognizes an empty v2 state without inventing defaults', () => {
    expect(isEmptyDraft(draftOf(undefined))).toBe(true)
    const draft: WorldStateDraft = draftOf(undefined)
    draft.globalFields.example = { type: 'boolean', value: false, definition: 'undeclared' }
    expect(isEmptyDraft(draft)).toBe(false)
  })
})
