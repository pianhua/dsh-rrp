import { describe, expect, it } from 'vitest'
import { buildSummarizerPrompt, parseSummarizerReply } from '../src/agents/summarizer.ts'
import { registerSummarizer, registerSummaryCommand } from '../src/summarizer.ts'
import { RRP_SETTINGS_KEY } from '../src/settings.ts'
import type { RrpStatePayload } from '../src/state-payload.ts'

const VALID = {
  goal: '逃离塞北',
  conflict: '商队被人盯上',
  turningPoints: ['夜宿归离客栈'],
  threads: ['枯河滩上的脚印'],
}

describe('Summarizer reply contract', () => {
  it('parses a bare or prose-wrapped JSON object', () => {
    expect(parseSummarizerReply(JSON.stringify(VALID))).toEqual(VALID)
    expect(parseSummarizerReply('结果：\n' + JSON.stringify(VALID) + '\n完毕')).toEqual(VALID)
  })
  it('rejects unusable replies', () => {
    expect(parseSummarizerReply('无 JSON')).toBeUndefined()
    expect(parseSummarizerReply('{"goal":1}')).toBeUndefined()
  })
  it('includes the transcript in the prompt', () => {
    expect(buildSummarizerPrompt('【玩家】\n我推门而入。')).toContain('我推门而入。')
  })
})

function fakeHost(preset: string, turn: number, summaryEnabled = true) {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const appended: Array<{ type: string; data: unknown }> = []
  let started = 0
  const session = {
    id: 's1',
    append(type: string, data: unknown) { appended.push({ type, data }); return {} },
    snapshotEvents: () => [{ type: 'assistant/message', data: { content: [{ type: 'text', text: '门轴低吟。' }] } }],
  }
  const llm = { async *stream() { yield { type: 'text-delta', text: JSON.stringify(VALID) } } }
  const jobs = { start() { started += 1; return 'summarizer-1' } }
  const agents = { get: () => ({ options: { provider: 'deepseek', model: 'deepseek-chat' } }) }
  const projections = {
    stateOf: (_session: unknown, key: string) => {
      if (key === 'agentPreset') return preset
      if (key === 'turnBoundary') return { lastTurn: turn }
      if (key === RRP_SETTINGS_KEY) return { summaryEnabled }
      return undefined
    },
  }
  const ctx = {
    effect(fn: () => (() => void) | void) { return fn() },
    get: (name: string) => ({ llm, jobs, agents, sessionProjections: projections } as Record<string, unknown>)[name],
    on(name: string, listener: (...args: unknown[]) => void) { listeners.set(name, listener); return () => {} },
  }
  return { ctx, listeners, session, appended, started: () => started }
}

describe('Summarizer trigger', () => {
  it('runs on a completed RP turn at the cadence boundary', () => {
    const host = fakeHost('rp', 8)
    registerSummarizer(host.ctx as never, 'rp')
    host.listeners.get('session/event')?.(host.session, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    expect(host.started()).toBe(1)
  })

  it('does not run before the cadence boundary or for other presets', () => {
    const early = fakeHost('rp', 3)
    registerSummarizer(early.ctx as never, 'rp')
    early.listeners.get('session/event')?.(early.session, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    expect(early.started()).toBe(0)

    const other = fakeHost('standard', 8)
    registerSummarizer(other.ctx as never, 'rp')
    other.listeners.get('session/event')?.(other.session, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    expect(other.started()).toBe(0)
  })

  it('does not run while the player has it off', () => {
    const host = fakeHost('rp', 8, false)
    registerSummarizer(host.ctx as never, 'rp')
    host.listeners.get('session/event')?.(host.session, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    expect(host.started()).toBe(0)
  })
})

describe('Summarizer toggle command', () => {
  it('writes only the invoking session and never changes another session', () => {
    type Session = {
      id: string
      append(type: string, data: unknown, intent?: unknown): unknown
      snapshotEvents(): readonly { type?: string; data?: unknown }[]
    }
    type Invocation = { rawInput: string; agent?: { session: Session } }
    let definition: { handler: (i: Invocation) => { kind: string; text?: string } } | undefined
    const commands = { register: (d: typeof definition) => { definition = d; return () => {} } }
    const writes = new Map<string, Array<{ type: string; data: unknown }>>()
    const session = (id: string): Session => ({
      id,
      append(type, data) {
        const entries = writes.get(id) ?? []
        entries.push({ type, data })
        writes.set(id, entries)
        return { seq: entries.length }
      },
      snapshotEvents: () => [],
    })
    const first = session('first')
    const second = session('second')
    const projections = {
      stateOf: (_session: unknown, key: string) => key === RRP_SETTINGS_KEY ? { summaryEnabled: true } : undefined,
    }
    const ctx = {
      effect(fn: () => (() => void) | void) { return fn() },
      get: (name: string) => ({ commands, sessionProjections: projections } as Record<string, unknown>)[name],
    }
    registerSummaryCommand(ctx as never)
    expect(definition?.handler({ rawInput: ' off', agent: { session: first } }).kind).toBe('success')
    expect(writes.get(first.id)).toHaveLength(1)
    expect(writes.get(second.id)).toBeUndefined()

    const payload = (writes.get(first.id)?.[0]?.data as { source?: { rrp?: RrpStatePayload } })?.source?.rrp
    expect(payload?.settings).toEqual({ summaryEnabled: false, summaryEveryTurns: 8 })

    expect(definition?.handler({ rawInput: 'on', agent: { session: second } }).text).toContain('开启')
    expect(writes.get(second.id)).toHaveLength(1)
    const secondPayload = (writes.get(second.id)?.[0]?.data as { source?: { rrp?: RrpStatePayload } })?.source?.rrp
    expect(secondPayload?.settings).toEqual({ summaryEnabled: true, summaryEveryTurns: 8 })
  })

  it('sets the cadence with /summary every N, clamped to the legal range', () => {
    type Session = {
      id: string
      append(type: string, data: unknown, intent?: unknown): unknown
      snapshotEvents(): readonly { type?: string; data?: unknown }[]
    }
    type Invocation = { rawInput: string; agent?: { session: Session } }
    let definition: { handler: (i: Invocation) => { kind: string; text?: string } } | undefined
    const commands = { register: (d: typeof definition) => { definition = d; return () => {} } }
    const writes: Array<{ type: string; data: unknown }> = []
    const session: Session = {
      id: 's1',
      append(type, data) { writes.push({ type, data }); return { seq: writes.length } },
      snapshotEvents: () => [],
    }
    const projections = {
      stateOf: (_session: unknown, key: string) => key === RRP_SETTINGS_KEY ? { summaryEnabled: true, summaryEveryTurns: 4 } : undefined,
    }
    const ctx = {
      effect(fn: () => (() => void) | void) { return fn() },
      get: (name: string) => ({ commands, sessionProjections: projections } as Record<string, unknown>)[name],
    }
    registerSummaryCommand(ctx as never)

    const reply = definition?.handler({ rawInput: 'every 5', agent: { session } })
    expect(reply?.kind).toBe('success')
    expect(reply?.text).toContain('5')
    const payload = (writes[0]?.data as { source?: { rrp?: RrpStatePayload } })?.source?.rrp
    expect(payload?.settings).toEqual({ summaryEnabled: true, summaryEveryTurns: 5 })

    // Out-of-range values clamp instead of failing. (Distinct session: the
    // publisher dedups same-render writes within one session.)
    const other: Session = {
      id: 's2',
      append(type, data) { writes.push({ type, data }); return { seq: writes.length } },
      snapshotEvents: () => [],
    }
    definition?.handler({ rawInput: 'every 999', agent: { session: other } })
    const clamped = (writes[1]?.data as { source?: { rrp?: RrpStatePayload } })?.source?.rrp
    expect(clamped?.settings?.summaryEveryTurns).toBe(50)
  })
})
