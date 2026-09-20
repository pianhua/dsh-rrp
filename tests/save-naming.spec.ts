/**
 * dsh-rrp — the save/branch title vocabulary (issue #37).
 */
import { describe, expect, it } from 'vitest'
import { branchTitle, mainTitle, uniqueMainTitle } from '../src/save-naming.ts'

describe('mainTitle', () => {
  it('appends the main-line marker to the card name', () => {
    expect(mainTitle('女仆与大小姐')).toBe('女仆与大小姐·主线')
  })
})

describe('uniqueMainTitle', () => {
  it('uses the bare base when no save exists yet', () => {
    expect(uniqueMainTitle('女仆与大小姐', [])).toBe('女仆与大小姐·主线')
  })

  it('ignores unrelated titles', () => {
    const titles = ['随便聊聊', '雁门客栈·主线']
    expect(uniqueMainTitle('女仆与大小姐', titles)).toBe('女仆与大小姐·主线')
  })

  it('increments past every occupied base', () => {
    const titles = ['女仆与大小姐·主线', '女仆与大小姐·主线2', '女仆与大小姐·主线3']
    expect(uniqueMainTitle('女仆与大小姐', titles)).toBe('女仆与大小姐·主线4')
  })

  it('fills the first gap left by a deleted save', () => {
    const titles = ['女仆与大小姐·主线', '女仆与大小姐·主线3']
    expect(uniqueMainTitle('女仆与大小姐', titles)).toBe('女仆与大小姐·主线2')
  })
})

describe('branchTitle', () => {
  it('names the branch after its parent save with the next line number', () => {
    expect(branchTitle('女仆与大小姐·主线2', [])).toBe('女仆与大小姐·主线2·线1')
  })

  it('numbers past existing siblings of the same parent', () => {
    const siblings = ['女仆与大小姐·主线2·线1', '女仆与大小姐·主线2·线2']
    expect(branchTitle('女仆与大小姐·主线2', siblings)).toBe('女仆与大小姐·主线2·线3')
  })
})
