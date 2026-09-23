import { describe, expect, it } from 'vitest'
import { registerActivityRoute } from '../src/activity-route.ts'
import { DEFAULT_JSON_BODY_LIMIT } from '../src/host-faces.ts'
import { registerCardsRoute } from '../src/cards-route.ts'
import { registerCopilotRoute } from '../src/copilot.ts'
import { registerCorrectionRoute } from '../src/correction.ts'
import { registerLoreRoute } from '../src/lore-route.ts'
import { registerStartRoute } from '../src/start.ts'
import {
  COPILOT_SSE,
  RRP_ROUTES,
  drainSse,
  encodeSseFrame,
  isTerminalCopilotEvent,
  type RrpErrorBody,
} from '../src/route-contract.ts'

/** Minimal host: records every registered path and serves a JSON exchange. */
function fakeHost(preset = 'rp-demo') {
  const registered: string[] = []
  const session = { id: 's1', header: { agentPreset: preset }, append: () => ({}) }
  const sessions = { get: (id: string) => (id === 's1' ? session : undefined) }
  const projections = {
    stateOf: (_s: unknown, key: string) => (key === 'agentPreset' ? preset : undefined),
  }
  const webServer = {
    register: (route: {
      path: string
      handler: (req: unknown, res: unknown) => void | Promise<void>
    }) => {
      registered.push(route.path)
      handlers.set(route.path, route.handler)
      return () => {}
    },
  }
  const handlers = new Map<string, (req: unknown, res: unknown) => void | Promise<void>>()
  const ctx = {
    effect: (fn: () => (() => void) | void) => fn(),
    get: (name: string) =>
      (
        ({
          webServer,
          sessions,
          sessionProjections: projections,
          agents: { get: () => undefined },
          llm: { stream: () => [] },
          jobs: { start: () => 'j1' },
        }) as Record<string, unknown>
      )[name],
  }
  return { ctx, registered, handlers }
}

/** Drive one route with a JSON body (or a bare GET/DELETE url). */
async function call(
  host: ReturnType<typeof fakeHost>,
  path: string,
  init: { method: string; body?: unknown; url?: string } = { method: 'GET' },
) {
  const req =
    init.body !== undefined
      ? {
          method: init.method,
          url: init.url,
          async *[Symbol.asyncIterator]() {
            yield JSON.stringify(init.body)
          },
        }
      : { method: init.method, url: init.url }
  const chunks: string[] = []
  const res = {
    statusCode: 0,
    setHeader: () => {},
    write: (s: string) => {
      chunks.push(s)
      return true
    },
    end: (s?: string) => {
      if (s !== undefined) chunks.push(s)
    },
  }
  await host.handlers.get(path)!(req, res)
  return { res, text: chunks.join('') }
}

describe('route contract (issue #22)', () => {
  it('every host route registers exactly the contracted path', async () => {
    const host = fakeHost()
    registerCardsRoute(host.ctx as never)
    registerActivityRoute(host.ctx as never)
    registerCorrectionRoute(host.ctx as never)
    registerLoreRoute(host.ctx as never)
    registerStartRoute(host.ctx as never)
    registerCopilotRoute(host.ctx as never)
    expect([...host.registered].sort()).toEqual(
      [
        RRP_ROUTES.activity,
        RRP_ROUTES.cardImport,
        RRP_ROUTES.cardOne,
        RRP_ROUTES.cards,
        RRP_ROUTES.copilot,
        RRP_ROUTES.copilotProposals,
        RRP_ROUTES.copilotUndo,
        RRP_ROUTES.lore,
        RRP_ROUTES.start,
        RRP_ROUTES.worldState,
      ].sort(),
    )
  })

  it('every non-2xx response carries the contracted RrpErrorBody shape', async () => {
    const host = fakeHost()
    registerCorrectionRoute(host.ctx as never)
    registerActivityRoute(host.ctx as never)
    registerCardsRoute(host.ctx as never)

    const cases: Array<{ path: string; init: { method: string; body?: unknown; url?: string } }> = [
      // 405: wrong method on a POST-only route.
      { path: RRP_ROUTES.worldState, init: { method: 'GET' } },
      // 400: unparseable body.
      { path: RRP_ROUTES.worldState, init: { method: 'POST', url: undefined } },
      // 400: missing sessionId.
      {
        path: RRP_ROUTES.activity,
        init: { method: 'GET', url: 'http://localhost' + RRP_ROUTES.activity },
      },
      // 400: missing card id.
      {
        path: RRP_ROUTES.cardOne,
        init: { method: 'GET', url: 'http://localhost' + RRP_ROUTES.cardOne },
      },
    ]
    const bad = await call(host, RRP_ROUTES.worldState, { method: 'POST' })
    expect(bad.res.statusCode).toBe(400)
    for (const one of cases) {
      const res = await call(host, one.path, one.init)
      expect(res.res.statusCode, one.path + ' ' + one.init.method).toBeGreaterThanOrEqual(400)
      const body = JSON.parse(res.text) as RrpErrorBody
      expect(typeof body.error, one.path).toBe('string')
    }
  })

  it('rejects an oversized correction body before any session lookup', async () => {
    const host = fakeHost()
    registerCorrectionRoute(host.ctx as never)
    const body = '{"sessionId":"s1","state":"' + 'x'.repeat(DEFAULT_JSON_BODY_LIMIT) + '"}'
    let lookedUp = false
    const original = host.ctx.get
    host.ctx.get = (name: string) => {
      const face = original(name)
      if (name === 'sessions') {
        return {
          get: () => {
            lookedUp = true
            return undefined
          },
        }
      }
      return face
    }
    const req = {
      method: 'POST',
      async *[Symbol.asyncIterator]() {
        yield body
      },
    }
    const chunks: string[] = []
    const res = {
      statusCode: 0,
      setHeader: () => {},
      end: (text?: string) => {
        if (text !== undefined) chunks.push(text)
      },
    }
    await host.handlers.get(RRP_ROUTES.worldState)!(req, res)
    expect(res.statusCode).toBe(413)
    expect(JSON.parse(chunks.join(''))).toEqual({ error: 'request body too large' })
    expect(lookedUp).toBe(false)
  })

  it('404 on an unknown session is a contract error body too', async () => {
    const host = fakeHost()
    registerCopilotRoute(host.ctx as never)
    const res = await call(host, RRP_ROUTES.copilot, {
      method: 'GET',
      url: 'http://localhost' + RRP_ROUTES.copilot + '?sessionId=nope',
    })
    expect(res.res.statusCode).toBe(404)
    expect(typeof (JSON.parse(res.text) as RrpErrorBody).error).toBe('string')
  })

  it('SSE codec round-trips a full turn: chunks, action, terminal done', () => {
    const wire =
      encodeSseFrame(COPILOT_SSE.chunk, { text: '你' }) +
      encodeSseFrame(COPILOT_SSE.chunk, { text: '好' }) +
      encodeSseFrame(COPILOT_SSE.action, { applied: [{ kind: 'world-state', digest: 'd' }] }) +
      encodeSseFrame(COPILOT_SSE.done, {
        turn: { role: 'copilot', text: '你好', at: 't' },
        undoCount: 1,
      })
    const events: Array<{ event: string; data: unknown }> = []
    const rest = drainSse(wire, (event, data) => {
      events.push({ event, data })
    })
    expect(rest).toBe('')
    expect(events.map((entry) => entry.event)).toEqual(['chunk', 'chunk', 'action', 'done'])
    expect(
      events
        .filter((entry) => entry.event === COPILOT_SSE.chunk)
        .map((entry) => (entry.data as { text: string }).text)
        .join(''),
    ).toBe('你好')
  })

  it('a frame split across network chunks is held until complete', () => {
    const wire = encodeSseFrame(COPILOT_SSE.chunk, { text: 'x' })
    const half = wire.slice(0, wire.length - 3)
    const tail = wire.slice(wire.length - 3)
    const seen: string[] = []
    const rest = drainSse(half, (event) => {
      seen.push(event)
    })
    expect(seen).toEqual([])
    drainSse(rest + tail, (event) => {
      seen.push(event)
    })
    expect(seen).toEqual([COPILOT_SSE.chunk])
  })

  it('malformed frames are skipped without sinking the stream', () => {
    const broken = 'event: chunk\ndata: {not json\n\n'
    const missing = 'data: {"text":"y"}\n\n'
    const good = encodeSseFrame(COPILOT_SSE.done, {
      turn: { role: 'copilot', text: '', at: 't' },
      undoCount: 0,
    })
    const seen: Array<{ event: string; data: unknown }> = []
    const rest = drainSse(broken + missing + good, (event, data) => {
      seen.push({ event, data })
    })
    expect(rest).toBe('')
    expect(seen.map((entry) => entry.event)).toEqual([COPILOT_SSE.done])
  })

  it('termination semantics: exactly done or error end the stream', () => {
    expect(isTerminalCopilotEvent(COPILOT_SSE.done)).toBe(true)
    expect(isTerminalCopilotEvent(COPILOT_SSE.error)).toBe(true)
    expect(isTerminalCopilotEvent(COPILOT_SSE.chunk)).toBe(false)
    expect(isTerminalCopilotEvent(COPILOT_SSE.action)).toBe(false)
  })
})
