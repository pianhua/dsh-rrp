import { describe, expect, it } from 'vitest'
import * as client from '../src/client/index.ts'

/** Minimal fake of the client Context: records every registration. */
function fakeContext() {
  const types: Array<{ id?: string; kind?: string }> = []
  const bodies: Array<{ name?: string; key?: string }> = []
  const ctx = {
    effect(fn: () => (() => void) | void) {
      return fn()
    },
    slots: {
      register(options: { name?: string; key?: string }, _component: unknown) {
        bodies.push(options)
        return () => {}
      },
      inject() {
        return () => {}
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
    expect(client.inject).toEqual(expect.arrayContaining(['slots', 'sidebarRightTabs', 'locale']))
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
})
