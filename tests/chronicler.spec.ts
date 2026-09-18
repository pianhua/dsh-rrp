import { describe, expect, it } from 'vitest'
import { buildChroniclerPrompt, parseChroniclerReply } from '../src/agents/chronicler.ts'
import { forgetActivity, readActivity } from '../src/activity.ts'
import { registerChronicler } from '../src/chronicler.ts'
import { forgetState } from '../src/state-publisher.ts'
import { emptyWorldState } from '../src/world-state.ts'

const VALID = {
  characters: { 毓忻: { affinity: 3, mood: '警惕' } },
  inventory: { 铜钥匙: { quantity: 1 } },
  scene: { location: '归离客栈' },
  flags: { 已知晓密道: true },
}

describe('Chronicler reply contract', () => {
  it('parses a bare JSON object and tolerates surrounding prose', () => {
    expect(parseChroniclerReply(JSON.stringify(VALID))).toEqual({ state: VALID })
    expect(parseChroniclerReply('好的，结果如下：\n' + JSON.stringify(VALID) + '\n以上。')).toEqual({ state: VALID })
  })

  it('rejects unusable replies', () => {
    expect(parseChroniclerReply('没有 JSON')).toBeUndefined()
    expect(parseChroniclerReply('{ not json }')).toBeUndefined()
    expect(parseChroniclerReply('{"scene":{"location":7}}')).toBeUndefined()
  })

  it('includes the prior state and transcript in the prompt', () => {
    const prompt = buildChroniclerPrompt({ prior: emptyWorldState(), transcript: '【玩家】\n我推门而入。' })
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
      createFields: [
        { id: 'stamina', type: 'number', value: 80, min: 0, max: 100 },
      ],
    })
    const parsed = parseChroniclerReply(reply)
    expect(parsed).toBeDefined()
    expect(parsed?.state.stamina).toEqual({ type: 'number', value: 80, min: 0, max: 100 })
    expect(parsed?.createFields).toHaveLength(1)
    expect(parsed?.createFields?.[0]?.id).toBe('stamina')
  })
})

/** Minimal fake host: records the session feed listener and the started job. */
function fakeHost(preset: string, options: { failAppend?: boolean; stateOf?: (session: unknown, key: string) => unknown } = {}) {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const appended: Array<{ type: string; data: unknown }> = []
  let started: { kind: string; label: string; run(): { cancel(reason?: string): void; done: Promise<{ status: string }> } } | undefined

  const session = {
    id: 'session-1',
    append(type: string, data: unknown) {
      if (options.failAppend === true) throw new Error('append failed')
      appended.push({ type, data })
      return { type, data }
    },
    snapshotEvents: () => [
      { type: 'user/message', data: { content: [{ type: 'text', text: '我推门而入。' }] } },
      { type: 'assistant/message', data: { content: [{ type: 'text', text: '门轴低吟，暖意扑面。' }] } },
      { type: 'step/end', data: { turn: 1, step: 0 } },
    ],
  }

  const llm = {
    async *stream() {
      yield { type: 'text-delta', text: JSON.stringify(VALID) }
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
  const projections = {
    stateOf: (session: unknown, key: string) => {
      if (options.stateOf) return options.stateOf(session, key)
      return key === 'agentPreset' ? preset : undefined
    },
  }

  const ctx = {
    effect(fn: () => (() => void) | void) {
      return fn()
    },
    get(name: string): unknown {
      return ({ llm, jobs, agents, sessionProjections: projections } as Record<string, unknown>)[name]
    },
    on(name: string, listener: (...args: unknown[]) => void) {
      listeners.set(name, listener)
      return () => {}
    },
  }
  return { ctx, session, listeners, appended, started: () => started }
}

describe('Chronicler trigger', () => {
  it('infers and publishes a complete WorldState on a completed RP turn', async () => {
    forgetState('session-1'); forgetActivity('session-1')
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
    expect((stateWrites[0]?.data as { source: { rrp: { worldState: unknown } } }).source.rrp.worldState).toEqual(VALID)

    // Attribution: the ledger must show the Chronicler started and what changed.
    const activity = readActivity('session-1').entries
    expect(activity.map((entry) => entry.phase)).toEqual(['started', 'committed'])
    const committed = activity[1] as { actor: string; target: string; detail?: string }
    expect(committed.actor).toBe('chronicler')
    expect(committed.target).toBe('world-state')
    expect(committed.detail).toContain('新增角色「毓忻」')
  })

  it('ignores sessions on other presets', () => {
    const host = fakeHost('standard')
    registerChronicler(host.ctx as never, 'rp')
    host.listeners.get('session/event')?.(host.session, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    expect(host.started()).toBeUndefined()
  })

  it('records a failed job instead of a committed update when append fails', async () => {
    forgetState('session-1'); forgetActivity('session-1')
    const host = fakeHost('rp', { failAppend: true })
    registerChronicler(host.ctx as never, 'rp')
    host.listeners.get('session/event')?.(host.session, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    const outcome = await host.started()!.run().done
    expect(outcome.status).toBe('failed')
    expect(readActivity('session-1').entries.map((entry) => entry.phase)).toEqual(['started', 'failed'])
  })

  it('discards inference and marks as stale when player corrected world state during inference', async () => {
    forgetState('session-1'); forgetActivity('session-1')
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
    host.listeners.get('session/event')?.(host.session, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    const outcome = await host.started()!.run().done
    expect(outcome.status).toBe('stale')
    expect(host.appended.filter((entry) => entry.type === 'user/message')).toHaveLength(0)
    const activity = readActivity('session-1').entries
    expect(activity.map((entry) => entry.phase)).toEqual(['started', 'stale'])
    expect(activity[1]?.detail).toContain('玩家已就地矫正')
  })
})
