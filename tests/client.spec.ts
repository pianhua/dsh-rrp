import { describe, expect, it } from 'vitest'
import * as client from '../src/client/index.ts'

/** Minimal fake of the client Context: records every registration. */
function fakeContext() {
  const types: Array<{ id?: string; kind?: string }> = []
  const bodies: Array<{ name?: string; key?: string; id?: string }> = []
  const overrides: Array<{ source: string; tokens: Record<string, unknown> }> = []
  const ctx = {
    effect(fn: () => (() => void) | void) {
      return fn()
    },
    slots: {
      register(options: { name?: string; key?: string; id?: string }, _component: unknown) {
        bodies.push(options)
        return () => {}
      },
      inject(_key: string, callback: () => () => void) {
        return callback()
      },
    },
    sidebarRightTabs: {
      register(definition: { id?: string; kind?: string }) {
        types.push(definition)
        return () => {}
      },
    },
    locale: {
      register() {
        return () => {}
      },
      bind() {
        return (key: string) => key
      },
    },
    theme: {
      overrideTokens(source: string, tokens: Record<string, unknown>) {
        overrides.push({ source, tokens })
        return () => {}
      },
    },
  }
  return { ctx, types, bodies, overrides }
}

describe('dsh-rrp client half', () => {
  it('declares the required client services', () => {
    expect(client.inject).toEqual(expect.arrayContaining(['slots', 'sidebarRightTabs', 'locale', 'theme', 'sessions', 'remote', 'layout']))
  })

  it('applies the RP reading theme as a reversible override layer', () => {
    const { ctx, overrides } = fakeContext()
    client.apply(ctx as never)
    expect(overrides).toHaveLength(1)
    expect(overrides[0]?.source).toBe('dsh-rrp')
    expect(Object.keys(overrides[0]?.tokens ?? {})).toContain('--dsw-font-markdown-base-font-family')
  })

  it('registers the WorldState tab type and its keyed body', () => {
    const { ctx, types, bodies } = fakeContext()
    client.apply(ctx as never)

    const type = types.find((entry) => entry.kind === 'dsh-rrp-worldstate')
    expect(type).toBeDefined()
    expect(type?.id).toBe('dsh-rrp/world-state')

    const body = bodies.find((entry) => entry.name === 'sidebar.right.pane.tab')
    expect(body).toBeDefined()
    expect(body?.key).toBe('dsh-rrp/world-state')
  })

  it('registers the card gallery as a main panel plus a matching nav entry', () => {
    const { ctx, bodies } = fakeContext()
    client.apply(ctx as never)

    const panel = bodies.find((entry) => entry.name === 'main')
    expect(panel).toBeDefined()
    expect(panel?.key).toBe('dsh-rrp/chronicle')

    const nav = bodies.find((entry) => entry.name === 'sidebar.panellist')
    expect(nav).toBeDefined()
    expect(nav?.id).toBe('dsh-rrp/chronicle')
  })
})
