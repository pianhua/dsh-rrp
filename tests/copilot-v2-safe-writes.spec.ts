import { describe, expect, it } from 'vitest'
import { registerCopilotRoute, forgetCopilot } from '../src/copilot.ts'
import { rrpPayloadOf } from '../src/state-payload.ts'
import { forgetState } from '../src/state-publisher.ts'
import { emptyWorldState, WORLD_STATE_KEY, type WorldState } from '../src/world-state.ts'

function state(): WorldState {
  return {
    ...emptyWorldState(),
    globalFields: { weather: { type: 'string', value: '晴', definition: 'undeclared' } },
  }
}

function storageDomain() {
  const records = new Map<string, unknown>()
  const table = {
    get: (key: string) => records.get(key),
    put: async (key: string, value: unknown) => records.set(key, structuredClone(value)),
    update: async (key: string, fn: (value: never) => never) => {
      const next = fn(structuredClone(records.get(key)) as never)
      records.set(key, structuredClone(next))
      return next
    },
    delete: async (key: string) => records.delete(key),
  }
  return { records, open: async () => ({ table: () => table, close: async () => {} }) }
}

function host(reply: string) {
  let current = state()
  const appended: Array<{ type: string; data: unknown }> = []
  const session = {
    id: 'copilot-v2',
    append(type: string, data: unknown) {
      appended.push({ type, data })
      const payload = rrpPayloadOf({ type, data })
      if (payload?.worldState !== undefined) current = payload.worldState
      return {}
    },
  }
  const routes = new Map<string, { handler: (req: unknown, res: unknown) => Promise<void> }>()
  const projections = {
    stateOf: (_session: unknown, key: string) => {
      if (key === WORLD_STATE_KEY) return current
      if (key === 'agentPreset') return 'rp'
      return undefined
    },
  }
  const storage = storageDomain()
  const ctx = {
    effect: (fn: () => (() => void) | void) => fn(),
    get: (name: string) =>
      ({
        webServer: {
          register(definition: {
            path: string
            handler: (req: unknown, res: unknown) => Promise<void>
          }) {
            routes.set(definition.path, definition)
            return () => {}
          },
        },
        sessions: { get: (id: string) => (id === session.id ? session : undefined) },
        sessionProjections: projections,
        llm: {
          stream: () =>
            (async function* () {
              yield { type: 'text-delta', text: reply }
            })(),
        },
        agents: { get: () => ({ options: { provider: 'p', model: 'm' } }) },
        storageDomain: storage,
      })[name],
  }
  return { ctx, routes, appended, state: () => current }
}

function exchange(method: string, body?: unknown, url?: string) {
  const req = {
    method,
    url,
    on() {},
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield JSON.stringify(body)
    },
  }
  const response = {
    statusCode: 0,
    chunks: [] as string[],
    setHeader() {},
    write(chunk: string) {
      this.chunks.push(chunk)
    },
    end(body?: string) {
      if (body !== undefined) this.chunks.push(body)
    },
  }
  return { req, response }
}

describe('Copilot v2 safe writes', () => {
  it('stages model actions and writes only after explicit confirmation', async () => {
    forgetState('copilot-v2')
    forgetCopilot('copilot-v2')
    const reply =
      '已拟定。\n```rrp-action\n{"actions":[{"type":"update_world_state","patch":{"globalFields":{"weather":{"type":"string","value":"暴雨","definition":"undeclared"}}},"reason":"玩家要求"}]}\n```'
    const testHost = host(reply)
    registerCopilotRoute(testHost.ctx as never)

    const ask = exchange('POST', { sessionId: 'copilot-v2', message: '把天气改成暴雨' })
    await testHost.routes.get('/dsh-rrp/copilot')!.handler(ask.req, ask.response)
    expect(testHost.appended).toHaveLength(0)

    const history = exchange('GET', undefined, '/dsh-rrp/copilot?sessionId=copilot-v2')
    await testHost.routes.get('/dsh-rrp/copilot')!.handler(history.req, history.response)
    const view = JSON.parse(history.response.chunks[0]!) as {
      worldStateProposals: Array<{ id: string }>
    }
    expect(view.worldStateProposals).toHaveLength(1)

    const confirm = exchange('POST', {
      sessionId: 'copilot-v2',
      action: 'confirm',
      id: view.worldStateProposals[0]!.id,
    })
    await testHost.routes.get('/dsh-rrp/copilot/proposals')!.handler(confirm.req, confirm.response)
    expect(confirm.response.statusCode).toBe(200)
    expect(testHost.state().globalFields.weather?.value).toBe('暴雨')
    expect(testHost.appended).toHaveLength(1)
    expect(rrpPayloadOf(testHost.appended[0])?.worldStateTimelineBatch).toMatchObject({
      provenance: { actor: 'copilot' },
    })

    const undo = exchange('POST', { sessionId: 'copilot-v2' })
    await testHost.routes.get('/dsh-rrp/copilot/undo')!.handler(undo.req, undo.response)
    expect(undo.response.statusCode).toBe(200)
    expect(testHost.state().globalFields.weather?.value).toBe('晴')
    expect(testHost.appended).toHaveLength(2)
    expect(rrpPayloadOf(testHost.appended[1])?.worldStateTimelineBatch).toMatchObject({
      provenance: { actor: 'copilot', evidence: 'undo' },
    })
  })
})
