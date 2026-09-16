import { describe, expect, it } from 'vitest'
import { registerAuthorContext } from '../src/author-context.ts'
import { CARD_KEY, renderCardContext, type CardContext } from '../src/card-types.ts'
import { emptyWorldState, renderWorldState } from '../src/world-state.ts'

const STATE = { ...emptyWorldState(), scene: { location: '归离客栈' } }
const CARD: CardContext = { id: 'c1', name: '测试卡', persona: '只写第三人称。', worldCore: '# 世界核心\n现代都市。' }

function fakeHost(preset: string, state: unknown, card?: CardContext) {
  const listeners = new Map<string, (...args: unknown[]) => unknown>()
  const projections = {
    stateOf: (_session: unknown, key: string) => {
      if (key === 'agentPreset') return preset
      if (key === 'rrpWorldState') return state
      if (key === CARD_KEY) return card
      return undefined
    },
  }
  const ctx = {
    effect(fn: () => (() => void) | void) {
      return fn()
    },
    get: (name: string) => (name === 'sessionProjections' ? projections : undefined),
    on(name: string, listener: (...args: unknown[]) => unknown) {
      listeners.set(name, listener)
      return () => {}
    },
  }
  return { ctx, listeners }
}

const payload = { agent: { session: { id: 's1' } }, messages: [] as unknown[] }

describe('Author WorldState context', () => {
  it('injects the current baseline into an RP pre-step', async () => {
    const host = fakeHost('rp', STATE)
    registerAuthorContext(host.ctx as never, 'rp')
    const listener = host.listeners.get('agent/pre-step')
    expect(listener).toBeDefined()

    const decision = await listener?.(payload, async () => ({ messages: [] as unknown[] })) as {
      messages: Array<{ source?: { plugin?: string }; content?: Array<{ text?: string }> }>
    }
    const injected = decision.messages.find((message) => message.source?.plugin === 'dsh-rrp')
    expect(injected).toBeDefined()
    expect(injected?.content?.[0]?.text).toBe(renderWorldState(STATE))
  })

  it('puts the active card setting ahead of the live state', async () => {
    const host = fakeHost('rp', STATE, CARD)
    registerAuthorContext(host.ctx as never, 'rp')
    const listener = host.listeners.get('agent/pre-step')!
    const decision = await listener(payload, async () => ({ messages: [] })) as {
      messages: Array<{ content?: Array<{ text?: string }> }>
    }
    const text = decision.messages[0]?.content?.[0]?.text ?? ''
    expect(text.indexOf(renderCardContext(CARD))).toBe(0)
    expect(text.indexOf(renderWorldState(STATE))).toBeGreaterThan(0)
  })

  it('does not re-inject an unchanged baseline', async () => {
    const host = fakeHost('rp', STATE)
    registerAuthorContext(host.ctx as never, 'rp')
    const listener = host.listeners.get('agent/pre-step')!
    await listener(payload, async () => ({ messages: [] }))
    const second = await listener(payload, async () => ({ messages: [] })) as { messages: unknown[] }
    expect(second.messages).toHaveLength(0)
  })

  it('ignores agents on other presets', async () => {
    const host = fakeHost('standard', STATE)
    registerAuthorContext(host.ctx as never, 'rp')
    const listener = host.listeners.get('agent/pre-step')!
    const decision = await listener(payload, async () => ({ messages: [] })) as { messages: unknown[] }
    expect(decision.messages).toHaveLength(0)
  })
})
