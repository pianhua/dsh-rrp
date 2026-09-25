import { describe, expect, it } from 'vitest'
import { registerCorrectionRoute } from '../src/correction.ts'
import { readActivity, forgetActivity } from '../src/activity.ts'
import { forgetState } from '../src/state-publisher.ts'
import { rrpPayloadOf } from '../src/state-payload.ts'
import { emptyWorldState, type WorldState } from '../src/world-state.ts'
import { emptyWorldStateTimeline, type WorldStateTimeline } from '../src/world-state-timeline.ts'

function validState(): WorldState {
  return {
    ...emptyWorldState(),
    trackedObjects: {
      mia: {
        id: 'mia',
        kind: 'character',
        name: '米娅',
        character: { presence: 'present' },
        fields: {},
      },
    },
  }
}

function fakeHost(
  initial: WorldState = validState(),
  failAppend = false,
  timeline: WorldStateTimeline = emptyWorldStateTimeline(),
) {
  let current = initial
  const appended: Array<{ type: string; data: unknown }> = []
  const session = {
    id: 's1',
    append(type: string, data: unknown) {
      if (failAppend) throw new Error('append failed')
      appended.push({ type, data })
      const payload = rrpPayloadOf({ type, data })
      if (payload?.worldState !== undefined) current = payload.worldState
      return {}
    },
  }
  let route: { handler: (req: unknown, res: unknown) => Promise<void> } | undefined
  const projections = {
    stateOf: (_session: unknown, key: string) => {
      if (key === 'rrpWorldState') return current
      if (key === 'rrpWorldStateTimeline') return timeline
      if (key === 'agentPreset') return 'rp'
      return undefined
    },
  }
  const webServer = {
    register: (definition: { handler: (req: unknown, res: unknown) => Promise<void> }) => {
      route = definition
      return () => {}
    },
  }
  const ctx = {
    effect(fn: () => (() => void) | void) {
      return fn()
    },
    get: (name: string) =>
      ({
        webServer,
        sessions: { get: (id: string) => (id === 's1' ? session : undefined) },
        sessionProjections: projections,
      })[name],
  }
  return { ctx, appended, route: () => route, state: () => current }
}

function exchange(body: unknown) {
  const req = {
    method: 'POST',
    async *[Symbol.asyncIterator]() {
      yield JSON.stringify(body)
    },
  }
  const res = {
    statusCode: 0,
    body: '',
    setHeader() {},
    end(payload?: string) {
      this.body = payload ?? ''
    },
  }
  return { req, res }
}

describe('player correction route', () => {
  it('previews and then publishes a complete v2 snapshot with player provenance', async () => {
    forgetState('s1')
    forgetActivity('s1')
    const host = fakeHost()
    registerCorrectionRoute(host.ctx as never)
    const next = validState()
    next.trackedObjects.mia!.character = { presence: 'present', affinity: 80 }

    const preview = exchange({ sessionId: 's1', state: next, preview: true })
    await host.route()!.handler(preview.req, preview.res)
    expect(preview.res.statusCode).toBe(200)
    expect(JSON.parse(preview.res.body)).toMatchObject({ ok: true, preview: true })
    expect(host.appended).toHaveLength(0)

    const save = exchange({ sessionId: 's1', state: next, evidence: '玩家修正好感' })
    await host.route()!.handler(save.req, save.res)
    expect(save.res.statusCode).toBe(200)
    expect(host.appended).toHaveLength(1)
    expect(rrpPayloadOf(host.appended[0])?.worldState).toEqual(next)
    expect(rrpPayloadOf(host.appended[0])?.worldStateTimelineBatch).toMatchObject({
      provenance: { actor: 'player', evidence: '玩家修正好感' },
    })
    expect(readActivity('s1').entries[0]?.actor).toBe('player')
  })

  it('returns unchanged without appending a no-op save', async () => {
    forgetState('s1')
    forgetActivity('s1')
    const host = fakeHost()
    registerCorrectionRoute(host.ctx as never)
    const { req, res } = exchange({ sessionId: 's1', state: validState() })
    await host.route()!.handler(req, res)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({ ok: true, unchanged: true })
    expect(host.appended).toHaveLength(0)
    expect(readActivity('s1').entries).toHaveLength(0)
  })

  it('rejects hidden content and reference-unsafe deletion', async () => {
    const initial = validState()
    initial.globalFields.secret = {
      type: 'string',
      value: '秘密',
      definition: 'undeclared',
      visibility: 'hidden',
    }
    const host = fakeHost(initial)
    registerCorrectionRoute(host.ctx as never)
    const hidden = structuredClone(initial)
    hidden.globalFields.secret!.value = '改写秘密'
    const hiddenExchange = exchange({ sessionId: 's1', state: hidden })
    await host.route()!.handler(hiddenExchange.req, hiddenExchange.res)
    expect(hiddenExchange.res.statusCode).toBe(403)

    const withReference = validState()
    withReference.objectives = [
      {
        id: 'goal',
        owners: [{ objectId: 'mia' }],
        desiredOutcome: '留在客栈',
        status: 'active',
      },
    ]
    const referencedHost = fakeHost(withReference)
    registerCorrectionRoute(referencedHost.ctx as never)
    const deleted = structuredClone(withReference)
    delete deleted.trackedObjects.mia
    const blocked = exchange({ sessionId: 's1', state: deleted })
    await referencedHost.route()!.handler(blocked.req, blocked.res)
    expect(blocked.res.statusCode).toBe(409)
    expect(JSON.parse(blocked.res.body)).toMatchObject({ details: { objectId: 'mia' } })

    const confirmed = exchange({
      sessionId: 's1',
      state: deleted,
      confirmDeleteIds: ['mia'],
    })
    await referencedHost.route()!.handler(confirmed.req, confirmed.res)
    expect(confirmed.res.statusCode).toBe(200)
    expect(referencedHost.appended).toHaveLength(1)
  })

  it('rejects an invalid state and unknown session', async () => {
    const host = fakeHost()
    registerCorrectionRoute(host.ctx as never)
    const invalid = exchange({ sessionId: 's1', state: { version: 1 } })
    await host.route()!.handler(invalid.req, invalid.res)
    expect(invalid.res.statusCode).toBe(400)
    const missing = exchange({ sessionId: 'nope', state: validState() })
    await host.route()!.handler(missing.req, missing.res)
    expect(missing.res.statusCode).toBe(404)
  })

  it('marks a player batch local even when inherited timeline history exists', async () => {
    const inherited: WorldStateTimeline = {
      version: 1,
      batches: [
        {
          kind: 'baseline',
          snapshot: 'initial-state',
          provenance: { actor: 'initial-state', at: 'unknown' },
          origin: 'inherited',
        },
      ],
    }
    const host = fakeHost(validState(), false, inherited)
    registerCorrectionRoute(host.ctx as never)
    const next = validState()
    next.trackedObjects.mia!.character = { presence: 'absent' }
    const { req, res } = exchange({ sessionId: 's1', state: next })
    await host.route()!.handler(req, res)
    expect(res.statusCode).toBe(200)
    const payload = rrpPayloadOf(host.appended[0])
    expect(payload?.worldStateTimelineBatch).toMatchObject({ origin: 'local' })
  })

  it('reports append failure without recording activity', async () => {
    forgetState('s1')
    forgetActivity('s1')
    const host = fakeHost(validState(), true)
    registerCorrectionRoute(host.ctx as never)
    const next = validState()
    next.trackedObjects.mia!.character = { presence: 'absent' }
    const { req, res } = exchange({ sessionId: 's1', state: next })
    await host.route()!.handler(req, res)
    expect(res.statusCode).toBe(500)
    expect(readActivity('s1').entries).toHaveLength(0)
  })
})
