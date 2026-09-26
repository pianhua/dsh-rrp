import { describe, expect, it } from 'vitest'
import { registerWorldlineRoute } from '../src/worldline-route.ts'
import { RRP_ROUTES, type WorldlineTreeResponse } from '../src/route-contract.ts'
import { emptyWorldlineDigest, type WorldlineDigest } from '../src/worldline-digest.ts'
import { openWorldlineStore } from '../src/worldline-store.ts'

/**
 * Host-truth session shape (issue #36): `inheritedEventCount` is top-level and
 * `parentSession` sits directly on the header — mirroring the host typert
 * declaration so the fake can never again agree with a wrong reader.
 */
interface FakeSession {
  id: string
  inheritedEventCount?: number
  header: Record<string, unknown>
  card?: { id: string; name: string }
  digest: WorldlineDigest
}

function fakeHost(
  sessions: Record<string, FakeSession>,
  sessionQuery?: unknown,
  brokenProjectionId?: string,
  extra?: Record<string, unknown>,
) {
  const sessionsValue = { get: (id: string) => sessions[id], list: () => Object.values(sessions) }
  const projections = {
    stateOf: (session: unknown, key: string) => {
      const fake = session as FakeSession
      if (fake.id === brokenProjectionId) throw new Error('projection failed')
      if (key === 'rrpCard') return fake.card
      if (key === 'rrpWorldlineDigest') return fake.digest
      return undefined
    },
  }
  const handlers = new Map<string, (req: unknown, res: unknown) => void | Promise<void>>()
  const webServer = {
    register: (route: {
      path: string
      handler: (req: unknown, res: unknown) => void | Promise<void>
    }) => {
      handlers.set(route.path, route.handler)
      return () => {}
    },
  }
  const ctx = {
    effect: (fn: () => (() => void) | void) => fn(),
    get: (name: string) =>
      (
        ({
          webServer,
          sessions: sessionsValue,
          sessionProjections: projections,
          sessionQuery,
          ...extra,
        }) as Record<string, unknown>
      )[name],
  }
  return { ctx, handlers, sessions }
}

function turnOf(turn: number, seq: number) {
  return { turn, seq, player: 'P' + String(turn), prose: '' }
}
function digestOf(turns: ReturnType<typeof turnOf>[], firstLocalTurn?: number): WorldlineDigest {
  return {
    turns,
    nextTurn: turns.length === 0 ? 0 : Math.max(...turns.map((turn) => turn.turn)) + 1,
    forkCuts: [],
    ...(firstLocalTurn === undefined ? {} : { firstLocalTurn }),
  }
}

async function call(
  host: ReturnType<typeof fakeHost>,
  path: string,
  init: { method?: string; body?: unknown; url?: string } = {},
) {
  const req =
    init.body !== undefined
      ? {
          method: init.method ?? 'GET',
          url: init.url,
          async *[Symbol.asyncIterator]() {
            yield JSON.stringify(init.body)
          },
        }
      : { method: init.method ?? 'GET', url: init.url }
  const chunks: string[] = []
  const res = {
    statusCode: 0,
    setHeader: () => {},
    end: (s?: string) => {
      if (s !== undefined) chunks.push(s)
    },
  }
  await host.handlers.get(path)!(req, res)
  return {
    status: res.statusCode,
    body: JSON.parse(chunks.join('') || '{}') as Record<string, unknown>,
  }
}

const MAIN: FakeSession = {
  id: 'm',
  header: {},
  card: { id: 'c1', name: '雁门' },
  digest: digestOf([turnOf(0, 1), turnOf(1, 3), turnOf(2, 7)], 0),
}
const BRANCH: FakeSession = {
  id: 'b',
  inheritedEventCount: 5,
  header: { parentSession: 'm' },
  card: { id: 'c1', name: '雁门' },
  digest: digestOf([turnOf(0, 1), turnOf(1, 3), turnOf(2, 7)], 2),
}
// 旧版虚构结构（header.inheritedEventCount + header.meta.parentSession）——
// 作为回归守卫喂入时必须失效，绝不能再与错误实现"自洽"。
const LEGACY_FICTION: FakeSession = {
  id: 'legacy',
  header: { inheritedEventCount: 5, meta: { parentSession: 'm' } },
  card: { id: 'c1', name: '雁门' },
  digest: digestOf([turnOf(0, 1), turnOf(1, 3), turnOf(2, 7)], 0),
}

describe('worldline routes (issue #28)', () => {
  it('the tree endpoint folds live card-owned sessions server-side', async () => {
    const host = fakeHost({
      m: MAIN,
      b: BRANCH,
      free: { id: 'free', header: {}, digest: emptyWorldlineDigest() },
    })
    registerWorldlineRoute(host.ctx as never)
    const res = await call(host, RRP_ROUTES.worldlineTree)
    expect(res.status).toBe(200)
    const trees = (res.body as unknown as WorldlineTreeResponse).trees
    expect(trees).toHaveLength(1)
    expect(trees[0]?.cardId).toBe('c1')
    // Main trunk 0→1→2 with the branch (seedTurns 2) cut in at turn 1.
    const root = trees[0]?.roots[0]
    expect(root?.sessionId).toBe('m')
    const cut = root?.children[0]
    expect(cut?.turn).toBe(1)
    expect(cut?.children.map((child) => child.sessionId + ':' + String(child.turn))).toEqual([
      'm:2',
      'b:2',
    ])
  })

  it('the legacy fictional shape must NOT attach (issue #36 regression guard)', async () => {
    // 旧实现读的是 header.inheritedEventCount / header.meta.parentSession；
    // 真实宿主结构下这些字段不存在，旧结构喂入后必须退化为独立 root，
    // 用"旧结构必然失效"钉死正确读法，防止测试与实现再次一起错。
    const host = fakeHost({ m: MAIN, legacy: LEGACY_FICTION })
    registerWorldlineRoute(host.ctx as never)
    const res = await call(host, RRP_ROUTES.worldlineTree)
    const trees = (res.body as unknown as WorldlineTreeResponse).trees
    expect(trees).toHaveLength(1)
    expect(trees[0]?.roots.map((root) => root.sessionId).sort()).toEqual(['legacy', 'm'])
  })

  it('subagent children are never folded as worldline branches (issue #36)', async () => {
    const subagent: FakeSession = {
      id: 'agent-child',
      inheritedEventCount: 5,
      header: { parentSession: 'm', origin: 'subagent' },
      card: { id: 'c1', name: '雁门' },
      digest: digestOf([turnOf(0, 1), turnOf(1, 3)], 2),
    }
    const host = fakeHost({ m: MAIN, b: BRANCH, sub: subagent })
    registerWorldlineRoute(host.ctx as never)
    const res = await call(host, RRP_ROUTES.worldlineTree)
    const trees = (res.body as unknown as WorldlineTreeResponse).trees
    const flat = (nodes: (typeof trees)[0]['roots']): string[] =>
      nodes.flatMap((node) => [node.sessionId, ...flat(node.children)])
    expect(flat(trees[0]?.roots ?? [])).not.toContain('agent-child')
    // b 仍是合法 fork，挂在 m 的切点下；唯一的 root 是 m。
    expect(flat(trees[0]?.roots ?? [])).toContain('b')
    expect(trees[0]?.roots.map((root) => root.sessionId)).toEqual(['m'])
  })

  it('hiding a line prunes it from the served tree and persists across calls', async () => {
    const host = fakeHost({ m: MAIN, b: BRANCH })
    registerWorldlineRoute(host.ctx as never)
    const set = await call(host, RRP_ROUTES.worldlineHidden, {
      method: 'POST',
      body: { sessionId: 'b', hidden: true },
    })
    expect(set.status).toBe(200)
    const after = await call(host, RRP_ROUTES.worldlineTree)
    const trees = (after.body as unknown as WorldlineTreeResponse).trees
    const cut = trees[0]?.roots[0]?.children[0]
    expect(cut?.children.map((child) => child.sessionId)).toEqual(['m'])
    const ledger = await call(host, RRP_ROUTES.worldlineHidden)
    expect((ledger.body as { hidden: string[] }).hidden).toEqual(['b'])
    await call(host, RRP_ROUTES.worldlineHidden, {
      method: 'POST',
      body: { sessionId: 'b', hidden: false },
    })
    const back = await call(host, RRP_ROUTES.worldlineTree)
    const restored = (back.body as unknown as WorldlineTreeResponse).trees[0]?.roots[0]?.children[0]
    expect(restored?.children).toHaveLength(2)
  })

  it('isolates a failing live projection instead of failing the whole map', async () => {
    const broken: FakeSession = {
      id: 'broken',
      header: {},
      card: { id: 'c1', name: '雁门' },
      digest: digestOf([turnOf(0, 11)], 0),
    }
    const host = fakeHost({ m: MAIN, broken }, undefined, 'broken')
    registerWorldlineRoute(host.ctx as never)
    const res = await call(host, RRP_ROUTES.worldlineTree)
    const trees = (res.body as unknown as WorldlineTreeResponse).trees
    const flat = (nodes: (typeof trees)[0]['roots']): string[] =>
      nodes.flatMap((node) => [node.sessionId, ...flat(node.children)])
    expect(flat(trees[0]?.roots ?? [])).toContain('m')
    expect(flat(trees[0]?.roots ?? [])).not.toContain('broken')
  })

  it('the hidden ledger rejects malformed bodies and non-GET trees reject methods', async () => {
    const host = fakeHost({})
    registerWorldlineRoute(host.ctx as never)
    const bad = await call(host, RRP_ROUTES.worldlineHidden, {
      method: 'POST',
      body: { sessionId: '' },
    })
    expect(bad.status).toBe(400)
    expect(typeof bad.body.error).toBe('string')
    const method = await call(host, RRP_ROUTES.worldlineTree, { method: 'POST', body: {} })
    expect(method.status).toBe(405)
  })
})

describe('worldline store compatibility', () => {
  it('falls back to entries when the host table has no keys method', async () => {
    let closed = false
    const opened = await openWorldlineStore(() => ({
      open: async () => ({
        table: () => ({
          get: () => undefined,
          put: async () => {},
          delete: async () => true,
          entries: () => [['hidden-session', { at: 'now' }]],
        }),
        close: async () => {
          closed = true
        },
      }),
    }))
    expect(opened.handle.listHidden()).toEqual(['hidden-session'])
    await opened.handle.close()
    expect(closed).toBe(true)
  })
})

describe('cold skeleton facts (issue #29)', () => {
  /** Host session-query face: cold persisted records + cold title reads. */
  function fakeSessionQuery(
    cold: Array<{ header: Record<string, unknown>; title?: string; inheritedEventCount?: number }>,
  ) {
    return {
      listSessions: async () =>
        cold.map((record) => ({ header: record.header, live: false, persisted: true })),
      readTitleSnapshots: async (ids: string[]) =>
        cold
          .filter((record) => ids.includes(String(record.header.id)))
          .map((record) => ({
            status: 'fulfilled',
            value: {
              session: { id: record.header.id },
              title: record.title === undefined ? undefined : { title: record.title },
            },
          })),
      readSession: async (id: string) => {
        const record = cold.find((entry) => String(entry.header.id) === id)
        return { inheritedEventCount: record?.inheritedEventCount ?? 0 }
      },
    }
  }

  it('a cold RP branch enters the map as a stub hung on the live parent tail', async () => {
    const query = fakeSessionQuery([
      { header: { id: 'cold1', parentSession: 'm', agentPreset: 'rp-c1' }, title: '雪夜·线2' },
    ])
    const host = fakeHost({ m: MAIN, b: BRANCH }, query)
    registerWorldlineRoute(host.ctx as never)
    const res = await call(host, RRP_ROUTES.worldlineTree)
    expect(res.status).toBe(200)
    const trees = (res.body as unknown as WorldlineTreeResponse).trees
    const flat = (
      nodes: (typeof trees)[0]['roots'],
    ): Array<{ id: string; loaded?: boolean; title: string }> =>
      nodes.flatMap((node) => [
        { id: node.sessionId, loaded: node.loaded, title: node.sessionTitle },
        ...flat(node.children),
      ])
    const stub = flat(trees[0]?.roots ?? []).find((node) => node.id === 'cold1')
    expect(stub).toBeDefined()
    expect(stub?.loaded).toBe(false)
    expect(stub?.title).toBe('雪夜·线2')
    // Live facts untouched: m is still the only root, b still at the cut.
    expect(trees[0]?.roots.map((root) => root.sessionId)).toEqual(['m'])
  })

  it('reads a cold session cut and mounts it at the precise live parent turn', async () => {
    const query = fakeSessionQuery([
      {
        header: { id: 'cold-exact', parentSession: 'm', agentPreset: 'rp-c1' },
        inheritedEventCount: 5,
      },
    ])
    const host = fakeHost({ m: MAIN, b: BRANCH }, query)
    registerWorldlineRoute(host.ctx as never)
    const res = await call(host, RRP_ROUTES.worldlineTree)
    const trees = (res.body as unknown as WorldlineTreeResponse).trees
    const cut = trees[0]?.roots[0]?.children[0]
    expect(cut?.turn).toBe(1)
    expect(cut?.children.some((child) => child.sessionId === 'cold-exact')).toBe(true)
    expect(cut?.children.find((child) => child.sessionId === 'cold-exact')?.seedKnown).toBe(true)
  })

  it('treats an invalid cold inherited-event count as unknown', async () => {
    const query = fakeSessionQuery([
      {
        header: { id: 'cold-invalid', parentSession: 'm', agentPreset: 'rp-c1' },
        inheritedEventCount: Number.NaN,
      },
    ])
    const host = fakeHost({ m: MAIN, b: BRANCH }, query)
    registerWorldlineRoute(host.ctx as never)
    const res = await call(host, RRP_ROUTES.worldlineTree)
    const trees = (res.body as unknown as WorldlineTreeResponse).trees
    const nodes = (
      nodeList: (typeof trees)[0]['roots'],
    ): Array<{ sessionId: string; seedKnown?: boolean }> =>
      nodeList.flatMap((node) => [
        { sessionId: node.sessionId, seedKnown: node.seedKnown },
        ...nodes(node.children),
      ])
    const node = nodes(trees[0]?.roots ?? []).find((entry) => entry.sessionId === 'cold-invalid')
    expect(node?.seedKnown).toBe(false)
  })

  it('resolves a cold fork cut from the fork-time cache when readSession cannot (host seam defect)', async () => {
    const tables = new Map<string, Map<string, unknown>>()
    // Fork-time cache: 验收-style cut recorded when the fork happened live.
    tables.set('cuts', new Map([['cold-cut', { parentId: 'm', turn: 2, at: '' }]]))
    const query = {
      listSessions: async () => [
        {
          header: { id: 'cold-cut', parentSession: 'm', agentPreset: 'rp-c1' },
          live: false,
          persisted: true,
        },
      ],
      readTitleSnapshots: async () => [],
      // The host defect: readSession rejects EVERY seeded session.
      readSession: async () => {
        throw new Error('seeded session constructor seed must equal its inherited prefix')
      },
    }
    const host = fakeHost({ m: MAIN, b: BRANCH }, query, undefined, {
      storageDomain: {
        open: async () => ({
          table: (name: string) => {
            if (!tables.has(name)) tables.set(name, new Map())
            const table = tables.get(name)!
            return {
              get: (key: string) => table.get(key),
              put: async (key: string, value: unknown) => {
                table.set(key, value)
              },
              delete: async (key: string) => table.delete(key),
              keys: () => table.keys(),
              entries: () => table.entries(),
              size: table.size,
            }
          },
          close: async () => {},
        }),
      },
    })
    registerWorldlineRoute(host.ctx as never)
    const res = await call(host, RRP_ROUTES.worldlineTree)
    const trees = (res.body as unknown as WorldlineTreeResponse).trees
    const cut = trees[0]?.roots[0]?.children[0]
    expect(cut?.turn).toBe(1)
    const child = cut?.children.find((node) => node.sessionId === 'cold-cut')
    expect(child?.seedKnown).toBe(true)
    expect(child?.loaded).toBe(false)
  })

  it('rescues a cold main line with an unreliable persisted preset via the card index', async () => {
    const query = fakeSessionQuery([
      // The host persists "standard" for gallery-started mains (seen on
      // 0.1.6-alpha.2): preset attribution fails, the card index must not.
      { header: { id: 'wandering-main', agentPreset: 'standard' }, title: '出走的·主线' },
    ])
    const host = fakeHost(
      {
        m: MAIN,
        b: BRANCH,
        wandering: {
          id: 'wandering-main',
          header: {},
          card: { id: 'c1', name: '雁门' },
          digest: digestOf([turnOf(0, 1)], 0),
        },
      },
      query,
    )
    registerWorldlineRoute(host.ctx as never)
    // Phase 1: the session is live — its card enters the index as a side effect.
    const liveRes = await call(host, RRP_ROUTES.worldlineTree)
    const liveRoots = (liveRes.body as unknown as WorldlineTreeResponse).trees[0]?.roots ?? []
    expect(liveRoots.some((node) => node.sessionId === 'wandering-main')).toBe(true)
    // Phase 2: it goes cold — the index keeps it on its own card's map.
    delete host.sessions.wandering
    const coldRes = await call(host, RRP_ROUTES.worldlineTree)
    const trees = (coldRes.body as unknown as WorldlineTreeResponse).trees
    const stub = trees[0]?.roots.find((node) => node.sessionId === 'wandering-main')
    expect(stub).toBeDefined()
    expect(stub?.loaded).toBe(false)
    expect(stub?.sessionTitle).toBe('出走的·主线')
    expect(stub?.seedKnown).toBeUndefined()
  })

  it('ignores cold non-RP, subagent, and live sessions; degrades silently without the service', async () => {
    const query = fakeSessionQuery([
      { header: { id: 'assistant-cold', agentPreset: 'assistant' } },
      { header: { id: 'sub-cold', parentSession: 'm', origin: 'subagent', agentPreset: 'rp-c1' } },
      { header: { id: 'm', agentPreset: 'rp-c1' } },
      { header: { id: 'unknown-card', agentPreset: 'rp-Not A Card!' } },
    ])
    const host = fakeHost({ m: MAIN, b: BRANCH }, query)
    registerWorldlineRoute(host.ctx as never)
    const res = await call(host, RRP_ROUTES.worldlineTree)
    const trees = (res.body as unknown as WorldlineTreeResponse).trees
    const flat = (nodes: (typeof trees)[0]['roots']): string[] =>
      nodes.flatMap((node) => [node.sessionId, ...flat(node.children)])
    expect(flat(trees[0]?.roots ?? [])).toEqual(['m', 'm', 'm', 'b'])

    // No sessionQuery service at all: live-only map, no error.
    const bare = fakeHost({ m: MAIN, b: BRANCH })
    registerWorldlineRoute(bare.ctx as never)
    const bareRes = await call(bare, RRP_ROUTES.worldlineTree)
    expect(bareRes.status).toBe(200)
  })

  it('a failing session-query degrades to the live-only map, never a 503', async () => {
    const query = {
      listSessions: async () => {
        throw new Error('sqlite gone')
      },
    }
    const host = fakeHost({ m: MAIN, b: BRANCH }, query)
    registerWorldlineRoute(host.ctx as never)
    const res = await call(host, RRP_ROUTES.worldlineTree)
    expect(res.status).toBe(200)
    const trees = (res.body as unknown as WorldlineTreeResponse).trees
    expect(trees[0]?.roots.map((root) => root.sessionId)).toEqual(['m'])
  })
})
