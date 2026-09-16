import { beforeEach, describe, expect, it } from 'vitest'
import { buildSummarizerPrompt, parseSummarizerReply } from '../src/agents/summarizer.ts'
import { registerSummarizer, registerSummaryCommand, isSummaryEnabled, setSummaryEnabled } from '../src/summarizer.ts'

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

function fakeHost(preset: string, turn: number) {
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
  beforeEach(() => setSummaryEnabled(true))

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
    setSummaryEnabled(false)
    const host = fakeHost('rp', 8)
    registerSummarizer(host.ctx as never, 'rp')
    host.listeners.get('session/event')?.(host.session, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    expect(host.started()).toBe(0)
  })
})

describe('Summarizer toggle command', () => {
  beforeEach(() => setSummaryEnabled(true))

  it('turns the feature off and on', () => {
    let definition: { handler: (i: { rawInput: string }) => { kind: string; text?: string } } | undefined
    const commands = { register: (d: typeof definition) => { definition = d; return () => {} } }
    const ctx = {
      effect(fn: () => (() => void) | void) { return fn() },
      get: (name: string) => (name === 'commands' ? commands : undefined),
    }
    registerSummaryCommand(ctx as never)
    expect(definition?.handler({ rawInput: ' off' }).kind).toBe('success')
    expect(isSummaryEnabled()).toBe(false)
    expect(definition?.handler({ rawInput: 'on' }).text).toContain('开启')
    expect(isSummaryEnabled()).toBe(true)
  })
})
