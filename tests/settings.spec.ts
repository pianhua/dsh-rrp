import { describe, expect, it } from 'vitest'
import { settingsProjection as rrpSettingsProjection } from '../src/projection/settings.ts'
import { DEFAULT_RRP_SETTINGS, rrpSettingsOf } from '../src/settings.ts'

describe('RP settings vocabulary', () => {
  it('defaults allowSendMessage to true', () => {
    expect(DEFAULT_RRP_SETTINGS.allowSendMessage).toBe(true)
    expect(rrpSettingsOf({})).toEqual(DEFAULT_RRP_SETTINGS)
    expect(rrpSettingsOf({ allowSendMessage: false })).toEqual({
      ...DEFAULT_RRP_SETTINGS,
      allowSendMessage: false,
    })
  })
})

describe('RP settings projection fold', () => {
  it('starts from the default settings', () => {
    expect(rrpSettingsProjection.init()).toEqual(DEFAULT_RRP_SETTINGS)
  })

  it('applies a valid settings event and ignores invalid ones', () => {
    const state = rrpSettingsProjection.apply(DEFAULT_RRP_SETTINGS, {
      type: 'user/message',
      data: {
        source: {
          kind: 'plugin:dsh-rrp',
          rrp: {
            settings: { summaryEnabled: true, summaryEveryTurns: 8, allowSendMessage: false },
          },
        },
      },
    })
    expect(state.allowSendMessage).toBe(false)

    const unchanged = rrpSettingsProjection.apply(state, {
      type: 'user/message',
      data: {
        source: {
          kind: 'plugin:dsh-rrp',
          rrp: { settings: 'not-an-object' },
        },
      },
    })
    expect(unchanged).toEqual(state)
  })

  it('is idempotent: applying the same payload twice is a no-op', () => {
    const payload = { summaryEnabled: false, summaryEveryTurns: 8, allowSendMessage: true }

    const once = rrpSettingsProjection.apply(DEFAULT_RRP_SETTINGS, {
      type: 'user/message',
      data: { source: { kind: 'plugin:dsh-rrp', rrp: { settings: payload } } },
    })
    const twice = rrpSettingsProjection.apply(once, {
      type: 'user/message',
      data: { source: { kind: 'plugin:dsh-rrp', rrp: { settings: payload } } },
    })
    expect(twice).toEqual(once)
  })
})
