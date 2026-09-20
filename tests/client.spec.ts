import { afterEach, describe, expect, it, vi } from 'vitest'
import * as client from '../src/client/index.ts'
import type { CardPack } from '../src/card-types.ts'

/** Minimal fake of the client Context: records every registration. */
function fakeContext() {
  const types: Array<{ id?: string; kind?: string }> = []
  const bodies: Array<{
    name?: string
    key?: string
    id?: string
    order?: number
    inject?: (...args: unknown[]) => Record<string, unknown>
  }> = []
  const ctx = {
    effect(fn: () => (() => void) | void) {
      return fn()
    },
    slots: {
      register(options: { name?: string; key?: string; id?: string; inject?: (...args: unknown[]) => Record<string, unknown> }, _component: unknown) {
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
    // The real Cordis context answers for every optional face; an unregistered
    // service is simply absent.
    get(_name: string) {
      return undefined
    },
  }
  return { ctx, types, bodies }
}

afterEach(() => vi.unstubAllGlobals())

const CARD: CardPack = {
  id: 'demo-card',
  dir: '',
  meta: { id: 'demo-card', name: 'Demo', tags: [], opening: 'default' },
  persona: 'persona',
  worldCore: 'world',
  openings: [{ id: 'default', body: 'opening' }],
  initialState: null,
  skills: [],
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

  it('passes an optional native Workspace id into Session creation', async () => {
    const { ctx, bodies } = fakeContext()
    const creates: Array<Record<string, unknown>> = []
    Object.assign(ctx, {
      get: (name: string) => name === 'workspaces'
        ? { list: { getSnapshot: () => ({ items: [{ workspaceId: 'workspace-1', title: 'RP', path: 'D:/rp' }] }), subscribe: () => () => {} } }
        : undefined,
      sessions: {
        create: async (options: Record<string, unknown>) => { creates.push(options); return 'session-1' },
        open() {},
        binding: () => ({ session: { async rename() {} } }),
      },
      remote: { agentPresets: { select: async () => ({ ok: true }) } },
      layout: { selectPanel() {} },
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => '' })))
    client.apply(ctx as never)

    const injected = bodies.find((entry) => entry.name === 'main')?.inject?.() as {
      start?: (card: CardPack, workspaceId?: string) => Promise<{ ok: boolean }>
      workspaces?: unknown
    }
    expect(injected.workspaces).toBeDefined()
    expect((await injected.start?.(CARD, 'workspace-1'))?.ok).toBe(true)
    expect(creates).toEqual([{ workspaceId: 'workspace-1' }])
  })

  it('keeps gallery start available when the Workspace service is absent', async () => {
    const { ctx, bodies } = fakeContext()
    const creates: Array<Record<string, unknown>> = []
    Object.assign(ctx, {
      get: () => undefined,
      sessions: {
        create: async (options: Record<string, unknown>) => { creates.push(options); return 'session-2' },
        open() {},
        binding: () => ({ session: { async rename() {} } }),
      },
      remote: { agentPresets: { select: async () => ({ ok: true }) } },
      layout: { selectPanel() {} },
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => '' })))
    client.apply(ctx as never)

    const injected = bodies.find((entry) => entry.name === 'main')?.inject?.() as {
      start?: (card: CardPack, workspaceId?: string) => Promise<{ ok: boolean }>
      workspaces?: unknown
    }
    expect(injected.workspaces).toBeUndefined()
    expect((await injected.start?.(CARD))?.ok).toBe(true)
    expect(creates).toEqual([{}])
  })

  it('registers the Stage panel as a conversation view with the two-action API only', () => {
    const { ctx, bodies } = fakeContext()
    client.apply(ctx as never)

    const views = bodies.filter((entry) => entry.name === 'conversation.view')
    const stage = views.find((entry) => entry.id === 'dsh-rrp/stage')
    expect(stage?.order).toBe(30)
    const injected = stage?.inject?.() as { api?: Record<string, unknown> }
    expect(Object.keys(injected.api ?? {}).sort()).toEqual(['askCopilot', 'correctState', 'forget', 'loadManifest'])
  })
})
