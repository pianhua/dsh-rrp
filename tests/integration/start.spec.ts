import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { interpolateCardText } from '../../src/cards/card-types.ts'
import { forgetActivity } from '../../src/publish/activity.ts'
import { forgetState } from '../../src/publish/state-publisher.ts'
import { appendOpeningInStep, registerStartRoute } from '../../src/host/start.ts'
import { buildOpeningFactsMessages } from '../../src/publish/state-publisher.ts'
import type { StartPending } from '../../src/host/start-pending.ts'
import { emptyWorldState } from '../../src/world-state/world-state.ts'
import type { ProjectionsService } from '../../src/host/host-faces.ts'
import { routeOf } from '../../src/host/host-faces.ts'

const STATE = {
  ...emptyWorldState(),
  trackedObjects: {
    scene: {
      id: 'scene',
      kind: 'scene' as const,
      name: '平民公寓 · 门口',
      fields: {},
    },
  },
}
const OPENING = '周末的清晨……'

/** In-memory pending store standing in for the storage-domain handle. */
function fakePending() {
  const map = new Map<string, StartPending>()
  return {
    peek: (id: string) => map.get(id),
    async save(id: string, value: StartPending) {
      map.set(id, value)
    },
    clear(id: string) {
      map.delete(id)
    },
    async close() {},
  }
}

/** Minimal fake host: records appended events and the registered route. */
function fakeHost(
  options: {
    failAssistant?: boolean
    failState?: boolean
    preset?: string
    headerPreset?: string
  } = {},
) {
  const appended: Array<{ type: string; data: unknown; intent?: unknown }> = []
  const session = {
    id: 's1',
    header: options.headerPreset === undefined ? undefined : { agentPreset: options.headerPreset },
    append(type: string, data: unknown, intent?: unknown) {
      if (options.failState === true && type === 'user/message') throw new Error('state rejected')
      if (options.failAssistant === true && type === 'assistant/message')
        throw new Error('rejected')
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
  const webServer = {
    register: (definition: { handler: (req: unknown, res: unknown) => unknown }) => {
      route = definition
      return () => {}
    },
  }
  const ctx = {
    effect: (fn: () => (() => void) | void) => fn(),
    get: (name: string) =>
      (({ webServer, sessions, agents, sessionProjections }) as Record<string, unknown>)[name],
  }
  const pending = fakePending()
  return {
    ctx,
    session,
    appended,
    pending,
    projections: sessionProjections as unknown as ProjectionsService,
    agents,
    route: () => route,
  }
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
    setHeader(name: string, value: string) {
      this.header[name] = value
    },
    end(_payload?: string) {},
  }
  return { req, res }
}

/** Structured payload of an appended context message. */
const payloadOf = (data: unknown) =>
  (data as { source?: { rrp?: Record<string, unknown> } }).source?.rrp

describe('card start route（懒开局 ADR 0028）', () => {
  it('writes nothing to the log; defers the payload and materializes it inside the first turn', async () => {
    forgetState('s1')
    forgetActivity('s1')
    const host = fakeHost()
    registerStartRoute(host.ctx as never, host.pending)
    const { req, res } = exchange({ sessionId: 's1', state: STATE, opening: OPENING })
    await host.route()!.handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(host.appended).toEqual([])
    const value = host.pending.peek('s1')
    expect(value?.state).toEqual(STATE)
    expect(value?.baseline).toEqual({
      kind: 'baseline',
      snapshot: 'initial-state',
      provenance: expect.objectContaining({ actor: 'initial-state' }),
      origin: 'local',
    })
    expect(value?.opening).toBe(OPENING)

    // First turn: the facts message rides the agent/pre-step decision (the
    // loop appends it right after the protected head, before the player's
    // message); the opening is appended inside the same still-open step.
    const built = buildOpeningFactsMessages(
      host.session as never,
      host.projections as never,
      value!,
    )
    expect(built).toHaveLength(1)
    for (const message of built) {
      host.session.append('user/message', message, { surfaceOp: 'append' })
    }
    expect(host.appended.map((entry) => entry.type)).toEqual(['user/message'])
    expect(payloadOf(host.appended[0]?.data)?.worldState).toEqual(STATE)
    expect(payloadOf(host.appended[0]?.data)?.worldStateTimelineBatch).toEqual({
      kind: 'baseline',
      snapshot: 'initial-state',
      provenance: expect.objectContaining({ actor: 'initial-state' }),
      origin: 'local',
    })

    const form = appendOpeningInStep(
      host.session as never,
      OPENING,
      routeOf(host.agents, 's1'),
      1,
      1,
    )
    expect(form).toBe('assistant')
    expect(host.appended.map((entry) => entry.type)).toEqual(['user/message', 'assistant/message'])
    const data = host.appended[1]?.data as {
      turn: number
      step: number
      message: { role: string; content: Array<{ text: string }> }
      stream: unknown[]
    }
    // The opening rides the loop's first turn, step 1 — the only position that
    // satisfies the v4 relationships (ADR 0028).
    expect(data.turn).toBe(1)
    expect(data.step).toBe(1)
    expect(data.message.role).toBe('assistant')
    expect(data.message.content[0]?.text).toBe(OPENING)
    expect(data.stream).toEqual([])
    expect(host.appended[1]?.intent).toEqual({ surfaceOp: 'append' })
  })

  it('falls back to a plugin notice when the assistant shape is rejected', async () => {
    forgetState('s1')
    forgetActivity('s1')
    const host = fakeHost({ failAssistant: true })
    registerStartRoute(host.ctx as never, host.pending)
    const { req, res } = exchange({ sessionId: 's1', opening: OPENING })
    await host.route()!.handler(req, res)
    expect(res.statusCode).toBe(200)

    const form = appendOpeningInStep(
      host.session as never,
      OPENING,
      routeOf(host.agents, 's1'),
      1,
      1,
    )
    expect(form).toBe('notice')
    expect(host.appended.map((entry) => entry.type)).toEqual(['user/message'])
    // user/message data IS the UserMessage.
    const data = host.appended[0]?.data as { source: { kind: string; form?: string } }
    expect(data.source.kind).toBe('rrp')
    expect(data.source.form).toBe('notice')
  })

  it('rejects an invalid state and an unknown session', async () => {
    forgetState('s1')
    forgetActivity('s1')
    const host = fakeHost()
    registerStartRoute(host.ctx as never, host.pending)

    const badState = exchange({ sessionId: 's1', state: { nope: true } })
    await host.route()!.handler(badState.req, badState.res)
    expect(badState.res.statusCode).toBe(400)
    expect(host.pending.peek('s1')).toBeUndefined()

    const unknown = exchange({ sessionId: 'nope', state: STATE })
    await host.route()!.handler(unknown.req, unknown.res)
    expect(unknown.res.statusCode).toBe(404)
    expect(host.pending.peek('s1')).toBeUndefined()
  })

  it('rejects a non-canonical card id before publishing it', async () => {
    forgetState('s1')
    forgetActivity('s1')
    const host = fakeHost({ preset: 'rp-demo-card' })
    registerStartRoute(host.ctx as never, host.pending)
    const { req, res } = exchange({
      sessionId: 's1',
      card: { id: '../escape', name: 'Escape' },
    })
    await host.route()!.handler(req, res)
    expect(res.statusCode).toBe(400)
    expect(host.pending.peek('s1')).toBeUndefined()
  })

  it('rejects a card that does not match the Session preset', async () => {
    forgetState('s1')
    forgetActivity('s1')
    const host = fakeHost({ preset: 'rp-other-card' })
    registerStartRoute(host.ctx as never, host.pending)
    const { req, res } = exchange({
      sessionId: 's1',
      card: { id: 'c1', name: '测试卡', persona: 'P', worldCore: 'W' },
    })
    await host.route()!.handler(req, res)
    expect(res.statusCode).toBe(400)
    expect(host.pending.peek('s1')).toBeUndefined()
  })

  it('publishes the active card setting at materialize time', async () => {
    forgetState('s1')
    forgetActivity('s1')
    const host = fakeHost({ preset: 'rp-c1' })
    registerStartRoute(host.ctx as never, host.pending)
    const { req, res } = exchange({
      sessionId: 's1',
      card: { id: 'c1', name: '测试卡', persona: 'P', worldCore: 'W' },
      opening: OPENING,
    })
    await host.route()!.handler(req, res)
    expect(res.statusCode).toBe(200)

    const built = buildOpeningFactsMessages(
      host.session as never,
      host.projections as never,
      host.pending.peek('s1')!,
    )
    for (const message of built) {
      host.session.append('user/message', message, { surfaceOp: 'append' })
    }
    const facts = host.appended.find((entry) => payloadOf(entry.data)?.card !== undefined)
    expect(payloadOf(facts?.data)?.card).toEqual({
      id: 'c1',
      name: '测试卡',
      persona: 'P',
      worldCore: 'W',
    })
  })

  it('interpolates the per-run player-name override into the opening at materialize time (issue #25)', async () => {
    forgetState('s1')
    forgetActivity('s1')
    const host = fakeHost({ preset: 'rp-c1' })
    registerStartRoute(host.ctx as never, host.pending)
    const { req, res } = exchange({
      sessionId: 's1',
      card: {
        id: 'c1',
        name: '测试卡',
        persona: 'P',
        worldCore: 'W',
        player: { name: '林小满', description: '独行旅人' },
      },
      opening: '{{player.name}}推开阁楼的门，{{player.description}}般的沉默。',
    })
    await host.route()!.handler(req, res)
    expect(res.statusCode).toBe(200)
    // The pending card context carries the effective (overridden) player.
    expect(host.pending.peek('s1')?.card).toEqual({
      id: 'c1',
      name: '测试卡',
      persona: 'P',
      worldCore: 'W',
      player: { name: '林小满', description: '独行旅人' },
    })
    // The pending opening stays a RAW template; the materializer interpolates
    // it (interpolateCardText) when arming the append.
    expect(host.pending.peek('s1')?.opening).toBe(
      '{{player.name}}推开阁楼的门，{{player.description}}般的沉默。',
    )
    const interpolated = interpolateCardText(
      host.pending.peek('s1')!.opening!.trim(),
      host.pending.peek('s1')!.card?.player,
    )
    appendOpeningInStep(host.session as never, interpolated, routeOf(host.agents, 's1'), 1, 1)
    const data = host.appended.find((entry) => entry.type === 'assistant/message')?.data as {
      message: { content: Array<{ text: string }> }
    }
    expect(data.message.content[0]?.text).toBe('林小满推开阁楼的门，独行旅人般的沉默。')
  })

  it('requires a selected card preset even when the immutable header is blank or stale', async () => {
    const missing = fakeHost({ headerPreset: 'rp-demo-card' })
    registerStartRoute(missing.ctx as never, missing.pending)
    const noProjection = exchange({
      sessionId: 's1',
      card: { id: 'demo-card', name: 'Demo', persona: '', worldCore: '' },
    })
    await missing.route()!.handler(noProjection.req, noProjection.res)
    expect(noProjection.res.statusCode).toBe(400)
    expect(missing.appended).toEqual([])

    const selected = fakeHost({ preset: 'rp-demo-card', headerPreset: 'rp-other-card' })
    registerStartRoute(selected.ctx as never, selected.pending)
    const currentProjection = exchange({
      sessionId: 's1',
      card: { id: 'demo-card', name: 'Demo', persona: '', worldCore: '' },
    })
    await selected.route()!.handler(currentProjection.req, currentProjection.res)
    expect(currentProjection.res.statusCode).toBe(200)
  })

  it('hydrates protected card initial state when the browser sends a filtered snapshot', async () => {
    const previousHome = process.env.DSH_HOME
    const home = mkdtempSync(join(tmpdir(), 'dsh-rrp-start-hidden-'))
    try {
      process.env.DSH_HOME = home
      const card = join(home, '.dsh-rrp', 'cards', 'secret-card')
      mkdirSync(card, { recursive: true })
      writeFileSync(card + '/card.md', '---\nid: secret-card\nname: 秘密卡\n---\n\n公开核心')
      writeFileSync(
        card + '/state.json',
        JSON.stringify({
          version: 2,
          trackedObjects: {},
          globalFields: {
            secret: {
              type: 'string',
              value: '隐藏初始状态',
              definition: 'card-defined',
              visibility: 'hidden',
            },
          },
          objectives: [],
          conflicts: [],
          cognition: [],
          relations: [],
          currentEvents: [],
        }),
      )
      const host = fakeHost({ preset: 'rp-secret-card' })
      registerStartRoute(host.ctx as never, host.pending)
      const { req, res } = exchange({
        sessionId: 's1',
        card: { id: 'secret-card', name: '秘密卡', persona: '', worldCore: '' },
        state: emptyWorldState(),
      })
      await host.route()!.handler(req, res)
      expect(res.statusCode).toBe(200)
      const built = buildOpeningFactsMessages(
        host.session as never,
        host.projections as never,
        host.pending.peek('s1')!,
      )
      for (const message of built) {
        host.session.append('user/message', message, { surfaceOp: 'append' })
      }
      const stateMessage = host.appended.find(
        (entry) => payloadOf(entry.data)?.worldState !== undefined,
      )
      expect(payloadOf(stateMessage?.data)?.worldState).toMatchObject({
        globalFields: { secret: { value: '隐藏初始状态' } },
      })
    } finally {
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('reports failure when the pending payload cannot be saved', async () => {
    forgetState('s1')
    forgetActivity('s1')
    const host = fakeHost()
    const failingPending = {
      ...host.pending,
      async save(): Promise<void> {
        throw new Error('storage full')
      },
    }
    registerStartRoute(host.ctx as never, failingPending)
    const { req, res } = exchange({ sessionId: 's1', state: STATE, opening: OPENING })
    await host.route()!.handler(req, res)
    expect(res.statusCode).toBe(500)
    expect(host.appended).toEqual([])
  })
})
