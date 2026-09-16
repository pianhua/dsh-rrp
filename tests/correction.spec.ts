import { describe, expect, it } from 'vitest'
import { registerCorrectionRoute } from '../src/correction.ts'
import { emptyWorldState } from '../src/world-state.ts'

const VALID = { ...emptyWorldState(), scene: { location: '归离客栈' } }

function fakeHost() {
  const appended: Array<{ type: string; data: unknown }> = []
  const sessions = {
    get: (id: string) => (id === 's1' ? { append: (type: string, data: unknown) => { appended.push({ type, data }); return {} } } : undefined),
  }
  let route: { handler: (req: unknown, res: unknown) => unknown } | undefined
  const webServer = {
    register: (definition: { handler: (req: unknown, res: unknown) => unknown }) => {
      route = definition
      return () => {}
    },
  }
  const ctx = {
    effect(fn: () => (() => void) | void) {
      return fn()
    },
    get: (name: string) => ({ webServer, sessions } as Record<string, unknown>)[name],
  }
  return { ctx, appended, route: () => route }
}

function fakeExchange(body: unknown, method = 'POST') {
  const req = {
    method,
    async *[Symbol.asyncIterator]() {
      yield JSON.stringify(body)
    },
  }
  const res = {
    statusCode: 0,
    header: {} as Record<string, string>,
    setHeader(name: string, value: string) { this.header[name] = value },
    end(_payload?: string) {},
  }
  return { req, res }
}

describe('player correction route', () => {
  it('validates and appends the whole corrected state', async () => {
    const host = fakeHost()
    registerCorrectionRoute(host.ctx as never)
    const { req, res } = fakeExchange({ sessionId: 's1', state: VALID })
    await host.route()!.handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(host.appended).toHaveLength(1)
    expect(host.appended[0]?.type).toBe('rrp/world-state')
    expect(host.appended[0]?.data).toEqual(VALID)
  })

  it('rejects an invalid state without appending', async () => {
    const host = fakeHost()
    registerCorrectionRoute(host.ctx as never)
    const { req, res } = fakeExchange({ sessionId: 's1', state: { scene: { location: 7 } } })
    await host.route()!.handler(req, res)
    expect(res.statusCode).toBe(400)
    expect(host.appended).toHaveLength(0)
  })

  it('rejects an unknown session', async () => {
    const host = fakeHost()
    registerCorrectionRoute(host.ctx as never)
    const { req, res } = fakeExchange({ sessionId: 'nope', state: VALID })
    await host.route()!.handler(req, res)
    expect(res.statusCode).toBe(404)
    expect(host.appended).toHaveLength(0)
  })
})
