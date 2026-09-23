import { describe, expect, it } from 'vitest'
import {
  draftOf,
  isEmptyDraft,
  parseFlagValue,
  stateOfDraft,
  type WorldStateDraft,
} from '../src/client/world-state-draft.ts'
import { emptyWorldState, type WorldState } from '../src/world-state.ts'

describe('WorldState draft conversion', () => {
  it('projects all domains into editable string rows and copies read-only relations', () => {
    const relation = { a: '米娅', b: '玩家', label: '主仆' }
    const view: WorldState = {
      characters: {
        米娅: { affinity: 8, mood: '警惕', appearance: '湿衣', condition: '饥饿' },
        空白: {},
      },
      inventory: { 铜钥匙: { quantity: 0, note: '后窖' }, 空白: {} },
      scene: { location: '客栈', time: '子夜' },
      flags: { 已知: true, 数字: 3, 文本: '保留' },
      relations: [relation],
      focus: { type: 'number', value: 2, min: 0, max: 10 },
      enabled: { type: 'boolean', value: false },
    }

    const draft = draftOf(view)

    expect(draft).toEqual({
      characters: [
        { name: '米娅', affinity: '8', mood: '警惕', appearance: '湿衣', condition: '饥饿' },
        { name: '空白', affinity: '', mood: '', appearance: '', condition: '' },
      ],
      inventory: [
        { name: '铜钥匙', quantity: '0', note: '后窖' },
        { name: '空白', quantity: '', note: '' },
      ],
      flags: [
        { key: '已知', value: 'true' },
        { key: '数字', value: '3' },
        { key: '文本', value: '保留' },
      ],
      scene: { location: '客栈', time: '子夜', weather: '' },
      relations: [{ ...relation }],
      dynamicFields: [
        { id: 'focus', type: 'number', value: '2', min: '0', max: '10' },
        { id: 'enabled', type: 'boolean', value: 'false', min: undefined, max: undefined },
      ],
    })
    expect(draft.relations[0]).not.toBe(relation)
    expect(draftOf(undefined)).toEqual(draftOf(emptyWorldState()))
  })

  it('rebuilds the whole state with trimming, omitted blanks, and last-write-wins name collisions', () => {
    const draft: WorldStateDraft = {
      characters: [
        { name: ' 米娅 ', affinity: ' 8 ', mood: ' 警惕 ', appearance: ' ', condition: '' },
        { name: '  ', affinity: '4', mood: 'ignored', appearance: '', condition: '' },
        { name: '重复', affinity: 'invalid', mood: '', appearance: '', condition: '' },
        { name: ' 重复 ', affinity: '', mood: ' 安静 ', appearance: '', condition: ' ' },
      ],
      inventory: [
        { name: ' 铜钥匙 ', quantity: '2', note: '后窖' },
        { name: '铜钥匙', quantity: 'invalid', note: '' },
        { name: '', quantity: '1', note: 'ignored' },
      ],
      flags: [
        { key: ' 已知 ', value: 'true' },
        { key: '数量', value: ' 1.5e2 ' },
        { key: ' 已知', value: 'false' },
        { key: '', value: 'ignored' },
      ],
      scene: { location: ' 客栈 ', time: ' ', weather: '雨夜' },
      relations: [{ a: '米娅', b: '玩家', label: '主仆' }],
      dynamicFields: [
        { id: 'focus', type: 'number', value: '99', min: '0', max: '10' },
        { id: 'minimum', type: 'number', value: '-5', min: '0', max: '10' },
        { id: 'invalidConstraints', type: 'number', value: '3', min: 'invalid', max: 'invalid' },
        { id: 'invalidNumber', type: 'number', value: 'not a number' },
        { id: 'truthy', type: 'boolean', value: '1' },
        { id: 'strictBoolean', type: 'boolean', value: 'TRUE' },
        { id: 'note', type: 'string', value: ' 描述 ' },
        { id: 'bad-id', type: 'string', value: 'skip' },
        { id: 'characters', type: 'string', value: 'reserved' },
        { id: ' ', type: 'string', value: 'blank id' },
        { id: 'focus', type: 'string', value: ' final ' },
      ],
    }
    const originalRelation = draft.relations[0]

    const state = stateOfDraft(draft)

    expect(state).toEqual({
      characters: {
        米娅: { affinity: 8, mood: '警惕' },
        重复: { mood: '安静' },
      },
      inventory: { 铜钥匙: {} },
      flags: { 已知: false, 数量: 150 },
      scene: { location: '客栈', weather: '雨夜' },
      relations: [{ a: '米娅', b: '玩家', label: '主仆' }],
      focus: { type: 'string', value: 'final' },
      minimum: { type: 'number', value: 0, min: 0, max: 10 },
      invalidConstraints: { type: 'number', value: 3 },
      invalidNumber: { type: 'number', value: 0 },
      truthy: { type: 'boolean', value: true },
      strictBoolean: { type: 'boolean', value: false },
      note: { type: 'string', value: '描述' },
    })
    expect(state.relations[0]).not.toBe(originalRelation)
  })

  it('parses flag literals but preserves unrecognized input exactly', () => {
    expect(parseFlagValue(' true ')).toBe(true)
    expect(parseFlagValue('false')).toBe(false)
    expect(parseFlagValue(' 1.25e2 ')).toBe(125)
    expect(parseFlagValue('  ')).toBe('  ')
    expect(parseFlagValue(' unknown ')).toBe(' unknown ')
    expect(parseFlagValue('TRUE')).toBe('TRUE')
  })

  it('considers every row and scene value when detecting an empty draft', () => {
    const empty = draftOf(undefined)
    expect(isEmptyDraft(empty)).toBe(true)
    expect(
      isEmptyDraft({
        ...empty,
        characters: [{ name: '', affinity: '', mood: '', appearance: '', condition: '' }],
      }),
    ).toBe(false)
    expect(isEmptyDraft({ ...empty, scene: { ...empty.scene, weather: '晴' } })).toBe(false)
    expect(isEmptyDraft({ ...empty, relations: [{ a: '甲', b: '乙', label: '友人' }] })).toBe(false)
    expect(
      isEmptyDraft({ ...empty, dynamicFields: [{ id: 'focus', type: 'number', value: '0' }] }),
    ).toBe(false)
  })
})
