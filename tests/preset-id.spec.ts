import { describe, expect, it } from 'vitest'
import { isCardId, presetIdForCard } from '../src/preset-id.ts'

describe('card preset identity', () => {
  it('accepts one canonical card-id grammar', () => {
    expect(isCardId('maid-heiress')).toBe(true)
    expect(isCardId('card2')).toBe(true)
    expect(isCardId('foo_bar')).toBe(false)
    expect(isCardId('foo bar')).toBe(false)
    expect(isCardId('Foo-Bar')).toBe(false)
    expect(isCardId('../foo')).toBe(false)
  })

  it('maps a valid card id injectively and rejects lossy aliases', () => {
    expect(presetIdForCard('maid-heiress')).toBe('rp-maid-heiress')
    expect(() => presetIdForCard('foo_bar')).toThrow(/card id/i)
    expect(() => presetIdForCard('foo bar')).toThrow(/card id/i)
  })
})
