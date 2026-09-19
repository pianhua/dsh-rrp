import { describe, expect, it } from 'vitest'
import { registerWorldlineRoute } from '../src/worldline-route.ts'
import { RRP_ROUTES, type WorldlineTreeResponse } from '../src/route-contract.ts'
import { emptyWorldlineDigest, type WorldlineDigest } from '../src/worldline-digest.ts'

interface FakeSession {
  id: string
  header: Record<string, unknown>
  card?: { id: string; name: string }
  digest: WorldlineDigest
}

function fakeHost(sessions: Record<string, FakeSession>) {
  const list = Object.values(sessions)
  const sessionsValue = { get: (id: string) => sessions[id], list: () => list }
  const projections = {
    stateOf: (session: unknown, key: string) => {
      const fake = session as FakeSession
      if (key === 'rrpCard') return fake.card
      if (key === 'rrpWorldlineDigest') return fake.digest
      return undefined
    },
  }
  const handlers = new Map<string, (req: unknown, res: unknown) => void | Promise<void>>()
  const webServer = {
    register: (route: { path: string; handler: (req: unknown, res: unknown) => void | Promise<void> }) => {
      handlers.set(route.path, route.handler)
      return () => {}
    },
  }
  const ctx = {
    effect: (fn: () => (() => void) | void) => fn(),
    get: (name: string) => ({ webServer, sessions: sessionsValue, sessionProjections: projections } as Record<string, unknown>)[name],
  }
  return { ctx, handlers }
}

function turnOf(turn: number, seq: number) {
  return { turn, seq, player: 'P' + String(turn), prose: '' }
}

async function call(host: ReturnType<typeof fakeHost>, path: string, init: { method?: string; body?: unknown; url?: string } = {}) {
  const req = init.body !== undefined
    ? { method: init.method ?? 'GET', url: init.url, async *[Symbol.asyncIterator]() { yield JSON.stringify(init.body) } }
    : { method: init.method ?? 'GET', url: init.url }
  const chunks: string[] = []
  const res = {
    statusCode: 0,
    setHeader: () => {},
    end: (s?: string) => { if (s !== undefined) chunks.push(s) },
  }
  await host.handlers.get(path)!(req, res)
  return { status: res.statusCode, body: JSON.parse(chunks.join('') || '{}') as Record<string, unknown> }
}

const MAIN: FakeSession = {
  id: 'm',
  header: {},
  card: { id: 'c1', name: '雁门' },
  digest: { turns: [turnOf(0, 1), turnOf(1, 3), turnOf(2, 7)] },
}
const BRANCH: FakeSession = {
  id: 'b',
  header: { inheritedEventCount: 5, meta: { parentSession: 'm' } },
  card: { id: 'c1', name: '雁门' },
  digest: { turns: [turnOf(0, 1), turnOf(1, 3), turnOf(2, 7)] },
}

describe('worldline routes (issue #28)', () => {
  it('the tree endpoint folds live card-owned sessions server-side', async () => {
    const host = fakeHost({ m: MAIN, b: BRANCH, free: { id: 'free', header: {}, digest: emptyWorldlineDigest() } })
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
    expect(cut?.children.map((child) => child.sessionId + ':' + String(child.turn))).toEqual(['m:2', 'b:2'])
  })

  it('hiding a line prunes it from the served tree and persists across calls', async () => {
    const host = fakeHost({ m: MAIN, b: BRANCH })
    registerWorldlineRoute(host.ctx as never)
    const set = await call(host, RRP_ROUTES.worldlineHidden, { method: 'POST', body: { sessionId: 'b', hidden: true } })
    expect(set.status).toBe(200)
    const after = await call(host, RRP_ROUTES.worldlineTree)
    const trees = (after.body as unknown as WorldlineTreeResponse).trees
    const cut = trees[0]?.roots[0]?.children[0]
    expect(cut?.children.map((child) => child.sessionId)).toEqual(['m'])
    const ledger = await call(host, RRP_ROUTES.worldlineHidden)
    expect((ledger.body as { hidden: string[] }).hidden).toEqual(['b'])
    await call(host, RRP_ROUTES.worldlineHidden, { method: 'POST', body: { sessionId: 'b', hidden: false } })
    const back = await call(host, RRP_ROUTES.worldlineTree)
    const restored = (back.body as unknown as WorldlineTreeResponse).trees[0]?.roots[0]?.children[0]
    expect(restored?.children).toHaveLength(2)
  })

  it('the hidden ledger rejects malformed bodies and non-GET trees reject methods', async () => {
    const host = fakeHost({})
    registerWorldlineRoute(host.ctx as never)
    const bad = await call(host, RRP_ROUTES.worldlineHidden, { method: 'POST', body: { sessionId: '' } })
    expect(bad.status).toBe(400)
    expect(typeof bad.body.error).toBe('string')
    const method = await call(host, RRP_ROUTES.worldlineTree, { method: 'POST', body: {} })
    expect(method.status).toBe(405)
  })
})
