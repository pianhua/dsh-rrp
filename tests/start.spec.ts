import { describe, expect, it } from 'vitest'
import { forgetActivity, readActivity } from '../src/activity.ts'
import { forgetState } from '../src/state-publisher.ts'
import { registerStartRoute } from '../src/start.ts'
import { emptyWorldState } from '../src/world-state.ts'

const STATE = { ...emptyWorldState(), scene: { location: '平民公寓 · 门口' } }
const OPENING = '周末的清晨……'

/** Minimal fake host: records appended events and the registered route. */
function fakeHost(options: { failAssistant?: boolean; failState?: boolean; preset?: string; headerPreset?: string } = {}) {
  const appended: Array<{ type: string; data: unknown; intent?: unknown }> = []
  const session = {
    id: 's1',
    header: options.headerPreset === undefined ? undefined : { agentPreset: options.headerPreset },
    append(type: string, data: unknown, intent?: unknown) {
      if (options.failState === true && type === 'user/message') throw new Error('state rejected')
      if (options.failAssistant === true && type === 'assistant/message') throw new Error('rejected')
      appended.push({ type, data, intent })
      return {}
    },
  }
  const sessions = { get: (id: string) => (id === 's1' ? session : undefined) }
  const agents = { get: () => ({ options: { provider: 'deepseek', model: 'deepseek-chat' } }) }
  const sessionProjections = {
    stateOf: (_session: unknown, key: string) => {
      if (key === 'turnBoundary') return { lastTurn: 0 }
      if (key === 'agentPreset') return options.preset ?? null
      return undefined
    },
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

/** Structured payload of an appended context message. */
const payloadOf = (data: unknown) => (data as { source?: { rrp?: Record<string, unknown> } }).source?.rrp

describe('card start route', () => {
  it('publishes the initial state and appends the opening as an assistant message', async () => {
    forgetState('s1'); forgetActivity('s1')
    const host = fakeHost()
    registerStartRoute(host.ctx as never)
    const { req, res } = exchange({ sessionId: 's1', state: STATE, opening: OPENING })
    await host.route()!.handler(req, res)

    expect(res.statusCode).toBe(200)
    // Facts context first (a known user/message carrying the state in its source),
    // then the opening LAST so the live follow stream ends on it.
    expect(host.appended.map((entry) => entry.type)).toEqual(['user/message', 'assistant/message'])
    expect(payloadOf(host.appended[0]?.data)?.worldState).toEqual(STATE)

    const activity = readActivity('s1')
    expect(activity.entries.map((entry) => entry.phase)).toEqual(['committed'])
    expect(activity.entries[0]?.actor).toBe('card')

    const data = host.appended[1]?.data as { message: { role: string; content: Array<{ text: string }> } }
    expect(data.message.role).toBe('assistant')
    expect(data.message.content[0]?.text).toBe(OPENING)
    expect(host.appended[1]?.intent).toEqual({ surfaceOp: 'append' })
  })

  it('falls back to a plugin notice when the assistant shape is rejected', async () => {
    forgetState('s1'); forgetActivity('s1')
    const host = fakeHost({ failAssistant: true })
    registerStartRoute(host.ctx as never)
    const { req, res } = exchange({ sessionId: 's1', opening: OPENING })
    await host.route()!.handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(host.appended.map((entry) => entry.type)).toEqual(['user/message'])
    // user/message data IS the UserMessage.
    const data = host.appended[0]?.data as { source: { kind: string; form?: string } }
    expect(data.source.kind).toBe('plugin')
    expect(data.source.form).toBe('notice')
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

  it('rejects a non-canonical card id before publishing it', async () => {
    const host = fakeHost()
    registerStartRoute(host.ctx as never)
    const { req, res } = exchange({
      sessionId: 's1',
      card: { id: '../other-card', name: 'Bad', persona: '', worldCore: '' },
    })
    await host.route()!.handler(req, res)
    expect(res.statusCode).toBe(400)
    expect(host.appended).toEqual([])
  })

  it('rejects a card that does not match the Session preset', async () => {
    const host = fakeHost({ preset: 'rp-other-card' })
    registerStartRoute(host.ctx as never)
    const { req, res } = exchange({
      sessionId: 's1',
      card: { id: 'demo-card', name: 'Demo', persona: '', worldCore: '' },
    })
    await host.route()!.handler(req, res)
    expect(res.statusCode).toBe(400)
    expect(host.appended).toEqual([])
  })

  it('publishes the active card setting first', async () => {
    forgetState('s1'); forgetActivity('s1')
    const host = fakeHost({ preset: 'rp-c1' })
    registerStartRoute(host.ctx as never)
    const { req, res } = exchange({
      sessionId: 's1',
      card: { id: 'c1', name: '测试卡', persona: 'P', worldCore: 'W' },
      opening: OPENING,
    })
    await host.route()!.handler(req, res)
    expect(res.statusCode).toBe(200)
    expect(host.appended[0]?.type).toBe('user/message')
    expect(payloadOf(host.appended[0]?.data)?.card).toEqual({ id: 'c1', name: '测试卡', persona: 'P', worldCore: 'W' })
  })

  it('requires a selected card preset even when the immutable header is blank or stale', async () => {
    const missing = fakeHost({ headerPreset: 'rp-demo-card' })
    registerStartRoute(missing.ctx as never)
    const noProjection = exchange({
      sessionId: 's1',
      card: { id: 'demo-card', name: 'Demo', persona: '', worldCore: '' },
    })
    await missing.route()!.handler(noProjection.req, noProjection.res)
    expect(noProjection.res.statusCode).toBe(400)
    expect(missing.appended).toEqual([])

    const selected = fakeHost({ preset: 'rp-demo-card', headerPreset: 'rp-other-card' })
    registerStartRoute(selected.ctx as never)
    const currentProjection = exchange({
      sessionId: 's1',
      card: { id: 'demo-card', name: 'Demo', persona: '', worldCore: '' },
    })
    await selected.route()!.handler(currentProjection.req, currentProjection.res)
    expect(currentProjection.res.statusCode).toBe(200)
  })

  it('does not append the opening or report success when initial state fails', async () => {
    forgetState('s1'); forgetActivity('s1')
    const host = fakeHost({ failState: true })
    registerStartRoute(host.ctx as never)
    const { req, res } = exchange({ sessionId: 's1', state: STATE, opening: OPENING })
    await host.route()!.handler(req, res)
    expect(res.statusCode).toBe(500)
    expect(host.appended).toEqual([])
    expect(readActivity('s1').entries).toEqual([])
  })
})
