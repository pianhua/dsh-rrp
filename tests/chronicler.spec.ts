import { describe, expect, it } from 'vitest'
import { buildChroniclerPrompt, parseChroniclerReply } from '../src/agents/chronicler.ts'
import { forgetActivity, readActivity } from '../src/activity.ts'
import { forgetInference, registerChronicler } from '../src/chronicler.ts'
import { forgetState } from '../src/state-publisher.ts'
import { emptyWorldState } from '../src/world-state.ts'
import { transcriptProjections } from './stubs/transcript-projections.ts'

const VALID = {
  characters: { 毓忻: { affinity: 3, mood: '警惕' } },
  inventory: { 铜钥匙: { quantity: 1 } },
  scene: { location: '归离客栈' },
  flags: { 已知晓密道: true },
}

describe('Chronicler reply contract', () => {
  it('parses a bare JSON object and tolerates surrounding prose', () => {
    const expected = { state: { ...VALID, relations: [] } }
    expect(parseChroniclerReply(JSON.stringify(VALID))).toEqual(expected)
    expect(parseChroniclerReply('好的，结果如下：\n' + JSON.stringify(VALID) + '\n以上。')).toEqual(
      expected,
    )
  })

  it('rejects unusable replies', () => {
    expect(parseChroniclerReply('没有 JSON')).toBeUndefined()
    expect(parseChroniclerReply('{ not json }')).toBeUndefined()
    expect(parseChroniclerReply('{"scene":{"location":7}}')).toBeUndefined()
  })

  it('includes the prior state and transcript in the prompt', () => {
    const prompt = buildChroniclerPrompt({
      prior: emptyWorldState(),
      transcript: '【玩家】\n我推门而入。',
    })
    expect(prompt).toContain('characters')
    expect(prompt).toContain('我推门而入。')
  })

  it('automatically wraps bare scalars in dynamic fields into DynamicFieldValue format', () => {
    const replyWithScalars = JSON.stringify({
      ...VALID,
      magic_power: 45,
      reputation_rank: 'S',
      is_cursed: false,
    })
    const parsed = parseChroniclerReply(replyWithScalars)
    expect(parsed).toBeDefined()
    expect(parsed?.state.magic_power).toEqual({ type: 'number', value: 45 })
    expect(parsed?.state.reputation_rank).toEqual({ type: 'string', value: 'S' })
    expect(parsed?.state.is_cursed).toEqual({ type: 'boolean', value: false })
  })

  it('infers dynamic field type and preserves constraints from existing state', () => {
    const priorState = {
      ...emptyWorldState(),
      magic_power: { type: 'number' as const, value: 30, min: 0, max: 100 },
    }
    const reply = JSON.stringify({
      ...VALID,
      magic_power: 120, // exceeds max 100
    })
    const parsed = parseChroniclerReply(reply, priorState)
    expect(parsed).toBeDefined()
    // Constraint min: 0, max: 100 applied by pruneWorldState
    expect(parsed?.state.magic_power).toEqual({ type: 'number', value: 100, min: 0, max: 100 })
  })

  it('combines createFields constraints with top-level bare scalars', () => {
    const reply = JSON.stringify({
      ...VALID,
      stamina: 80,
      createFields: [{ id: 'stamina', type: 'number', value: 80, min: 0, max: 100 }],
    })
    const parsed = parseChroniclerReply(reply)
    expect(parsed).toBeDefined()
    expect(parsed?.state.stamina).toEqual({ type: 'number', value: 80, min: 0, max: 100 })
    expect(parsed?.createFields).toHaveLength(1)
    expect(parsed?.createFields?.[0]?.id).toBe('stamina')
  })

  it('parses relations and normalizes dirty endpoints and duplicate pairs', () => {
    const reply = JSON.stringify({
      ...VALID,
      relations: [
        { a: '我', b: '米娅（女仆长）', label: '主仆' },
        { a: '米娅', b: '玩家', label: '猜忌' },
        { a: ' ', b: 'x', label: '无效' },
      ],
    })
    const parsed = parseChroniclerReply(reply)
    expect(parsed?.state.relations).toEqual([{ a: '米娅', b: '玩家', label: '猜忌' }])
  })

  it('recovers a reply truncated mid-stream', () => {
    const full = JSON.stringify({
      ...VALID,
      flags: { 已知晓密道: true, 承诺: '护送商队抵达塞北' },
    })
    // Cut inside the last flags value: `…护送商队抵`
    const truncated = full.slice(0, -5)
    const parsed = parseChroniclerReply(truncated)
    expect(parsed).toBeDefined()
    expect(parsed?.state.characters).toEqual(VALID.characters)
    expect(parsed?.state.scene).toEqual(VALID.scene)
    expect(parsed?.state.flags).toEqual({ 已知晓密道: true })
  })
})

/** Minimal fake host: records the session feed listener and the started job. */
function fakeHost(
  preset: string,
  options: {
    failAppend?: boolean
    stateOf?: (session: unknown, key: string) => unknown
    events?: Array<{ type: string; data: unknown }>
    llm?: unknown
  } = {},
) {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const appended: Array<{ type: string; data: unknown }> = []
  let startCount = 0
  let started:
    | {
        kind: string
        label: string
        run(): { cancel(reason?: string): void; done: Promise<{ status: string }> }
      }
    | undefined

  const events = options.events ?? [
    { type: 'user/message', data: { content: [{ type: 'text', text: '我推门而入。' }] } },
    {
      type: 'assistant/message',
      data: { content: [{ type: 'text', text: '门轴低吟，暖意扑面。' }] },
    },
    { type: 'step/end', data: { turn: 1, step: 0 } },
  ]

  const session = {
    id: 'session-1',
    append(type: string, data: unknown) {
      if (options.failAppend === true) throw new Error('append failed')
      appended.push({ type, data })
      // The real host's projection drive folds every appended event, state writes included.
      events.push({ type, data })
      return { type, data }
    },
  }

  const llm = options.llm ?? {
    async *stream() {
      yield { type: 'text-delta', text: JSON.stringify(VALID) }
    },
  }
  const jobs = {
    attachController: () => () => {},
    start(spec: typeof started) {
      startCount += 1
      started = spec
      return 'chronicler-1'
    },
  }
  const agents = { get: () => ({ options: { provider: 'deepseek', model: 'deepseek-chat' } }) }
  const projections = transcriptProjections(events, (session: unknown, key: string) => {
    if (options.stateOf) return options.stateOf(session, key)
    return key === 'agentPreset' ? preset : undefined
  })

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
  return { ctx, session, listeners, appended, started: () => started, startCount: () => startCount }
}

describe('Chronicler trigger', () => {
  it('infers and publishes a complete WorldState on a completed RP turn', async () => {
    forgetState('session-1')
    forgetActivity('session-1')
    const host = fakeHost('rp')
    registerChronicler(host.ctx as never, 'rp')

    const feed = host.listeners.get('session/event')
    expect(feed).toBeDefined()
    feed?.(host.session, { type: 'turn/end', data: { reason: { kind: 'completed' } } })

    const started = host.started()
    expect(started).toBeDefined()
    expect(started?.kind).toBe('chronicler')

    const hooks = started!.run()
    const outcome = await hooks.done
    expect(outcome.status).toBe('completed')
    const stateWrites = host.appended.filter((entry) => entry.type === 'user/message')
    expect(stateWrites).toHaveLength(1)
    expect(
      (stateWrites[0]?.data as { source: { rrp: { worldState: unknown } } }).source.rrp.worldState,
    ).toEqual({ ...VALID, relations: [] })

    // Attribution: the ledger must show the Chronicler started and what changed.
    const activity = readActivity('session-1').entries
    expect(activity.map((entry) => entry.phase)).toEqual(['started', 'committed'])
    const committed = activity[1] as { actor: string; target: string; detail?: string }
    expect(committed.actor).toBe('chronicler')
    expect(committed.target).toBe('world-state')
    expect(committed.detail).toContain('新增角色「毓忻」')
  })

  it('serializes rapid turns: the deferred one becomes a covering rerun', async () => {
    forgetState('session-1')
    forgetActivity('session-1')
    const events = [
      { type: 'user/message', data: { content: [{ type: 'text', text: '我推门而入。' }] } },
      {
        type: 'assistant/message',
        data: { content: [{ type: 'text', text: '门轴低吟，暖意扑面。' }] },
      },
    ]
    const prompts: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const llm = {
      async *stream(options: {
        messages: Array<{ content: Array<{ type: string; text: string }> }>
      }) {
        calls += 1
        prompts.push(options.messages[0]?.content[0]?.text ?? '')
        await gate
        const reply =
          calls === 1 ? VALID : { ...VALID, flags: { 已知晓密道: true, 第二轮已处理: true } }
        yield { type: 'text-delta', text: JSON.stringify(reply) }
      },
    }
    const host = fakeHost('rp', { events, llm })
    registerChronicler(host.ctx as never, 'rp')
    const feed = host.listeners.get('session/event')!

    // Turn 1 starts; while it is still streaming, turn 2 completes.
    feed?.(host.session, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    events.push(
      { type: 'user/message', data: { content: [{ type: 'text', text: '我转身离开。' }] } },
      { type: 'assistant/message', data: { content: [{ type: 'text', text: '她目送我远去。' }] } },
    )
    feed?.(host.session, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    expect(host.startCount()).toBe(1)

    // Finish turn 1: the queued rerun must start by itself...
    release()
    const first = await host.started()!.run().done
    expect(first.status).toBe('completed')
    expect(host.startCount()).toBe(2)
    // ...and fold turn 2 into a second state write.
    const second = await host.started()!.run().done
    expect(second.status).toBe('completed')
    const stateWrites = host.appended.filter((entry) => entry.type === 'user/message')
    expect(stateWrites).toHaveLength(2)
    const secondState = (
      stateWrites[1]?.data as {
        source: { rrp: { worldState: { flags: Record<string, unknown> } } }
      }
    ).source.rrp.worldState
    expect(secondState.flags['第二轮已处理']).toBe(true)
    // The rerun's prompt covers the unprocessed turn 2 prose, not turn 1 again.
    expect(prompts[1]).toContain('我转身离开')
    expect(prompts[1]).not.toContain('我推门而入')
  })

  it('ignores sessions on other presets', () => {
    const host = fakeHost('standard')
    registerChronicler(host.ctx as never, 'rp')
    host.listeners.get('session/event')?.(host.session, {
      type: 'turn/end',
      data: { reason: { kind: 'completed' } },
    })
    expect(host.started()).toBeUndefined()
  })

  it('records a failed job instead of a committed update when append fails', async () => {
    forgetState('session-1')
    forgetActivity('session-1')
    const host = fakeHost('rp', { failAppend: true })
    registerChronicler(host.ctx as never, 'rp')
    host.listeners.get('session/event')?.(host.session, {
      type: 'turn/end',
      data: { reason: { kind: 'completed' } },
    })
    const outcome = await host.started()!.run().done
    expect(outcome.status).toBe('failed')
    expect(readActivity('session-1').entries.map((entry) => entry.phase)).toEqual([
      'started',
      'failed',
    ])
  })

  it('discards inference and marks as stale when player corrected world state during inference', async () => {
    forgetState('session-1')
    forgetActivity('session-1')
    forgetInference('session-1')
    let callCount = 0
    const host = fakeHost('rp', {
      stateOf: (_session, key) => {
        if (key === 'agentPreset') return 'rp'
        if (key === 'rrpWorldState') {
          callCount++
          // First call is prior (empty); second call simulates player correction during inference
          if (callCount === 1) return emptyWorldState()
          return {
            ...emptyWorldState(),
            characters: { 玩家角色: { mood: '从容' } },
          }
        }
        return undefined
      },
    })
    registerChronicler(host.ctx as never, 'rp')
    host.listeners.get('session/event')?.(host.session, {
      type: 'turn/end',
      data: { reason: { kind: 'completed' } },
    })
    const outcome = await host.started()!.run().done
    expect(outcome.status).toBe('stale')
    expect(host.appended.filter((entry) => entry.type === 'user/message')).toHaveLength(0)
    const activity = readActivity('session-1').entries
    expect(activity.map((entry) => entry.phase)).toEqual(['started', 'stale'])
    expect(activity[1]?.detailKey).toBe('detail.staleDiscarded')
    // The discarded turn's prose is not left uncounted: exactly one covering
    // rerun is queued, and it runs against the player's corrected slice.
    expect(host.startCount()).toBe(2)
    const retry = await host.started()!.run().done
    expect(retry.status).toBe('completed')
    expect(
      readActivity('session-1')
        .entries.map((entry) => entry.phase)
        .at(-1),
    ).not.toBe('stale')
  })

  it('skips publish and marks ledger as no change when inferred state matches prior', async () => {
    forgetState('session-1')
    forgetActivity('session-1')
    const host = fakeHost('rp', {
      stateOf: (_session, key) => {
        if (key === 'agentPreset') return 'rp'
        if (key === 'rrpWorldState') return VALID
        return undefined
      },
    })
    registerChronicler(host.ctx as never, 'rp')
    host.listeners.get('session/event')?.(host.session, {
      type: 'turn/end',
      data: { reason: { kind: 'completed' } },
    })
    const outcome = await host.started()!.run().done
    expect(outcome.status).toBe('completed')
    // No facts appended because state did not change
    expect(host.appended.filter((entry) => entry.type === 'user/message')).toHaveLength(0)
    const activity = readActivity('session-1').entries
    expect(activity.map((entry) => entry.phase)).toEqual(['started', 'committed'])
    expect(activity[1]?.detailKey).toBe('detail.noChange')
  })
})

describe('parseChroniclerReply salvage (testing-round hardening)', () => {
  it('drops a malformed dynamic key instead of failing the whole turn', () => {
    const reply = JSON.stringify({
      characters: {},
      inventory: {},
      scene: { location: '客栈' },
      flags: {},
      relations: [],
      inner_monologue: ['不该多嘴'],
      mood_board: { tone: '阴郁' },
    })
    const parsed = parseChroniclerReply(reply)
    expect(parsed).toBeDefined()
    expect(parsed?.state.scene.location).toBe('客栈')
    expect(parsed?.state.inner_monologue).toBeUndefined()
    expect(parsed?.state.mood_board).toBeUndefined()
  })

  it('still rejects core-domain corruption', () => {
    expect(
      parseChroniclerReply(
        JSON.stringify({
          characters: [],
          inventory: {},
          scene: {},
          flags: {},
          relations: [],
        }),
      ),
    ).toBeUndefined()
  })
})
