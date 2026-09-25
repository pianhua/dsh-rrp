import { describe, expect, it } from 'vitest'
import { registerCorrectionRoute } from '../src/correction.ts'
import { forgetState } from '../src/state-publisher.ts'
import { emptyWorldState, type WorldState } from '../src/world-state.ts'
import { rrpPayloadOf } from '../src/state-payload.ts'

function state(): WorldState {
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

function host(initial: WorldState) {
  let current = initial
  const appended: Array<{ type: string; data: unknown }> = []
  const session = {
    id: 's1',
    append(type: string, data: unknown) {
      appended.push({ type, data })
      const payload = rrpPayloadOf({ type, data })
      if (payload?.worldState !== undefined) current = payload.worldState
      return {}
    },
  }
  let handler: ((req: unknown, res: unknown) => Promise<void>) | undefined
  const projections = {
    stateOf: (_session: unknown, key: string) => {
      if (key === 'rrpWorldState') return current
      if (key === 'agentPreset') return 'rp'
      return undefined
    },
  }
  const ctx = {
    effect: (fn: () => (() => void) | void) => fn(),
    get: (name: string) =>
      ({
        webServer: {
          register(definition: { handler: (req: unknown, res: unknown) => Promise<void> }) {
            handler = definition.handler
            return () => {}
          },
        },
        sessions: { get: (id: string) => (id === 's1' ? session : undefined) },
        sessionProjections: projections,
      })[name],
  }
  return {
    ctx,
    get handler() {
      return handler
    },
    appended,
    state: () => current,
  }
}

function exchange(body: unknown) {
  const req = {
    method: 'POST',
    async *[Symbol.asyncIterator]() {
      yield JSON.stringify(body)
    },
  }
  const response = {
    statusCode: 0,
    body: '',
    setHeader() {},
    end(body?: string) {
      this.body = body ?? ''
    },
  }
  return { req, response }
}

describe('player correction v2 route', () => {
  it('previews a diff and then appends one full snapshot with player provenance', async () => {
    forgetState('s1')
    const initial = state()
    const next = structuredClone(initial)
    next.trackedObjects.mia!.character = { presence: 'present', affinity: 80 }
    const testHost = host(initial)
    registerCorrectionRoute(testHost.ctx as never)

    const preview = exchange({ sessionId: 's1', state: next, preview: true })
    await testHost.handler!(preview.req, preview.response)
    expect(preview.response.statusCode).toBe(200)
    expect(JSON.parse(preview.response.body)).toMatchObject({ ok: true, preview: true })
    expect(testHost.appended).toHaveLength(0)

    const save = exchange({ sessionId: 's1', state: next, evidence: '玩家修正好感' })
    await testHost.handler!(save.req, save.response)
    expect(save.response.statusCode).toBe(200)
    expect(testHost.appended).toHaveLength(1)
    const payload = rrpPayloadOf(testHost.appended[0])!
    expect(payload.worldState).toEqual(next)
    expect(payload.worldStateTimelineBatch).toMatchObject({
      kind: 'changes',
      provenance: { actor: 'player', evidence: '玩家修正好感' },
    })
  })

  it('does not append a no-op save', async () => {
    forgetState('s1')
    const initial = state()
    const testHost = host(initial)
    registerCorrectionRoute(testHost.ctx as never)
    const save = exchange({ sessionId: 's1', state: initial })
    await testHost.handler!(save.req, save.response)
    expect(save.response.statusCode).toBe(200)
    expect(JSON.parse(save.response.body)).toMatchObject({ ok: true, unchanged: true })
    expect(testHost.appended).toHaveLength(0)
  })
})
