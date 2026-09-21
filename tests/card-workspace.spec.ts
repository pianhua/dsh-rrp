/**
 * dsh-rrp — the card workspace ensure route (issue #37).
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cardSaveDir, registerCardWorkspaceRoute } from '../src/card-workspace-route.ts'
import { RRP_ROUTES } from '../src/route-contract.ts'

describe('/dsh-rrp/card-workspace route', () => {
  let home: string
  let routes: Map<string, (req: unknown, res: unknown) => void>
  const originalHome = process.env.DSH_HOME

  interface FakeWorkspace {
    id: string
    path: string
    title: string
  }
  /** In-memory stand-in for the host workspaceRegistry. */
  function fakeRegistry() {
    const byPath = new Map<string, FakeWorkspace & { setTitle(t: string): Promise<void> }>()
    let seq = 0
    return {
      byPath,
      service: {
        async resolveByPath(path: string) {
          return byPath.get(path)
        },
        async create(path: string, title: string) {
          const existing = byPath.get(path)
          if (existing !== undefined) return existing
          const workspace = {
            id: 'ws-' + String(++seq),
            path,
            title,
            async setTitle(t: string) {
              workspace.title = t
            },
          }
          byPath.set(path, workspace)
          return workspace
        },
      },
    }
  }
  let registry: ReturnType<typeof fakeRegistry>

  const ctx = {
    effect: (fn: () => unknown) => {
      fn()
    },
    get: (name: string) => {
      if (name === 'webServer') {
        return {
          register: (route: { path: string; handler: (req: unknown, res: unknown) => void }) => {
            routes.set(route.path, route.handler)
            return () => undefined
          },
        }
      }
      if (name === 'workspaceRegistry') return registry.service
      return undefined
    },
  } as never

  interface FakeResponse {
    statusCode: number
    text: string | undefined
    setHeader(name: string, value: string): void
    end(body?: string): void
  }

  async function call(body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const res: FakeResponse = {
      statusCode: 0,
      text: undefined,
      setHeader() {},
      end(payload) {
        this.text = payload
      },
    }
    async function* stream() {
      yield JSON.stringify(body)
    }
    await routes.get(RRP_ROUTES.cardWorkspace)?.(
      { method: 'POST', [Symbol.asyncIterator]: stream },
      res,
    )
    let parsed = {} as Record<string, unknown>
    if (res.text !== undefined) {
      try {
        parsed = JSON.parse(res.text) as Record<string, unknown>
      } catch {
        parsed = {}
      }
    }
    return { status: res.statusCode, body: parsed }
  }

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'rrp-ws-home-'))
    process.env.DSH_HOME = home
    routes = new Map()
    registry = fakeRegistry()
    registerCardWorkspaceRoute(ctx)
  })
  afterEach(() => {
    if (originalHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = originalHome
    rmSync(home, { recursive: true, force: true })
  })

  it('adopts the save dir as a workspace and creates it on disk', async () => {
    const res = await call({ cardId: 'demo', cardName: '示例卡' })
    expect(res.status).toBe(200)
    expect(res.body.created).toBe(true)
    expect(typeof res.body.workspaceId).toBe('string')
    expect(res.body.path).toBe(cardSaveDir('demo', home))
    expect(existsSync(join(home, '.dsh-rrp', 'saves', 'demo'))).toBe(true)
  })

  it('is idempotent: the second ensure reuses the workspace (created=false)', async () => {
    const first = await call({ cardId: 'demo', cardName: '示例卡' })
    const second = await call({ cardId: 'demo', cardName: '示例卡' })
    expect(second.status).toBe(200)
    expect(second.body.created).toBe(false)
    expect(second.body.workspaceId).toBe(first.body.workspaceId)
  })

  it('corrects a drifted title after the card was renamed', async () => {
    await call({ cardId: 'demo', cardName: '旧卡名' })
    const res = await call({ cardId: 'demo', cardName: '新卡名' })
    expect(res.status).toBe(200)
    expect(res.body.created).toBe(false)
    const ws = registry.byPath.get(cardSaveDir('demo', home))
    expect(ws?.title).toBe('新卡名')
  })

  it('degrades to 503 without the workspace registry (client falls back)', async () => {
    registry = fakeRegistry()
    // Re-register against a ctx whose registry probe stays undefined: swap the
    // registry AFTER registration is not possible (lazy probe reads ctx.get),
    // so emulate absence with a dedicated context.
    const bare = {
      effect: (fn: () => unknown) => {
        fn()
      },
      get: (name: string) =>
        name === 'webServer'
          ? {
              register: (route: {
                path: string
                handler: (req: unknown, res: unknown) => void
              }) => {
                routes.set(route.path, route.handler)
                return () => undefined
              },
            }
          : undefined,
    } as never
    routes = new Map()
    registerCardWorkspaceRoute(bare)
    const res = await call({ cardId: 'demo', cardName: '示例卡' })
    expect(res.status).toBe(503)
  })

  it('rejects a bad cardId or blank cardName without touching the registry', async () => {
    expect((await call({ cardId: 'bad id!', cardName: 'x' })).status).toBe(400)
    expect((await call({ cardId: 'demo', cardName: '  ' })).status).toBe(400)
    expect(registry.byPath.size).toBe(0)
  })

  it('rejects non-POST', async () => {
    const res: FakeResponse = {
      statusCode: 0,
      text: undefined,
      setHeader() {},
      end(payload) {
        this.text = payload
      },
    }
    routes.get(RRP_ROUTES.cardWorkspace)?.({ method: 'GET' }, res)
    expect(res.statusCode).toBe(405)
  })
})
