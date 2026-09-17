import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { registerSedimentRoute } from '../src/sediment-route.ts'
import { listSediment } from '../src/sediment.ts'

let home: string
let previous: string | undefined

beforeEach(() => {
  previous = process.env.DSH_HOME
  home = mkdtempSync(join(tmpdir(), 'dsh-rrp-sedroute-'))
  process.env.DSH_HOME = home
})
afterEach(() => {
  if (previous === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previous
  rmSync(home, { recursive: true, force: true })
})

/** Minimal fake host: only the session and webserver faces are exercised. */
function fakeHost() {
  const sessions = {
    get: (id: string) => (id === 's1' ? { id: 's1', append() {}, snapshotEvents: () => [] } : undefined),
  }
  let route: { handler: (req: unknown, res: unknown) => unknown } | undefined
  const webServer = { register: (definition: { handler: (req: unknown, res: unknown) => unknown }) => { route = definition; return () => {} } }
  const ctx = {
    effect: (fn: () => (() => void) | void) => fn(),
    get: (name: string) => ({ webServer, sessions, agents: { get: () => undefined } } as Record<string, unknown>)[name],
  }
  return { ctx, route: () => route }
}

/** A JSON request/response pair. */
function exchange(method: string, url: string, body?: unknown) {
  const req = {
    method,
    url,
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield JSON.stringify(body)
    },
  }
  const res = {
    statusCode: 0,
    payload: undefined as unknown,
    setHeader() {},
    end(text?: string) { this.payload = text === undefined ? undefined : JSON.parse(text) as unknown },
  }
  return { req, res }
}

const DRAFT = { name: 'qingqiu-lore', description: '青丘狐族；涉及青丘时使用。', body: '# 青丘' }

describe('sediment route (D8)', () => {
  it('writes a manual draft, lists it, then deletes it', async () => {
    const host = fakeHost()
    registerSedimentRoute(host.ctx as never)

    const manual = exchange('POST', '/dsh-rrp/sediment', { sessionId: 's1', action: 'manual', draft: DRAFT })
    await host.route()!.handler(manual.req, manual.res)
    expect(manual.res.statusCode).toBe(200)
    expect(listSediment(home, 's1').map((skill) => skill.name)).toEqual(['qingqiu-lore'])

    const listed = exchange('GET', '/dsh-rrp/sediment?sessionId=s1')
    await host.route()!.handler(listed.req, listed.res)
    expect(listed.res.statusCode).toBe(200)
    expect((listed.res.payload as { skills: unknown[] }).skills).toHaveLength(1)
    expect((listed.res.payload as { pending: unknown }).pending).toBeNull()

    const removed = exchange('DELETE', '/dsh-rrp/sediment?sessionId=s1&name=qingqiu-lore')
    await host.route()!.handler(removed.req, removed.res)
    expect(removed.res.statusCode).toBe(200)
    expect(listSediment(home, 's1')).toEqual([])
  })

  it('is add-only: the same name twice is refused', async () => {
    const host = fakeHost()
    registerSedimentRoute(host.ctx as never)
    const first = exchange('POST', '/dsh-rrp/sediment', { sessionId: 's1', action: 'manual', draft: DRAFT })
    await host.route()!.handler(first.req, first.res)
    const second = exchange('POST', '/dsh-rrp/sediment', { sessionId: 's1', action: 'manual', draft: DRAFT })
    await host.route()!.handler(second.req, second.res)
    expect(second.res.statusCode).toBe(400)
    expect(listSediment(home, 's1')).toHaveLength(1)
  })

  it('rejects a confirm with no pending draft and clears on discard', async () => {
    const host = fakeHost()
    registerSedimentRoute(host.ctx as never)
    const confirm = exchange('POST', '/dsh-rrp/sediment', { sessionId: 's1', action: 'confirm' })
    await host.route()!.handler(confirm.req, confirm.res)
    expect(confirm.res.statusCode).toBe(400)

    const discard = exchange('POST', '/dsh-rrp/sediment', { sessionId: 's1', action: 'discard' })
    await host.route()!.handler(discard.req, discard.res)
    expect(discard.res.statusCode).toBe(200)
  })

  it('reports Scribe unavailability and unknown sessions', async () => {
    const host = fakeHost()
    registerSedimentRoute(host.ctx as never)

    const draft = exchange('POST', '/dsh-rrp/sediment', { sessionId: 's1', action: 'draft', topic: 'x' })
    await host.route()!.handler(draft.req, draft.res)
    expect(draft.res.statusCode).toBe(503)

    const missing = exchange('GET', '/dsh-rrp/sediment')
    await host.route()!.handler(missing.req, missing.res)
    expect(missing.res.statusCode).toBe(400)

    const unknown = exchange('GET', '/dsh-rrp/sediment?sessionId=nope')
    await host.route()!.handler(unknown.req, unknown.res)
    expect(unknown.res.statusCode).toBe(404)
  })
})
