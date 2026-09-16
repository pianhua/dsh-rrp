import { describe, expect, it } from 'vitest'
import { registerStartRoute } from '../src/start.ts'
import { emptyWorldState } from '../src/world-state.ts'

const STATE = { ...emptyWorldState(), scene: { location: '平民公寓 · 门口' } }
const OPENING = '周末的清晨……'

/** Minimal fake host: records appended events and the registered route. */
function fakeHost(options: { failAssistant?: boolean } = {}) {
  const appended: Array<{ type: string; data: unknown; intent?: unknown }> = []
  const session = {
    id: 's1',
    append(type: string, data: unknown, intent?: unknown) {
      if (options.failAssistant === true && type === 'assistant/message') throw new Error('rejected')
      appended.push({ type, data, intent })
      return {}
    },
  }
  const sessions = { get: (id: string) => (id === 's1' ? session : undefined) }
  const agents = { get: () => ({ options: { provider: 'deepseek', model: 'deepseek-chat' } }) }
  const sessionProjections = {
    stateOf: (_session: unknown, key: string) => (key === 'turnBoundary' ? { lastTurn: 0 } : undefined),
  }
  let route: { handler: (req: unknown, res: unknown) => unknown } | undefined
  const webServer = { register: (definition: { handler: (req: unknown, res: unknown) => unknown }) => { route = definition; return () => {} } }
  const ctx = {
    effect: (fn: () => (() => void) | void) => fn(),
    get: (name: string) => ({ webServer, sessions, agents, sessionProjections } as Record<string, unknown>)[name],
  }
  return { ctx, appended, route: () => route }
}

/** Minimal req/res pair over a JSON body. */
function exchange(body: unknown, method = 'POST') {
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

describe('card start route', () => {
  it('writes the initial state and appends the opening as an assistant message', async () => {
    const host = fakeHost()
    registerStartRoute(host.ctx as never)
    const { req, res } = exchange({ sessionId: 's1', state: STATE, opening: OPENING })
    await host.route()!.handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(host.appended.map((entry) => entry.type)).toEqual(['rrp/world-state', 'rrp/activity', 'assistant/message'])
    expect(host.appended[0]?.data).toEqual(STATE)
    expect((host.appended[1]?.data as { actor: string }).actor).toBe('card')
    const data = host.appended[2]?.data as { message: { role: string; content: Array<{ text: string }> } }
    expect(data.message.role).toBe('assistant')
    expect(data.message.content[0]?.text).toBe(OPENING)
    expect(host.appended[2]?.intent).toEqual({ surfaceOp: 'append' })
  })

  it('falls back to a plugin notice when the assistant shape is rejected', async () => {
    const host = fakeHost({ failAssistant: true })
    registerStartRoute(host.ctx as never)
    const { req, res } = exchange({ sessionId: 's1', opening: OPENING })
    await host.route()!.handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(host.appended.map((entry) => entry.type)).toEqual(['user/message'])
    const data = host.appended[0]?.data as { message: { source: { kind: string; form?: string } } }
    expect(data.message.source.kind).toBe('plugin')
    expect(data.message.source.form).toBe('notice')
  })

  it('rejects an invalid state and an unknown session', async () => {
    const host = fakeHost()
    registerStartRoute(host.ctx as never)

    const bad = exchange({ sessionId: 's1', state: { scene: { location: 7 } } })
    await host.route()!.handler(bad.req, bad.res)
    expect(bad.res.statusCode).toBe(400)

    const missing = exchange({ sessionId: 'nope', opening: OPENING })
    await host.route()!.handler(missing.req, missing.res)
    expect(missing.res.statusCode).toBe(404)
  })

  it('writes the active card setting first', async () => {
    const host = fakeHost()
    registerStartRoute(host.ctx as never)
    const { req, res } = exchange({
      sessionId: 's1',
      card: { id: 'c1', name: '测试卡', persona: 'P', worldCore: 'W' },
      opening: OPENING,
    })
    await host.route()!.handler(req, res)
    expect(res.statusCode).toBe(200)
    expect(host.appended[0]?.type).toBe('rrp/card')
    expect(host.appended[0]?.data).toEqual({ id: 'c1', name: '测试卡', persona: 'P', worldCore: 'W' })
  })
})

