import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cleanupSession, extractSessionId } from '../src/index.ts'
import { readActivity, recordActivity } from '../src/activity.ts'
import { hasLoreDraft, stageLoreDraftForTesting } from '../src/lore-route.ts'
import { getLastSummarizedTurn, registerSummarizer } from '../src/summarizer.ts'
import * as rrp from '../src/index.ts'

describe('extractSessionId', () => {
  it('extracts session id from strings, objects, and nested agent/session structures', () => {
    expect(extractSessionId('session-1')).toBe('session-1')
    expect(extractSessionId({ id: 'session-2' })).toBe('session-2')
    expect(extractSessionId({ session: { id: 'session-3' } })).toBe('session-3')
    expect(extractSessionId({ agent: { session: { id: 'session-4' } } })).toBe('session-4')
    expect(extractSessionId({ agent: { id: 'session-5' } })).toBe('session-5')
    expect(extractSessionId(null)).toBeUndefined()
    expect(extractSessionId({})).toBeUndefined()
    expect(extractSessionId(123)).toBeUndefined()
  })
})

describe('cleanupSession (P0-4 memory leak cleanup)', () => {
  it('cleans up all in-memory caches and data structures for a session', () => {
    const sessionId = 'session-leak-test'

    // 1. Populate activity ledger
    recordActivity(sessionId, {
      id: 'act-1',
      at: new Date().toISOString(),
      actor: 'chronicler',
      target: 'world-state',
      phase: 'committed',
      detail: 'test change',
    })
    expect(readActivity(sessionId).entries).toHaveLength(1)

    // 2. Populate lore pending/drafting
    stageLoreDraftForTesting(sessionId, {
      name: 'test-lore',
      description: 'desc',
      body: 'body',
    })
    expect(hasLoreDraft(sessionId)).toBe(true)

    // 3. Populate summarizer lastSummarized
    const host = {
      llm: {
        async *stream() {
          yield { type: 'text-delta', text: '{}' }
        },
      },
      jobs: { start: () => 'job-1' },
      agents: { get: () => ({ options: { provider: 'p', model: 'm' } }) },
      sessionProjections: {
        stateOf: (_s: unknown, key: string) => {
          if (key === 'agentPreset') return 'rp'
          if (key === 'turnBoundary') return { lastTurn: 8 }
          if (key === 'rrpSettings') return { summaryEnabled: true }
          return undefined
        },
      },
    }
    const listeners = new Map<string, (...args: unknown[]) => void>()
    const ctx = {
      effect: (fn: () => (() => void) | void) => fn(),
      get: (name: string) => (host as Record<string, unknown>)[name],
      on: (event: string, fn: (...args: unknown[]) => void) => {
        listeners.set(event, fn)
        return () => {}
      },
    }
    registerSummarizer(ctx as never, 'rp')
    listeners.get('session/event')?.(
      { id: sessionId },
      { type: 'turn/end', data: { reason: { kind: 'completed' } } },
    )
    expect(getLastSummarizedTurn(sessionId)).toBe(8)

    // Run cleanupSession
    cleanupSession(sessionId)

    // Verify all 5 structures are cleared
    expect(readActivity(sessionId).entries).toEqual([])
    expect(hasLoreDraft(sessionId)).toBe(false)
    expect(getLastSummarizedTurn(sessionId)).toBeUndefined()
  })
})

describe('Lifecycle disposal listener integration (P0-4)', () => {
  function fakeLifecycleHost() {
    const listeners = new Map<string, (...args: unknown[]) => void>()
    const injected = new Map<string, (scoped: unknown) => void>()

    const ctx = {
      effect: (fn: () => (() => void) | void) => fn(),
      inject: (deps: string[], callback: (scoped: unknown) => void) => {
        for (const dep of deps) {
          injected.set(dep, callback)
        }
        callback(ctx)
      },
      on: (event: string, fn: (...args: unknown[]) => void) => {
        listeners.set(event, fn)
        return () => {}
      },
      get: () => undefined,
    }
    return { ctx, listeners }
  }

  function withIsolatedDshHome<T>(action: (home: string) => T): T {
    const previousHome = process.env.DSH_HOME
    const home = mkdtempSync(join(tmpdir(), 'dsh-rrp-cleanup-'))
    process.env.DSH_HOME = home
    try {
      return action(home)
    } finally {
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
      rmSync(home, { recursive: true, force: true })
    }
  }

  it('triggers cleanup on session/disposed', () => {
    withIsolatedDshHome(() => {
      const sessionId = 'session-disposed-e2e'
      recordActivity(sessionId, {
        id: 'act-1',
        at: new Date().toISOString(),
        actor: 'chronicler',
        target: 'world-state',
        phase: 'committed',
      })
      expect(readActivity(sessionId).entries).toHaveLength(1)

      const { ctx, listeners } = fakeLifecycleHost()
      rrp.apply(ctx as never)

      const onSessionDisposed = listeners.get('session/disposed')
      expect(onSessionDisposed).toBeDefined()
      onSessionDisposed?.({ id: sessionId })

      expect(readActivity(sessionId).entries).toEqual([])
    })
  })

  it('triggers cleanup on agent/disposed', () => {
    withIsolatedDshHome(() => {
      const sessionId = 'agent-disposed-e2e'
      recordActivity(sessionId, {
        id: 'act-2',
        at: new Date().toISOString(),
        actor: 'player',
        target: 'world-state',
        phase: 'corrected',
      })
      expect(readActivity(sessionId).entries).toHaveLength(1)

      const { ctx, listeners } = fakeLifecycleHost()
      rrp.apply(ctx as never)

      const onAgentDisposed = listeners.get('agent/disposed')
      expect(onAgentDisposed).toBeDefined()
      onAgentDisposed?.({ agent: { session: { id: sessionId } } })

      expect(readActivity(sessionId).entries).toEqual([])
    })
  })

  it('does not overwrite a pre-modified preset or marker in the home directory during apply()', () => {
    withIsolatedDshHome((home) => {
      const userPresetDir = join(home, '.agent-presets', 'rp')
      mkdirSync(userPresetDir, { recursive: true })
      const targetFile = join(userPresetDir, 'agent.cordis.yml')
      writeFileSync(targetFile, '# user modified content\n')

      const { ctx } = fakeLifecycleHost()
      rrp.apply(ctx as never)

      expect(readFileSync(targetFile, 'utf8')).toBe('# user modified content\n')
    })
  })
})
