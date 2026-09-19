import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { legacySessionLoreDir, renderLore } from '../src/lore.ts'
import { LORE_LIMITS, applyLoreChange, type LoreEntry } from '../src/lore-state.ts'
import { invalidateLore, migrateLegacyLore, registerLoreRuntime } from '../src/lore-runtime.ts'
import { hasLoreDraft, stageLoreDraftForTesting } from '../src/lore-route.ts'
import { rrpPayloadOf } from '../src/state-payload.ts'
import { transcriptProjections } from './stubs/transcript-projections.ts'

const homes: string[] = []
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

/** A fake host runtime recording the agent lifecycle listener. */
function fakeRuntime() {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const agents = new Map<string, unknown>()
  const presets = new Map<string, string | null>()
  const projections = {
    stateOf: (session: { id?: string }, key: string) => {
      if (key === 'agentPreset') return presets.get(session.id ?? '') ?? null
      return key === 'rrpSediment' && session.id === 'session-x'
        ? [{ name: 'session-lore', description: 'only x', body: '# X' }]
        : []
    },
  }
  const ctx = {
    effect: (fn: () => (() => void) | void) => fn(),
    get: (name: string) => ({ agents: { get: (id: string) => agents.get(id) }, sessionProjections: projections } as Record<string, unknown>)[name],
    on: (event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, listener)
      return () => {}
    },
  }
  return {
    ctx,
    listeners,
    setAgent: (id: string, agent: unknown) => agents.set(id, agent),
    setPreset: (id: string, preset: string | null) => presets.set(id, preset),
  }
}

/**
 * Regression: real Cordis contexts refuse `agent.ctx.skills` without a declared
 * inject, and agent/created listeners run inside session creation — a throw
 * there broke "开始这一局". The runtime must use the inject-free read.
 */
describe('lore runtime arming', () => {
  it('arms through ctx.get and reads only the owning Session projection', async () => {
    const { ctx, listeners, setPreset } = fakeRuntime()
    registerLoreRuntime(ctx as never)

    let provider: ReturnType<typeof import('../src/lore-provider.ts')['createLoreProvider']> | undefined
    const skillsService = {
      registerProvider(create: (control: { signal: AbortSignal; invalidate(): void }) => unknown) {
        provider = create({ signal: new AbortController().signal, invalidate() {} }) as typeof provider
        return () => {}
      },
    }
    const agent = {
      id: 'session-x',
      session: { id: 'session-x' },
      ctx: {
        get(name: string) { return name === 'skills' ? skillsService : undefined },
        get skills(): never { throw new Error('cannot get property "skills" without inject') },
      },
    }

    setPreset('session-x', 'rp-maid-heiress')
    expect(() => listeners.get('agent/created')?.({ agent })).not.toThrow()
    expect((await provider?.list({}))?.map((candidate) => candidate.name)).toEqual(['session-lore'])
  })

  it('does not arm agents outside the RP preset family', () => {
    const { ctx, listeners, setPreset } = fakeRuntime()
    registerLoreRuntime(ctx as never)

    let registered = 0
    const agent = {
      id: 'session-y',
      session: { id: 'session-y' },
      ctx: { get: () => ({ registerProvider: () => { registered += 1; return () => {} } }) },
    }
    setPreset('session-y', 'standard')
    listeners.get('agent/created')?.({ agent })
    expect(registered).toBe(0)
  })

  it('keys provider invalidation by Session id rather than Agent id', () => {
    const { ctx, listeners, setPreset } = fakeRuntime()
    registerLoreRuntime(ctx as never)
    let invalidations = 0
    const agent = {
      id: 'agent-x',
      session: { id: 'session-y' },
      ctx: {
        get: () => ({
          registerProvider(create: (control: { signal: AbortSignal; invalidate(): void }) => unknown) {
            create({ signal: new AbortController().signal, invalidate: () => { invalidations += 1 } })
            return () => {}
          },
        }),
      },
    }
    setPreset('session-y', 'rp-maid-heiress')
    listeners.get('agent/created')?.({ agent })
    invalidateLore('session-y')
    expect(invalidations).toBe(1)
  })

  it('arms after a blank Session selects an RP preset', () => {
    const { ctx, listeners, setAgent, setPreset } = fakeRuntime()
    registerLoreRuntime(ctx as never)
    let registered = 0
    let disposed = 0
    const agent = {
      id: 'session-selected',
      session: { id: 'session-selected' },
      ctx: {
        get: () => ({
          registerProvider(create: (control: { signal: AbortSignal; invalidate(): void }) => unknown) {
            registered += 1
            create({ signal: new AbortController().signal, invalidate() {} })
            return () => { disposed += 1 }
          },
        }),
      },
    }
    setAgent('session-selected', agent)
    setPreset('session-selected', null)
    listeners.get('agent/created')?.({ agent })
    expect(registered).toBe(0)

    setPreset('session-selected', 'rp-maid-heiress')
    listeners.get('agent-preset/selected')?.('session-selected', 'rp-maid-heiress')
    expect(registered).toBe(1)

    setPreset('session-selected', 'standard')
    listeners.get('agent-preset/selected')?.('session-selected', 'standard')
    expect(disposed).toBe(1)
  })

  it('cleans up staged lore drafts on agent/disposed', () => {
    const { ctx, listeners } = fakeRuntime()
    registerLoreRuntime(ctx as never)
    stageLoreDraftForTesting('session-disposed-test', {
      name: 'temp-lore',
      description: 'temp',
      body: 'temp',
    })
    expect(hasLoreDraft('session-disposed-test')).toBe(true)

    listeners.get('agent/disposed')?.({ agent: { session: { id: 'session-disposed-test' } } })
    expect(hasLoreDraft('session-disposed-test')).toBe(false)
  })
})

describe('legacy lore migration', () => {
  function fixture(fail = false) {
    const home = mkdtempSync(join(tmpdir(), 'dsh-rrp-lore-migrate-'))
    homes.push(home)
    const entry = { name: 'legacy-lore', description: 'old sidecar', body: '# Legacy' }
    const source = legacySessionLoreDir(home, 'legacy-session')
    const skillDir = join(source, entry.name)
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, 'SKILL.md'), renderLore(entry), 'utf8')

    let state: LoreEntry[] = []
    const events: Array<{ type: string; data: unknown }> = []
    const session = {
      id: 'legacy-session',
      header: { agentPreset: 'rp' },
      append(type: string, data: unknown) {
        if (fail) throw new Error('append failed')
        events.push({ type, data })
        const change = rrpPayloadOf({ type, data })?.sediment
        if (change !== undefined) state = applyLoreChange(state, change)
        return { seq: events.length }
      },
    }
    const projections = transcriptProjections(events, (_session: unknown, key: string) =>
      key === 'rrpSediment' ? state : undefined)
    return { home, source, entry, session, projections, events, state: () => state }
  }

  it('appends one snapshot before renaming the sidecar to a backup', () => {
    const value = fixture()
    expect(migrateLegacyLore(value.session, value.projections, value.home)).toBe(true)
    expect(value.state()).toEqual([value.entry])
    expect(rrpPayloadOf(value.events[0])?.sediment?.kind).toBe('snapshot')
    expect(existsSync(value.source)).toBe(false)
    expect(existsSync(value.source + '.legacy.bak')).toBe(true)

    expect(migrateLegacyLore(value.session, value.projections, value.home)).toBe(false)
    expect(value.events).toHaveLength(1)
  })

  it('keeps the original sidecar when the Session append fails', () => {
    const value = fixture(true)
    expect(migrateLegacyLore(value.session, value.projections, value.home)).toBe(false)
    expect(existsSync(value.source)).toBe(true)
    expect(existsSync(value.source + '.legacy.bak')).toBe(false)
  })

  it('caps a manually oversized legacy tree before publishing its snapshot', () => {
    const value = fixture()
    for (let index = 1; index <= LORE_LIMITS.skillsPerSession; index += 1) {
      const name = 'legacy-' + String(index)
      const dir = join(value.source, name)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'SKILL.md'), renderLore({ name, description: name, body: '# ' + name }), 'utf8')
    }
    expect(migrateLegacyLore(value.session, value.projections, value.home)).toBe(true)
    const snapshot = rrpPayloadOf(value.events[0])?.sediment
    expect(snapshot?.kind).toBe('snapshot')
    expect(snapshot?.kind === 'snapshot' ? snapshot.skills : []).toHaveLength(LORE_LIMITS.skillsPerSession)
    expect(value.state()).toHaveLength(LORE_LIMITS.skillsPerSession)
  })
})
