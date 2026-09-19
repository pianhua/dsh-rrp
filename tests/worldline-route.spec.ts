import { describe, expect, it } from 'vitest'
import { registerWorldlineRoute } from '../src/worldline-route.ts'
import { RRP_ROUTES, type WorldlineFactsResponse, type WorldlineHiddenResponse } from '../src/route-contract.ts'
import { emptyWorldlineDigest, type WorldlineDigest } from '../src/worldline-digest.ts'

interface FakeSession {
  id: string
  header: Record<string, unknown>
  card?: { id: string; name: string }
  digest: WorldlineDigest
  preset: string
}

function fakeHost(options: { sessions?: Record<string, FakeSession> } = {}) {
  const sessionsValue = options.sessions ?? {}
  const sessions = { get: (id: string) => sessionsValue[id] }
  const projections = {
    stateOf: (session: unknown, key: string) => {
      const fake = session as FakeSession
      if (key === 'agentPreset') return fake.preset
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
    get: (name: string) => ({ webServer, sessions, sessionProjections: projections } as Record<string, unknown>)[name],
  }
  return { ctx, handlers }
}

function turnOf(turn: number, seq: number) {
  return { turn, seq, player: 'P' + String(turn), prose: '' }
}

async function call(host: ReturnType<typeof fakeHost>, path: string, init: { method: string; body?: unknown; url?: string } = { method: 'GET' }) {
  const req = init.body !== undefined
    ? { method: init.method, url: init.url, async *[Symbol.asyncIterator]() { yield JSON.stringify(init.body) } }
    : { method: init.method, url: init.url }
  const chunks: string[] = []
  const res = {
    statusCode: 0,
    setHeader: () => {},
    end: (s?: string) => { if (s !== undefined) chunks.push(s) },
  }
  await host.handlers.get(path)!(req, res)
  return { status: res.statusCode, body: JSON.parse(chunks.join('') || '{}') as Record<string, unknown> }
}

describe('worldline routes (issue #28)', () => {
  it('facts converts the inherited event cut into seed turns', async () => {
    const host = fakeHost({
      sessions: {
        s1: {
          id: 's1',
          header: { inheritedEventCount: 5, meta: { parentSession: 'p' } },
          card: { id: 'c1', name: '雁门' },
          digest: { turns: [turnOf(0, 1), turnOf(1, 3), turnOf(2, 7)] },
          preset: 'rp-c1',
        },
      },
    })
    registerWorldlineRoute(host.ctx as never)
    const res = await call(host, RRP_ROUTES.worldlineFacts, { method: 'GET', url: 'http://x' + RRP_ROUTES.worldlineFacts + '?sessionId=s1' })
    expect(res.status).toBe(200)
    const body = res.body as unknown as WorldlineFactsResponse
    expect(body.cardId).toBe('c1')
    expect(body.seedTurns).toBe(2)
    expect(body.turns).toHaveLength(3)
  })

  it('facts degrades to an empty card and guards unknown/non-RP sessions', async () => {
    const host = fakeHost({
      sessions: {
        nocard: { id: 'nocard', header: {}, digest: emptyWorldlineDigest(), preset: 'rp-c1' },
        code: { id: 'code', header: {}, digest: emptyWorldlineDigest(), preset: 'assistant' },
      },
    })
    registerWorldlineRoute(host.ctx as never)
    const free = await call(host, RRP_ROUTES.worldlineFacts, { method: 'GET', url: 'http://x' + RRP_ROUTES.worldlineFacts + '?sessionId=nocard' })
    expect(free.status).toBe(200)
    expect((free.body as unknown as WorldlineFactsResponse).cardId).toBe('')
    const code = await call(host, RRP_ROUTES.worldlineFacts, { method: 'GET', url: 'http://x' + RRP_ROUTES.worldlineFacts + '?sessionId=code' })
    expect(code.status).toBe(403)
    const missing = await call(host, RRP_ROUTES.worldlineFacts, { method: 'GET', url: 'http://x' + RRP_ROUTES.worldlineFacts + '?sessionId=nope' })
    expect(missing.status).toBe(404)
  })

  it('the hidden ledger round-trips through the memory fallback (no storageDomain)', async () => {
    const host = fakeHost()
    registerWorldlineRoute(host.ctx as never)
    const before = await call(host, RRP_ROUTES.worldlineHidden)
    expect((before.body as unknown as WorldlineHiddenResponse).hidden).toEqual([])
    const set = await call(host, RRP_ROUTES.worldlineHidden, { method: 'POST', body: { sessionId: 's9', hidden: true } })
    expect(set.status).toBe(200)
    const after = await call(host, RRP_ROUTES.worldlineHidden)
    expect((after.body as unknown as WorldlineHiddenResponse).hidden).toEqual(['s9'])
    await call(host, RRP_ROUTES.worldlineHidden, { method: 'POST', body: { sessionId: 's9', hidden: false } })
    const cleared = await call(host, RRP_ROUTES.worldlineHidden)
    expect((cleared.body as unknown as WorldlineHiddenResponse).hidden).toEqual([])
  })

  it('the hidden ledger rejects malformed bodies', async () => {
    const host = fakeHost()
    registerWorldlineRoute(host.ctx as never)
    const bad = await call(host, RRP_ROUTES.worldlineHidden, { method: 'POST', body: { sessionId: '' } })
    expect(bad.status).toBe(400)
    expect(typeof bad.body.error).toBe('string')
  })
})
