import { describe, expect, it } from 'vitest'
import { registerSedimentRuntime } from '../src/sediment-runtime.ts'

/** A fake host runtime recording the agent lifecycle listener. */
function fakeRuntime() {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const ctx = {
    effect: (fn: () => (() => void) | void) => fn(),
    get: (name: string) => (name === 'agents' ? { get: () => undefined } : undefined),
    on: (event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, listener)
      return () => {}
    },
  }
  return { ctx, listeners }
}

/**
 * Regression: real Cordis contexts refuse `agent.ctx.skills` without a declared
 * inject, and agent/created listeners run inside session creation — a throw
 * there broke "开始这一局". The runtime must use the inject-free read.
 */
describe('sediment runtime arming', () => {
  it('arms through ctx.get and survives a throwing skills getter', () => {
    const { ctx, listeners } = fakeRuntime()
    registerSedimentRuntime(ctx as never)

    const calls: unknown[] = []
    const skillsService = {
      registerProvider(create: (control: { signal: AbortSignal; invalidate(): void }) => unknown) {
        calls.push(create)
        return () => {}
      },
    }
    const agent = {
      id: 'session-x',
      session: { header: { agentPreset: 'rp-maid-heiress' } },
      ctx: {
        get(name: string) { return name === 'skills' ? skillsService : undefined },
        get skills(): never { throw new Error('cannot get property "skills" without inject') },
      },
    }

    expect(() => listeners.get('agent/created')?.({ agent })).not.toThrow()
    expect(calls).toHaveLength(1)
  })

  it('does not arm agents outside the RP preset family', () => {
    const { ctx, listeners } = fakeRuntime()
    registerSedimentRuntime(ctx as never)

    let registered = 0
    const agent = {
      id: 'session-y',
      session: { header: { agentPreset: 'standard' } },
      ctx: { get: () => ({ registerProvider: () => { registered += 1; return () => {} } }) },
    }
    listeners.get('agent/created')?.({ agent })
    expect(registered).toBe(0)
  })
})
