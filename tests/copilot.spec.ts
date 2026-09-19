import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildCopilotPrompt, COPILOT_SYSTEM_PROMPT, parseCopilotActions } from '../src/agents/copilot.ts'
import { readActivity } from '../src/activity.ts'
import { forgetState } from '../src/state-publisher.ts'
import { rrpPayloadOf } from '../src/state-payload.ts'
import { emptyWorldState, WORLD_STATE_KEY, type WorldState } from '../src/world-state.ts'
import { mergeWorldStatePatch, registerCopilotRoute, setCopilotDirForTesting, forgetCopilot } from '../src/copilot.ts'
import { hasLoreDraft } from '../src/lore-route.ts'

let copilotDir: string

beforeAll(() => {
  copilotDir = mkdtempSync(join(tmpdir(), 'rrp-copilot-'))
  setCopilotDirForTesting(copilotDir)
})

afterAll(() => {
  rmSync(copilotDir, { recursive: true, force: true })
})

describe('copilot agent (prompt + action parsing)', () => {
  it('assembles context blocks with the question last', () => {
    const prompt = buildCopilotPrompt({
      question: '米娅现在穿什么？',
      card: '【卡包设定】',
      worldState: 'characters: 米娅',
      summary: '',
      lore: '',
      transcript: '第 1 轮正文',
    })
    expect(prompt.indexOf('【卡包设定】')).toBeLessThan(prompt.indexOf('【世界状态】'))
    expect(prompt.indexOf('【剧情记录】')).toBeLessThan(prompt.indexOf('【玩家】'))
    expect(prompt.trim().endsWith('米娅现在穿什么？')).toBe(true)
    expect(prompt).toContain('（剧情脉络未开启或尚未产出）')
  })

  it('parses a fenced action block and skips malformed entries', () => {
    const reply = '好的。\n\n```rrp-action\n{"actions":[{"type":"update_world_state","patch":{"scene":{"weather":"大雨"}},"reason":"应玩家要求"},{"type":"draft_lore","draft":{"name":"inn-rule","description":"d","body":"b"}},{"type":"bogus"},{"type":"update_world_state"}]}\n```'
    const actions = parseCopilotActions(reply)
    expect(actions).toHaveLength(2)
    expect(actions[0]).toMatchObject({ type: 'update_world_state', patch: { scene: { weather: '大雨' } } })
    expect(actions[1]).toMatchObject({ type: 'draft_lore', draft: { name: 'inn-rule' } })
  })

  it('returns no actions for pure Q&A or an invalid block', () => {
    expect(parseCopilotActions('老剑客是前朝影卫，直接回答即可。')).toEqual([])
    expect(parseCopilotActions('```rrp-action\n{not json}\n```')).toEqual([])
    expect(parseCopilotActions('```rrp-action\n{"noactions":true}\n```')).toEqual([])
  })

  // DEF-03 re-verification: models append extra closing braces to long blocks.
  it('tolerates extra trailing closing braces in the action block', () => {
    const reply = '好的。\n\n```rrp-action\n{"actions":[{"type":"update_world_state","patch":{"scene":{"weather":"大雨"}},"reason":"应玩家要求"}}]}}\n```'
    const actions = parseCopilotActions(reply)
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({ type: 'update_world_state', patch: { scene: { weather: '大雨' } } })
  })

  // DEF-03 re-verification: a block cut mid-stream still salvages its actions.
  it('salvages a truncated action block instead of dropping it', () => {
    const reply = '好的。\n\n```rrp-action\n{"actions":[{"type":"update_world_state","patch":{"scene":{"weather":"大雨"}},"reason":"应玩家要求"},{"type":"draft_lore","draft":{"name":"mia-family","description":"d","body":"b"\n```'
    const actions = parseCopilotActions(reply)
    expect(actions.length).toBeGreaterThanOrEqual(1)
    expect(actions[0]).toMatchObject({ type: 'update_world_state', patch: { scene: { weather: '大雨' } } })
  })

  it('requires a kebab-case lore name in the system prompt (DEF-03)', () => {
    expect(COPILOT_SYSTEM_PROMPT).toContain('kebab-case')
    expect(COPILOT_SYSTEM_PROMPT).toContain('严禁下划线')
  })

  it('merges patches per-name, clamps dynamic fields, and deletes null keys', () => {
    const prior: WorldState = {
      ...emptyWorldState(),
      characters: { '米娅': { affinity: 60, mood: '平静', appearance: '', condition: '' } },
      scene: { location: '客厅', time: '夜', weather: '晴' },
      sanity: { type: 'number', value: 80, min: 0, max: 100 },
    }
    const next = mergeWorldStatePatch(prior, {
      characters: { '米娅': { affinity: 80 } },
      scene: { weather: '大雨' },
      sanity: { type: 'number', value: 150, min: 0, max: 100 },
      flags: { '获得钥匙': true },
    })
    expect(next.characters['米娅']?.affinity).toBe(80)
    expect(next.characters['米娅']?.mood).toBe('平静')
    expect(next.scene.weather).toBe('大雨')
    expect(next.scene.location).toBe('客厅')
    expect((next.sanity as { value: number }).value).toBe(100)
    expect(next.flags['获得钥匙']).toBe(true)

    const deleted = mergeWorldStatePatch(next, { flags: { '获得钥匙': null }, sanity: null })
    expect(deleted.flags['获得钥匙']).toBeUndefined()
    expect(deleted.sanity).toBeUndefined()

    expect(() => mergeWorldStatePatch(prior, { scene: 'oops' as unknown as Record<string, unknown> })).toThrow()
    expect(() => mergeWorldStatePatch(prior, { bogus: { noType: true } as unknown as Record<string, unknown> })).toThrow()
  })
})

/** Fake host: two route slots (main + undo), foldable projections, canned LLM. */
function fakeHost(opts?: { id?: string; agentPreset?: string; reply?: string; failAppend?: boolean }) {
  const id = opts?.id ?? 's1'
  let state: WorldState = { ...emptyWorldState(), scene: { location: '客厅' } }
  const appended: Array<{ type: string; data: unknown }> = []
  const session = {
    id,
    append(type: string, data: unknown) {
      if (opts?.failAppend === true) throw new Error('append failed')
      appended.push({ type, data })
      const worldState = rrpPayloadOf({ type, data })?.worldState
      if (worldState !== undefined) state = worldState as WorldState
      return {}
    },
  }
  const sessions = {
    get: (sid: string) => (sid === id ? session : undefined),
  }
  const projections = {
    stateOf: (_session: unknown, key: string) => {
      if (key === WORLD_STATE_KEY) return state
      if (key === 'agentPreset') return opts?.agentPreset ?? 'rp'
      return undefined
    },
  }
  const llm = {
    stream: (_options: Record<string, unknown>) => (async function* () {
      yield { type: 'text-delta', text: opts?.reply ?? '好的，已调整。' }
    })(),
  }
  const agents = { get: () => ({ options: { provider: 'p', model: 'm' } }) }
  const routes = new Map<string, { handler: (req: unknown, res: unknown) => unknown }>()
  const webServer = {
    register: (definition: { path: string; handler: (req: unknown, res: unknown) => unknown }) => {
      routes.set(definition.path, definition)
      return () => {}
    },
  }
  const ctx = {
    effect: (fn: () => (() => void) | void) => fn(),
    get: (name: string) => ({ webServer, sessions, sessionProjections: projections, llm, agents } as Record<string, unknown>)[name],
  }
  return { ctx, routes, appended, stateOf: () => state, id }
}

function exchange(method: string, path: string, body?: unknown) {
  const req = {
    method,
    url: path,
    on() {},
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield JSON.stringify(body)
    },
  }
  const res: {
    statusCode: number
    chunks: string[]
    header: Record<string, string>
    setHeader(name: string, value: string): void
    write(chunk: string): void
    end(body?: string): void
    events: Array<{ event: string; data: unknown }>
  } = {
    statusCode: 0,
    chunks: [],
    header: {},
    events: [],
    setHeader(name: string, value: string) { this.header[name] = value },
    write(chunk: string) { this.chunks.push(chunk) },
    end(body?: string) { if (body !== undefined) this.chunks.push(body) },
  }
  return { req, res }
}

/** Replay the collected SSE frames. */
function sseEvents(res: { chunks: string[] }): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = []
  let buffer = ''
  for (const chunk of res.chunks) {
    buffer += chunk
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      let event = ''
      let data = ''
      for (const line of frame.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7)
        if (line.startsWith('data: ')) data = line.slice(6)
      }
      if (event.length > 0 && data.length > 0) events.push({ event, data: JSON.parse(data) as unknown })
    }
  }
  return events
}

describe('copilot route', () => {
  it('streams a Q&A turn end to end without touching the session log', async () => {
    forgetState('s1'); forgetCopilot('s1')
    const host = fakeHost({ reply: '老剑客的真实身份是前朝影卫。' })
    registerCopilotRoute(host.ctx as never)
    const { req, res } = exchange('POST', '/dsh-rrp/copilot', { sessionId: 's1', message: '老剑客是谁？' })
    await host.routes.get('/dsh-rrp/copilot')!.handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.header['content-type']).toContain('text/event-stream')
    const events = sseEvents(res)
    expect(events.some((entry) => entry.event === 'chunk')).toBe(true)
    const done = events.find((entry) => entry.event === 'done')?.data as { turn: { text: string }; undoCount: number }
    expect(done.turn.text).toContain('前朝影卫')
    expect(done.undoCount).toBe(0)
    // Pure Q&A appends nothing to the session log.
    expect(host.appended).toHaveLength(0)
  })

  it('executes update_world_state, records the undo snapshot, and undo restores it', async () => {
    forgetState('s-undo'); forgetCopilot('s-undo')
    const reply = '好的。\n```rrp-action\n{"actions":[{"type":"update_world_state","patch":{"scene":{"weather":"大雨"},"characters":{"米娅":{"affinity":80,"mood":"","appearance":"","condition":""}}},"reason":"应要求调整"}]}\n```'
    const host = fakeHost({ id: 's-undo', reply })
    registerCopilotRoute(host.ctx as never)

    const ask = exchange('POST', '/dsh-rrp/copilot', { sessionId: 's-undo', message: '把天气改成大雨，米娅好感 80' })
    await host.routes.get('/dsh-rrp/copilot')!.handler(ask.req, ask.res)
    expect(host.stateOf().scene.weather).toBe('大雨')
    expect(host.stateOf().characters['米娅']?.affinity).toBe(80)

    const done = sseEvents(ask.res).find((entry) => entry.event === 'done')?.data as { undoCount: number }
    expect(done.undoCount).toBe(1)
    const activity = readActivity('s-undo')
    expect(activity.entries.some((entry) => entry.actor === 'copilot' && entry.phase === 'corrected')).toBe(true)

    // Undo = one revert publish; values roll back, the ledger keeps both records.
    const undo = exchange('POST', '/dsh-rrp/copilot/undo', { sessionId: 's-undo' })
    await host.routes.get('/dsh-rrp/copilot/undo')!.handler(undo.req, undo.res)
    expect(undo.res.statusCode).toBe(200)
    expect(host.stateOf().scene.weather).toBeUndefined()
    expect(host.stateOf().characters['米娅']).toBeUndefined()
    expect(readActivity('s-undo').entries.some((entry) => entry.detailKey === 'detail.copilotUndone')).toBe(true)
  })

  it('stages draft_lore for player confirmation instead of writing it', async () => {
    forgetState('s-lore'); forgetCopilot('s-lore')
    const reply = '已整理。\n```rrp-action\n{"actions":[{"type":"draft_lore","draft":{"name":"inn-rule","description":"客栈规矩","body":"# 规矩\\n入夜落栓。"}}]}\n```'
    const host = fakeHost({ id: 's-lore', reply })
    registerCopilotRoute(host.ctx as never)
    const { req, res } = exchange('POST', '/dsh-rrp/copilot', { sessionId: 's-lore', message: '把客栈规矩整理成设定集' })
    await host.routes.get('/dsh-rrp/copilot')!.handler(req, res)
    expect(hasLoreDraft('s-lore')).toBe(true)
    // Staging is not a session-log write.
    expect(host.appended).toHaveLength(0)
  })

  it('guards non-RP sessions on every method and reports unknown sessions', async () => {
    forgetState('s1'); forgetCopilot('s1')
    const host = fakeHost({ agentPreset: 'assistant' })
    registerCopilotRoute(host.ctx as never)

    const get = exchange('GET', '/dsh-rrp/copilot?sessionId=s1')
    await host.routes.get('/dsh-rrp/copilot')!.handler(get.req, get.res)
    expect(get.res.statusCode).toBe(403)

    const post = exchange('POST', '/dsh-rrp/copilot', { sessionId: 's1', message: 'hi' })
    await host.routes.get('/dsh-rrp/copilot')!.handler(post.req, post.res)
    expect(post.res.statusCode).toBe(403)

    const undo = exchange('POST', '/dsh-rrp/copilot/undo', { sessionId: 's1' })
    await host.routes.get('/dsh-rrp/copilot/undo')!.handler(undo.req, undo.res)
    expect(undo.res.statusCode).toBe(403)

    const missing = exchange('GET', '/dsh-rrp/copilot?sessionId=nope')
    await host.routes.get('/dsh-rrp/copilot')!.handler(missing.req, missing.res)
    expect(missing.res.statusCode).toBe(404)
  })

  it('persists history, serves it via GET, and clears it on DELETE', async () => {
    forgetState('s-history'); forgetCopilot('s-history')
    const host = fakeHost({ id: 's-history', reply: '答。' })
    registerCopilotRoute(host.ctx as never)
    const ask = exchange('POST', '/dsh-rrp/copilot', { sessionId: 's-history', message: '问题一' })
    await host.routes.get('/dsh-rrp/copilot')!.handler(ask.req, ask.res)

    const get = exchange('GET', '/dsh-rrp/copilot?sessionId=s-history')
    await host.routes.get('/dsh-rrp/copilot')!.handler(get.req, get.res)
    expect(get.res.statusCode).toBe(200)
    const body = JSON.parse((get.res as { chunks: string[] }).chunks[0] ?? '{}') as { turns: Array<{ role: string }>; undoCount: number }
    expect(body.turns.map((turn) => turn.role)).toEqual(['player', 'copilot'])
    expect(body.undoCount).toBe(0)

    const del = exchange('DELETE', '/dsh-rrp/copilot?sessionId=s-history')
    await host.routes.get('/dsh-rrp/copilot')!.handler(del.req, del.res)
    expect(del.res.statusCode).toBe(200)

    const after = exchange('GET', '/dsh-rrp/copilot?sessionId=s-history')
    await host.routes.get('/dsh-rrp/copilot')!.handler(after.req, after.res)
    const cleared = JSON.parse((after.res as { chunks: string[] }).chunks[0] ?? '{}') as { turns: Array<{ role: string }> }
    expect(cleared.turns).toEqual([])
  })
})
