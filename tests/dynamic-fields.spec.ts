/**
 * D5 end-to-end lifecycle for dynamic fields, through the real module chain:
 *
 *   turn/end -> Chronicler job -> publishState (user/message.source.rrp)
 *     -> worldStateProjection.apply (the host fold) -> WorldStateView
 *
 * plus the player-correction write path (POST /dsh-rrp/world-state) which the
 * panel uses for the same fields. Creation, update (with constraint clamping)
 * and deletion are all exercised against folded projection state, not just the
 * reply parser.
 */
import { describe, expect, it } from 'vitest'
import { registerChronicler } from '../src/chronicler.ts'
import { registerCorrectionRoute } from '../src/correction.ts'
import { worldStateProjection } from '../src/projection/world-state.ts'
import { forgetActivity } from '../src/activity.ts'
import { forgetState } from '../src/state-publisher.ts'
import { transcriptProjections } from './stubs/transcript-projections.ts'
import {
  WORLD_STATE_KEY,
  emptyWorldState,
  getDynamicKeys,
  renderWorldState,
  type WorldState,
} from '../src/world-state.ts'

const BASE = {
  characters: { 毓忻: { affinity: 3, mood: '警惕' } },
  scene: { location: '归离客栈' },
  flags: {},
  inventory: {},
}

/** Minimal fake host whose projection folds appended state events for real. */
function fakeHost(options: { reply: () => unknown } = { reply: () => BASE }) {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  let folded: WorldState = emptyWorldState()
  const appended: Array<{ type: string; data: unknown }> = []
  let started:
    | {
        kind: string
        label: string
        run(): { cancel(reason?: string): void; done: Promise<{ status: string }> }
      }
    | undefined

  // The fixed prose tail the Chronicler reads through the transcript slice.
  const proseSeed = [
    { type: 'user/message', data: { content: [{ type: 'text', text: '我推门而入。' }] } },
    {
      type: 'assistant/message',
      data: { content: [{ type: 'text', text: '门轴低吟，暖意扑面。' }] },
    },
    { type: 'step/end', data: { turn: 1, step: 0 } },
  ]

  const session = {
    id: 'dyn-session',
    append(type: string, data: unknown) {
      appended.push({ type, data })
      // Fold every appended event exactly like the host projection registry.
      folded = worldStateProjection.apply(folded, { type, data })
      return { type, data }
    },
  }

  const llm = {
    async *stream() {
      yield { type: 'text-delta', text: JSON.stringify(options.reply()) }
    },
  }
  const jobs = {
    attachController: () => () => {},
    start(spec: typeof started) {
      started = spec
      return 'chronicler-1'
    },
  }
  const agents = { get: () => ({ options: { provider: 'deepseek', model: 'deepseek-chat' } }) }
  const projections = transcriptProjections(proseSeed, (_session: unknown, key: string) =>
    key === 'agentPreset' ? 'rp' : key === WORLD_STATE_KEY ? folded : undefined,
  )
  const ctx = {
    effect(fn: () => (() => void) | void) {
      return fn()
    },
    get(name: string): unknown {
      return ({ llm, jobs, agents, sessionProjections: projections } as Record<string, unknown>)[
        name
      ]
    },
    on(name: string, listener: (...args: unknown[]) => void) {
      listeners.set(name, listener)
      return () => {}
    },
  }
  return {
    ctx,
    session,
    listeners,
    appended,
    started: () => started,
    /** The projection state after folding everything the job appended. */
    folded: () => folded,
    runTurn: async (): Promise<{ status: string }> => {
      listeners.get('session/event')?.(session, {
        type: 'turn/end',
        data: { reason: { kind: 'completed' } },
      })
      const spec = started
      if (spec === undefined) throw new Error('no chronicler job started')
      return spec.run().done
    },
  }
}

describe('D5 dynamic-field lifecycle (end to end)', () => {
  it('creates a field: Chronicler reply -> publish -> fold -> view', async () => {
    forgetState('dyn-session')
    forgetActivity('dyn-session')
    const host = fakeHost({
      reply: () => ({
        ...BASE,
        stamina: 80,
        createFields: [{ id: 'stamina', type: 'number', value: 80, min: 0, max: 100 }],
      }),
    })
    registerChronicler(host.ctx as never, 'rp')

    const outcome = await host.runTurn()
    expect(outcome.status).toBe('completed')

    // The durable write carries the normalized DynamicFieldValue shape.
    const written = host.appended.find((entry) => entry.type === 'user/message')
    const state = (written?.data as { source: { rrp: { worldState: WorldState } } }).source.rrp
      .worldState
    expect(state.stamina).toEqual({ type: 'number', value: 80, min: 0, max: 100 })

    // The folded projection exposes it as a dynamic field...
    const folded = host.folded()
    expect(getDynamicKeys(folded)).toEqual(['stamina'])
    // ...and the Author baseline renders it.
    expect(renderWorldState(folded)).toContain('stamina: 80')
  })

  it('updates a field and clamps to its constraints', async () => {
    forgetState('dyn-session')
    forgetActivity('dyn-session')
    const prior: WorldState = {
      ...emptyWorldState(),
      ...BASE,
      stamina: { type: 'number', value: 80, min: 0, max: 100 },
    }
    const host = fakeHost({ reply: () => ({ ...BASE, stamina: 150 }) })
    // Seed the projection with the prior state as if an earlier turn wrote it.
    host.session.append('user/message', {
      content: [{ type: 'text', text: '【世界状态 · 事实基准】' }],
      source: { kind: 'plugin', plugin: 'dsh-rrp', rrp: { worldState: prior } },
    })
    host.appended.length = 0
    registerChronicler(host.ctx as never, 'rp')

    const outcome = await host.runTurn()
    expect(outcome.status).toBe('completed')

    const folded = host.folded()
    expect(folded.stamina).toEqual({ type: 'number', value: 100, min: 0, max: 100 })
    expect(renderWorldState(folded)).toContain('stamina: 100')
  })

  it('deletes a field when the Chronicler omits it from the new state', async () => {
    forgetState('dyn-session')
    forgetActivity('dyn-session')
    const prior: WorldState = {
      ...emptyWorldState(),
      ...BASE,
      stamina: { type: 'number', value: 100, min: 0, max: 100 },
    }
    const host = fakeHost({ reply: () => ({ ...BASE }) })
    host.session.append('user/message', {
      content: [{ type: 'text', text: '【世界状态 · 事实基准】' }],
      source: { kind: 'plugin', plugin: 'dsh-rrp', rrp: { worldState: prior } },
    })
    host.appended.length = 0
    registerChronicler(host.ctx as never, 'rp')

    const outcome = await host.runTurn()
    expect(outcome.status).toBe('completed')
    expect(getDynamicKeys(host.folded())).toEqual([])
  })
})

describe('D5 dynamic fields through player correction', () => {
  function correctionHost() {
    let route: { handler: (req: unknown, res: unknown) => unknown } | undefined
    let folded: WorldState = emptyWorldState()
    const appended: Array<{ type: string; data: unknown }> = []
    const session = {
      id: 'dyn-session',
      append(type: string, data: unknown) {
        appended.push({ type, data })
        folded = worldStateProjection.apply(folded, { type, data })
        return { type, data }
      },
    }
    const sessions = { get: (id: string) => (id === session.id ? session : undefined) }
    const projections = {
      stateOf: (_s: unknown, key: string) => (key === WORLD_STATE_KEY ? folded : undefined),
    }
    const webServer = {
      register: (definition: { handler: (req: unknown, res: unknown) => unknown }) => {
        route = definition
        return () => {}
      },
    }
    const ctx = {
      effect: (fn: () => (() => void) | void) => fn(),
      get: (name: string) =>
        (({ webServer, sessions, sessionProjections: projections }) as Record<string, unknown>)[
          name
        ],
    }
    return {
      ctx,
      route: () => route,
      appended,
      folded: () => folded,
    }
  }

  function post(state: unknown) {
    const req = {
      method: 'POST',
      url: '/dsh-rrp/world-state',
      async *[Symbol.asyncIterator]() {
        yield JSON.stringify({ sessionId: 'dyn-session', state })
      },
    }
    const res = {
      statusCode: 0,
      payload: undefined as unknown,
      setHeader() {},
      end(text?: string) {
        this.payload = text === undefined ? undefined : (JSON.parse(text) as unknown)
      },
    }
    return { req, res }
  }

  it('writes a corrected field and clamps it through pruneWorldState', async () => {
    forgetState('dyn-session')
    forgetActivity('dyn-session')
    const host = correctionHost()
    registerCorrectionRoute(host.ctx as never)

    const corrected = {
      ...emptyWorldState(),
      ...BASE,
      stamina: { type: 'number', value: 250, min: 0, max: 100 },
    }
    const exchange = post(corrected)
    await host.route()!.handler(exchange.req, exchange.res)
    expect(exchange.res.statusCode).toBe(200)

    expect(host.folded().stamina).toEqual({ type: 'number', value: 100, min: 0, max: 100 })
  })

  it('rejects a malformed dynamic field instead of writing it', async () => {
    forgetState('dyn-session')
    forgetActivity('dyn-session')
    const host = correctionHost()
    registerCorrectionRoute(host.ctx as never)

    const bad = {
      ...emptyWorldState(),
      ...BASE,
      stamina: { type: 'number', value: 80, min: 'not-a-number' },
    }
    const exchange = post(bad)
    await host.route()!.handler(exchange.req, exchange.res)
    expect(exchange.res.statusCode).toBe(400)
    expect(host.appended).toHaveLength(0)
  })
})
