import { describe, expect, it } from 'vitest'
import {
  extractRecallRounds,
  forgetAllRecall,
  forgetRecall,
  recallCooldownsOf,
  recallScopeOf,
  setRecallCooldowns,
} from '../src/recall.ts'
import { registerRecallRoute } from '../src/recall-route.ts'
import { RRP_ROUTES } from '../src/route-contract.ts'

function userMessage(text: string, extra: Record<string, unknown> = {}) {
  return {
    type: 'user/message',
    seq: 1,
    data: { content: [{ type: 'text', text }], ...extra },
  }
}

function assistantMessage(text: string, extra: Record<string, unknown> = {}) {
  return {
    type: 'assistant/message',
    seq: 2,
    data: { content: [{ type: 'text', text }], ...extra },
  }
}

describe('recall rounds extraction (issue #38)', () => {
  it('extracts turns and associates player input with author prose', () => {
    const rounds = extractRecallRounds([
      // Opening prose before player input
      assistantMessage('很久以前，风雪交加的边境城堡里亮着微光。'),
      // Turn 1
      userMessage('我推开沉重的木门。'),
      // WorldState event (should be ignored)
      {
        type: 'user/message',
        seq: 3,
        data: {
          source: { kind: 'plugin:dsh-rrp', rrp: { worldState: { scene: {} } } },
          content: [{ type: 'text', text: 'state write' }],
        },
      },
      assistantMessage('门轴发出刺耳的嘎吱声，吧台前的人纷纷转头。'),
      // Turn 2
      userMessage('我走向吧台，向酒保要一杯热麦酒。'),
      assistantMessage('酒保擦着木杯，递过来一碗腾腾冒着热气的麦酒。'),
    ])

    expect(rounds).toHaveLength(3)
    expect(rounds[0]).toEqual({
      turn: 0,
      player: '',
      prose: '很久以前，风雪交加的边境城堡里亮着微光。',
    })
    expect(rounds[1]).toEqual({
      turn: 1,
      player: '我推开沉重的木门。',
      prose: '门轴发出刺耳的嘎吱声，吧台前的人纷纷转头。',
    })
    expect(rounds[2]).toEqual({
      turn: 2,
      player: '我走向吧台，向酒保要一杯热麦酒。',
      prose: '酒保擦着木杯，递过来一碗腾腾冒着热气的麦酒。',
    })
  })

  it('skips host reminders and plugin notices', () => {
    const rounds = extractRecallRounds([
      {
        type: 'user/message',
        seq: 1,
        data: {
          content: [{ type: 'text', text: '<system-reminder>请按照角色卡设定回答' }],
        },
      },
      {
        type: 'user/message',
        seq: 2,
        data: {
          source: { kind: 'plugin:dsh-rrp' },
          content: [{ type: 'text', text: '开局准备完成' }],
        },
      },
      userMessage('你好。'),
      assistantMessage('幸会。'),
    ])

    expect(rounds).toHaveLength(1)
    expect(rounds[0]).toEqual({
      turn: 0,
      player: '你好。',
      prose: '幸会。',
    })
  })
})

describe('recall route & tool (issue #38)', () => {
  function fakeHost(events: unknown[], isRp = true) {
    let closes = 0
    const persistence = {
      open: async (id: string, access: string) => {
        if (id === 'missing') throw new Error('not found')
        if (access !== 'read') throw new Error('read only')
        return {
          read: async () => ({ events: events as never[] }),
          close: async () => {
            closes += 1
          },
        }
      },
    }
    const handlers = new Map<string, (req: unknown, res: unknown) => void | Promise<void>>()
    const webServer = {
      register: (route: {
        path: string
        handler: (req: unknown, res: unknown) => void | Promise<void>
      }) => {
        handlers.set(route.path, route.handler)
        return () => {}
      },
    }
    const registeredTools = new Map<string, unknown>()
    const tools = {
      register: (tool: { name: string }) => {
        registeredTools.set(tool.name, tool)
        return () => registeredTools.delete(tool.name)
      },
    }
    const sessions = {
      get: (id: string) => (id === 's1' ? { id: 's1' } : undefined),
    }
    const projections = {
      stateOf: (_session: unknown, key: string) => {
        if (key === 'agentPreset') return isRp ? 'rp' : 'other'
        return undefined
      },
    }
    const ctx = {
      effect: (fn: () => (() => void) | void) => fn(),
      get: (name: string) =>
        (({
          webServer,
          sessionPersistence: persistence,
          sessions,
          sessionProjections: projections,
          tools,
        }) as Record<string, unknown>)[name],
    }
    return { ctx, handlers, registeredTools, closes: () => closes }
  }

  async function postRecall(
    host: ReturnType<typeof fakeHost>,
    body: Record<string, unknown>,
    method = 'POST',
  ) {
    const payload = JSON.stringify(body)
    const req = {
      method,
      url: RRP_ROUTES.recall,
      async *[Symbol.asyncIterator]() {
        yield payload
      },
    }
    const headers: Record<string, string> = {}
    let status = 200
    let responseBody = ''
    const res = {
      get statusCode() {
        return status
      },
      set statusCode(value: number) {
        status = value
      },
      setHeader: (name: string, value: string) => {
        headers[name] = value
      },
      end: (chunk?: string) => {
        if (chunk !== undefined) responseBody += chunk
      },
    }
    await host.handlers.get(RRP_ROUTES.recall)!(req, res)
    return {
      status,
      headers,
      json: responseBody.length > 0 ? JSON.parse(responseBody) : null,
    }
  }

  it('handles route errors: 405, 400, 404, 403', async () => {
    const host = fakeHost([])
    registerRecallRoute(host.ctx as never)

    // Method not allowed
    const r1 = await postRecall(host, { sessionId: 's1', query: 'test' }, 'GET')
    expect(r1.status).toBe(405)

    // Missing sessionId
    const r2 = await postRecall(host, { query: 'test' })
    expect(r2.status).toBe(400)

    // Unknown session
    const r3 = await postRecall(host, { sessionId: 'unknown', query: 'test' })
    expect(r3.status).toBe(404)

    // Non-RP session
    const hostNonRp = fakeHost([], false)
    registerRecallRoute(hostNonRp.ctx as never)
    const r4 = await postRecall(hostNonRp, { sessionId: 's1', query: 'test' })
    expect(r4.status).toBe(403)

    // Invalid parameters (neither query nor turn)
    const r5 = await postRecall(host, { sessionId: 's1' })
    expect(r5.status).toBe(400)
  })

  it('searches history keywords and returns formatted matches', async () => {
    const events = [
      userMessage('我们立下关于蓝宝石的誓言。'),
      assistantMessage('林澄郑重收下蓝宝石，承诺绝不泄露这个秘密。'),
      userMessage('今天天气不错。'),
      assistantMessage('阳光洒在街道上。'),
    ]
    const host = fakeHost(events)
    registerRecallRoute(host.ctx as never)

    const res = await postRecall(host, { sessionId: 's1', query: '蓝宝石' })
    expect(res.status).toBe(200)
    expect(res.json.ok).toBe(true)
    expect(res.json.mode).toBe('search')
    expect(res.json.found).toBe(true)
    expect(res.json.matches).toHaveLength(1)
    expect(res.json.matches[0].turn).toBe(0)
    expect(res.json.rendered).toContain('【历史回忆资料】')
    expect(res.json.rendered).toContain('蓝宝石')
    expect(host.closes()).toBe(1)
  })

  it('reads deep turn prose with radius and sets cooldown', async () => {
    const events = [
      userMessage('第一轮问候'),
      assistantMessage('第一轮回答'),
      userMessage('第二轮秘密交换：密令是夜莺'),
      assistantMessage('第二轮回答：夜莺鸣叫时行动'),
      userMessage('第三轮前行'),
      assistantMessage('第三轮回答'),
    ]
    const host = fakeHost(events)
    registerRecallRoute(host.ctx as never)

    const res = await postRecall(host, { sessionId: 's1', turn: 1, radius: 0 })
    expect(res.status).toBe(200)
    expect(res.json.ok).toBe(true)
    expect(res.json.mode).toBe('read')
    expect(res.json.found).toBe(true)
    expect(res.json.rounds).toHaveLength(1)
    expect(res.json.rounds[0].turn).toBe(1)
    expect(res.json.rendered).toContain('夜莺')

    // Second call for the same turn hits cooldown
    const res2 = await postRecall(host, { sessionId: 's1', turn: 1, radius: 0 })
    expect(res2.status).toBe(200)
    expect(res2.json.notice).toContain('冷却期')
  })

  it('registers tool rrp_recall_history on host tools service', async () => {
    const events = [
      userMessage('钥匙藏在老树下'),
      assistantMessage('记下了，老树下有铜钥匙'),
    ]
    const host = fakeHost(events)
    registerRecallRoute(host.ctx as never)

    expect(host.registeredTools.has('rrp_recall_history')).toBe(true)
    const tool = host.registeredTools.get('rrp_recall_history') as {
      execute: (args: unknown, exec: unknown) => Promise<unknown>
    }
    const result = (await tool.execute(
      { query: '铜钥匙' },
      { agent: { session: { id: 's1' } } },
    )) as { report: string }
    expect(result.report).toContain('铜钥匙')
  })

  it('cleans session memory on forgetRecall and forgetAllRecall', () => {
    recallScopeOf('s99').calls = 5
    setRecallCooldowns('s99', [{ turn: 1, hash: 'h', atTurn: 2 }])
    expect(recallCooldownsOf('s99')).toHaveLength(1)

    forgetRecall('s99')
    expect(recallCooldownsOf('s99')).toHaveLength(0)
    expect(recallScopeOf('s99').calls).toBe(0)

    recallScopeOf('s100').calls = 3
    forgetAllRecall()
    expect(recallScopeOf('s100').calls).toBe(0)
  })
})
