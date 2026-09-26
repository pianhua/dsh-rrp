import { describe, expect, it } from 'vitest'
import {
  UI_BRIDGE_CSP,
  UI_BRIDGE_PROTOCOL,
  UI_BRIDGE_SHIM,
  UI_BRIDGE_VERBS,
  parseUiCall,
} from '../src/ui-bridge.ts'
import { assembleSandboxDoc } from '../src/client/stage-frame.tsx'

describe('card app bridge protocol', () => {
  it('accepts exactly the verbs a card app may raise', () => {
    expect(parseUiCall({ t: 'rrp:hello' })).toEqual({ t: 'rrp:hello' })
    expect(parseUiCall({ t: 'rrp:hello', protocol: 2 })).toEqual({ t: 'rrp:hello', protocol: 2 })
    expect(
      parseUiCall({
        t: 'rrp:correct_state',
        patch: { globalFields: { identity_revealed: { type: 'boolean', value: true } } },
      }),
    ).toMatchObject({ t: 'rrp:correct_state' })
    expect(parseUiCall({ t: 'rrp:ask_copilot', question: '现在怎么办' })).toMatchObject({
      t: 'rrp:ask_copilot',
    })
    expect(parseUiCall({ t: 'rrp:send_message', text: '  前进  ' })).toEqual({
      t: 'rrp:send_message',
      text: '前进',
    })
    expect(
      parseUiCall({
        t: 'rrp:draft_lore',
        entry: { name: 'x-lore', description: 'd', body: 'b' },
      }),
    ).toMatchObject({ t: 'rrp:draft_lore' })
    expect(parseUiCall({ t: 'rrp:resize', height: 421.7 })).toEqual({
      t: 'rrp:resize',
      height: 422,
    })
  })

  it('drops anything else, including smuggled verbs', () => {
    for (const bad of [
      null,
      undefined,
      'rrp:hello',
      {},
      { t: 'rrp:prompt' },
      { t: 'rrp:correct_state' },
      { t: 'rrp:correct_state', patch: 'not-an-object' },
      { t: 'rrp:ask_copilot', question: 42 },
      { t: 'rrp:send_message', text: '' },
      { t: 'rrp:send_message', text: 'x'.repeat(4001) },
      { t: 'rrp:draft_lore', entry: { name: 'bad', description: '', body: '' } },
      { t: 'rrp:resize', height: 'tall' },
      { t: 'rrp:resize', height: Number.NaN },
    ]) {
      expect(parseUiCall(bad)).toBeUndefined()
    }
  })

  it('clamps a resize instead of trusting the page', () => {
    expect(parseUiCall({ t: 'rrp:resize', height: 1 })?.t).toBe('rrp:resize')
    expect((parseUiCall({ t: 'rrp:resize', height: 1 }) as { height: number }).height).toBe(80)
    expect((parseUiCall({ t: 'rrp:resize', height: 99999 }) as { height: number }).height).toBe(
      4000,
    )
  })

  it('rejects an oversized question rather than truncating silently', () => {
    expect(parseUiCall({ t: 'rrp:ask_copilot', question: 'x'.repeat(2001) })).toBeUndefined()
  })

  it('advertises protocol 2 and the accepted verb list', () => {
    expect(UI_BRIDGE_PROTOCOL).toBe(2)
    expect(UI_BRIDGE_VERBS).toContain('correct_state')
    expect(UI_BRIDGE_VERBS).toContain('send_message')
    expect(UI_BRIDGE_VERBS).toContain('draft_lore')
    expect(UI_BRIDGE_VERBS).toContain('resize')
  })
})

describe('sandbox document assembly', () => {
  it('puts the CSP and the shim inside <head>, ahead of the card’s own scripts', () => {
    const doc = assembleSandboxDoc(
      '<!DOCTYPE html><html><head><title>卡</title></head><body><scr' +
        'ipt>var a=1</scr' +
        'ipt></body></html>',
    )
    const cspAt = doc.indexOf('Content-Security-Policy')
    const shimAt = doc.indexOf('window.rrp')
    const cardScriptAt = doc.indexOf('var a=1')
    expect(cspAt).toBeGreaterThan(-1)
    expect(shimAt).toBeGreaterThan(cspAt)
    expect(cardScriptAt).toBeGreaterThan(shimAt)
  })

  it('still wraps a fragment with no head at all', () => {
    const doc = assembleSandboxDoc('<div>hi</div>')
    expect(doc.startsWith('<meta http-equiv=')).toBe(true)
    expect(doc).toContain('window.rrp')
    expect(doc).toContain('<div>hi</div>')
  })

  it('uses the stage v2 self-only CSP and exposes the four verbs in the shim', () => {
    expect(UI_BRIDGE_CSP).toContain("default-src 'self'")
    expect(UI_BRIDGE_CSP).not.toContain('https:')
    expect(UI_BRIDGE_CSP).not.toContain("'unsafe-eval'")
    expect(UI_BRIDGE_SHIM).toContain('parent.postMessage')
    expect(UI_BRIDGE_SHIM).toContain('protocol:' + String(UI_BRIDGE_PROTOCOL))
    expect(UI_BRIDGE_SHIM).toContain('sendMessage')
    expect(UI_BRIDGE_SHIM).toContain('draftLore')
    expect(UI_BRIDGE_SHIM).toContain("t:'rrp:hello',protocol:" + String(UI_BRIDGE_PROTOCOL))
  })
})
