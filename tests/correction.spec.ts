import { describe, expect, it } from 'vitest'
import { forgetActivity, readActivity } from '../src/activity.ts'
import { registerCorrectionRoute } from '../src/correction.ts'
import { forgetState } from '../src/state-publisher.ts'
import { emptyWorldState } from '../src/world-state.ts'

const VALID = { ...emptyWorldState(), scene: { location: '归离客栈' } }

function fakeHost(failAppend = false) {
  const appended: Array<{ type: string; data: unknown }> = []
  const sessions = {
    get: (id: string) => (id === 's1' ? {
      id: 's1',
      append: (type: string, data: unknown) => {
        if (failAppend) throw new Error('append failed')
        appended.push({ type, data })
        return {}
      },
    } : undefined),
  }
  let route: { handler: (req: unknown, res: unknown) => unknown } | undefined
  const webServer = {
    register: (definition: { handler: (req: unknown, res: unknown) => unknown }) => {
      route = definition
      return () => {}
    },
  }
  const sessionProjections = { stateOf: () => undefined }
  const ctx = {
    effect(fn: () => (() => void) | void) {
      return fn()
    },
    get: (name: string) => ({ webServer, sessions, sessionProjections } as Record<string, unknown>)[name],
  }
  return { ctx, appended, route: () => route }
}

it('keeps the correction route idle until the projection registry is available', () => {
  let registered = false
  const ctx = {
    effect: (fn: () => unknown) => fn(),
    get: (name: string) => ({
      webServer: { register: () => { registered = true; return () => {} } },
      sessions: { get: () => undefined },
    } as Record<string, unknown>)[name],
  }
  registerCorrectionRoute(ctx as never)
  expect(registered).toBe(false)
})

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
  it('validates and publishes the whole corrected state', async () => {
    forgetState('s1'); forgetActivity('s1')
    const host = fakeHost()
    registerCorrectionRoute(host.ctx as never)
    const { req, res } = fakeExchange({ sessionId: 's1', state: VALID })
    await host.route()!.handler(req, res)

    expect(res.statusCode).toBe(200)
    const writes = host.appended.filter((entry) => entry.type === 'user/message')
    expect(writes).toHaveLength(1)
    expect((writes[0]?.data as { source: { rrp: { worldState: unknown } } }).source.rrp.worldState).toEqual(VALID)

    // Attribution: a player correction is recorded as such in the ledger.
    const activity = readActivity('s1')
    expect(activity.entries).toHaveLength(1)
    expect(activity.entries[0]?.actor).toBe('player')
    expect(activity.entries[0]?.phase).toBe('corrected')
  })

  it('returns 200 without appending when the correction changes nothing (issue #12)', async () => {
    forgetState('s1'); forgetActivity('s1')
    // The projection already holds the identical state: a stray save must not
    // append a facts message nor touch the ledger.
    const appended: Array<{ type: string; data: unknown }> = []
    const sessions = {
      get: (id: string) => (id === 's1' ? {
        id: 's1',
        append: (type: string, data: unknown) => { appended.push({ type, data }); return {} },
      } : undefined),
    }
    let route: { handler: (req: unknown, res: unknown) => unknown } | undefined
    const webServer = {
      register: (definition: { handler: (req: unknown, res: unknown) => unknown }) => {
        route = definition
        return () => {}
      },
    }
    const sessionProjections = { stateOf: (_s: unknown, key: string) => key === 'rrpWorldState' ? VALID : undefined }
    const ctx = {
      effect(fn: () => (() => void) | void) { return fn() },
      get: (name: string) => ({ webServer, sessions, sessionProjections } as Record<string, unknown>)[name],
    }
    registerCorrectionRoute(ctx as never)
    const { req, res } = fakeExchange({ sessionId: 's1', state: VALID })
    await route!.handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(appended).toHaveLength(0)
    expect(readActivity('s1').entries).toHaveLength(0)
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

  it('reports a failed append and does not record a correction', async () => {
    forgetState('s1'); forgetActivity('s1')
    const host = fakeHost(true)
    registerCorrectionRoute(host.ctx as never)
    const { req, res } = fakeExchange({ sessionId: 's1', state: VALID })
    await host.route()!.handler(req, res)
    expect(res.statusCode).toBe(500)
    expect(host.appended).toEqual([])
    expect(readActivity('s1').entries).toEqual([])
  })

  it('prunes over-limit entries and clamps constrained dynamic fields before publishing', async () => {
    forgetState('s1'); forgetActivity('s1')
    const host = fakeHost()
    registerCorrectionRoute(host.ctx as never)
    const overLimitFlags: Record<string, boolean> = {}
    for (let i = 0; i < 20; i++) overLimitFlags[`flag_${i}`] = true
    const unprunedState = {
      ...VALID,
      flags: overLimitFlags,
      mana: { type: 'number', value: 150, min: 0, max: 100 },
    }
    const { req, res } = fakeExchange({ sessionId: 's1', state: unprunedState })
    await host.route()!.handler(req, res)

    expect(res.statusCode).toBe(200)
    const writes = host.appended.filter((entry) => entry.type === 'user/message')
    expect(writes).toHaveLength(1)
    const writtenState = (writes[0]?.data as { source: { rrp: { worldState: any } } }).source.rrp.worldState
    // Flags must be capped to 16
    expect(Object.keys(writtenState.flags)).toHaveLength(16)
    // Value must be clamped to max 100
    expect(writtenState.mana).toEqual({ type: 'number', value: 100, min: 0, max: 100 })
  })
})

