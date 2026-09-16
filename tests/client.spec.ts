import { describe, expect, it } from 'vitest'
import * as client from '../src/client/index.ts'

/** Minimal fake of the client Context: records every registration. */
function fakeContext() {
  const types: Array<{ id?: string; kind?: string }> = []
  const bodies: Array<{ name?: string; key?: string; id?: string }> = []
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
  }
  return { ctx, types, bodies }
}

describe('dsh-rrp client half', () => {
  it('declares the required client services', () => {
    expect(client.inject).toEqual(expect.arrayContaining(['slots', 'sidebarRightTabs', 'locale', 'sessions', 'remote', 'remote.agentPresets', 'layout']))
  })

  it('does not override the host theme (native light/dark only)', () => {
    expect(client.inject).not.toContain('theme')
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

  it('registers the immersive story view tab', () => {
    const { ctx, bodies } = fakeContext()
    client.apply(ctx as never)
    const view = bodies.find((entry) => entry.name === 'conversation.view')
    expect(view).toBeDefined()
    expect(view?.id).toBe('dsh-rrp/story')
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
