import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cleanupSession, extractSessionId } from '../src/index.ts'
import { readActivity, recordActivity } from '../src/activity.ts'
import { registerChronicler } from '../src/chronicler.ts'
import { registerCopilotRoute } from '../src/copilot.ts'
import { setCopilotLegacyDirForTesting, setCopilotWitnessForTesting } from '../src/copilot-store.ts'
import { DRAFTING } from '../src/lore-drafts.ts'
import { hasLoreDraft, stageLoreDraftForTesting } from '../src/lore-route.ts'
import { getLastSummarizedTurn, registerSummarizer } from '../src/summarizer.ts'
import { listProposals, stageProposal } from '../src/steward-proposals.ts'
import { publishState } from '../src/state-publisher.ts'
import { emptyWorldState } from '../src/world-state.ts'
import * as rrp from '../src/index.ts'

function seedSessionScopedCaches(sessionId: string) {
  recordActivity(sessionId, {
    id: 'act-' + sessionId,
    at: new Date().toISOString(),
    actor: 'player',
    target: 'world-state',
    phase: 'corrected',
  })
  stageLoreDraftForTesting(sessionId, { name: 'draft', description: 'd', body: 'b' })
  DRAFTING.add(sessionId)
  stageProposal(sessionId, { kind: 'doc-note', title: 'note', body: 'b' })

  const stateWrites: unknown[] = []
  const session = {
    id: sessionId,
    append: (_type: string, data: unknown) => stateWrites.push(data),
  }
  const projections = { stateOf: () => undefined }
  const worldState = emptyWorldState()
  publishState(session, projections, { worldState })
  expect(stateWrites).toHaveLength(1)
  return { session, projections, stateWrites, worldState }
}

function expectSessionScopedCachesCleared(
  sessionId: string,
  cache: ReturnType<typeof seedSessionScopedCaches>,
) {
  expect(readActivity(sessionId).entries).toEqual([])
  expect(hasLoreDraft(sessionId)).toBe(false)
  expect(DRAFTING.has(sessionId)).toBe(false)
  expect(listProposals(sessionId)).toEqual([])
  publishState(cache.session, cache.projections, { worldState: cache.worldState })
  expect(cache.stateWrites).toHaveLength(2)
}

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
  it('clears every session cache used by the state, lore, inference, summary, and proposal paths', () => {
    const sessionId = 'session-leak-test'

    recordActivity(sessionId, {
      id: 'act-1',
      at: new Date().toISOString(),
      actor: 'chronicler',
      target: 'world-state',
      phase: 'committed',
      detail: 'test change',
    })
    expect(readActivity(sessionId).entries).toHaveLength(1)

    stageLoreDraftForTesting(sessionId, {
      name: 'test-lore',
      description: 'desc',
      body: 'body',
    })
    DRAFTING.add(sessionId)
    expect(hasLoreDraft(sessionId)).toBe(true)

    stageProposal(sessionId, { kind: 'doc-note', title: 'cleanup', body: 'temporary' })
    expect(listProposals(sessionId)).toHaveLength(1)

    const worldState = emptyWorldState()
    const stateWrites: unknown[] = []
    const stateSession = {
      id: sessionId,
      append: (_type: string, data: unknown) => stateWrites.push(data),
    }
    const projections = { stateOf: () => undefined }
    publishState(stateSession, projections, { worldState })
    publishState(stateSession, projections, { worldState })
    expect(stateWrites).toHaveLength(1)

    const summaryHost = {
      llm: {
        async *stream() {
          yield { type: 'text-delta', text: '{}' }
        },
      },
      jobs: { start: () => 'job-1' },
      agents: { get: () => ({ options: { provider: 'p', model: 'm' } }) },
      sessionProjections: {
        stateOf: (_session: unknown, key: string) => {
          if (key === 'agentPreset') return 'rp'
          if (key === 'turnBoundary') return { lastTurn: 8 }
          if (key === 'rrpSettings') return { summaryEnabled: true }
          return undefined
        },
      },
    }
    const summaryListeners = new Map<string, (...args: unknown[]) => void>()
    const summaryCtx = {
      effect: (fn: () => (() => void) | void) => fn(),
      get: (name: string) => (summaryHost as Record<string, unknown>)[name],
      on: (event: string, fn: (...args: unknown[]) => void) => {
        summaryListeners.set(event, fn)
        return () => {}
      },
    }
    registerSummarizer(summaryCtx as never, 'rp')
    summaryListeners.get('session/event')?.(
      { id: sessionId },
      { type: 'turn/end', data: { reason: { kind: 'completed' } } },
    )
    expect(getLastSummarizedTurn(sessionId)).toBe(8)

    const inferenceListeners = new Map<string, (...args: unknown[]) => void>()
    let inferenceStarts = 0
    const inferenceHost = {
      llm: {
        async *stream() {
          yield { type: 'text-delta', text: '{}' }
        },
      },
      jobs: {
        attachController: () => () => {},
        start: () => {
          inferenceStarts += 1
          return 'chronicler-job'
        },
      },
      agents: { get: () => ({ options: { provider: 'p', model: 'm' } }) },
      sessionProjections: {
        stateOf: (_session: unknown, key: string) => (key === 'agentPreset' ? 'rp' : undefined),
      },
    }
    const inferenceCtx = {
      effect: (fn: () => (() => void) | void) => fn(),
      get: (name: string) => (inferenceHost as Record<string, unknown>)[name],
      on: (event: string, fn: (...args: unknown[]) => void) => {
        inferenceListeners.set(event, fn)
        return () => {}
      },
    }
    registerChronicler(inferenceCtx as never, 'rp')
    const inferenceSession = { id: sessionId, append: () => undefined }
    const completedTurn = {
      type: 'turn/end',
      data: { reason: { kind: 'completed' } },
    }
    inferenceListeners.get('session/event')?.(inferenceSession, completedTurn)
    expect(inferenceStarts).toBe(1)

    cleanupSession(sessionId)

    expect(readActivity(sessionId).entries).toEqual([])
    expect(hasLoreDraft(sessionId)).toBe(false)
    expect(DRAFTING.has(sessionId)).toBe(false)
    expect(getLastSummarizedTurn(sessionId)).toBeUndefined()
    expect(listProposals(sessionId)).toEqual([])
    publishState(stateSession, projections, { worldState })
    expect(stateWrites).toHaveLength(2)
    inferenceListeners.get('session/event')?.(inferenceSession, completedTurn)
    expect(inferenceStarts).toBe(2)
    cleanupSession(sessionId)
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

  it('triggers session-cache cleanup on session/disposed', () => {
    withIsolatedDshHome(() => {
      const sessionId = 'session-disposed-e2e'
      const cache = seedSessionScopedCaches(sessionId)
      expect(readActivity(sessionId).entries).toHaveLength(1)

      const { ctx, listeners } = fakeLifecycleHost()
      rrp.apply(ctx as never)

      const onSessionDisposed = listeners.get('session/disposed')
      expect(onSessionDisposed).toBeDefined()
      onSessionDisposed?.({ id: sessionId })

      expectSessionScopedCachesCleared(sessionId, cache)
    })
  })

  it('triggers session-cache cleanup on agent/disposed', () => {
    withIsolatedDshHome(() => {
      const sessionId = 'agent-disposed-e2e'
      const cache = seedSessionScopedCaches(sessionId)
      expect(readActivity(sessionId).entries).toHaveLength(1)

      const { ctx, listeners } = fakeLifecycleHost()
      rrp.apply(ctx as never)

      const onAgentDisposed = listeners.get('agent/disposed')
      expect(onAgentDisposed).toBeDefined()
      onAgentDisposed?.({ agent: { session: { id: sessionId } } })

      expectSessionScopedCachesCleared(sessionId, cache)
    })
  })

  it('clears the Copilot in-flight marker through session/disposed', async () => {
    const previousHome = process.env.DSH_HOME
    const home = mkdtempSync(join(tmpdir(), 'dsh-rrp-cleanup-copilot-'))
    process.env.DSH_HOME = home
    setCopilotLegacyDirForTesting(join(home, '.dsh-rrp', 'copilot'))
    setCopilotWitnessForTesting(join(home, 'copilot-witness.json'))

    type Deferred = { promise: Promise<void>; resolve: () => void }
    const deferred = (): Deferred => {
      let resolve!: () => void
      const promise = new Promise<void>((done) => {
        resolve = done
      })
      return { promise, resolve }
    }
    const gates = [deferred(), deferred()]
    const streamStarts = [deferred(), deferred()]
    let streamCount = 0
    const sessionId = 'copilot-session-disposed'
    const session = { id: sessionId, append: () => undefined }
    const records = new Map<string, unknown>()
    const historyTable = {
      get: (key: string) => records.get(key),
      put: async (key: string, value: unknown) => {
        records.set(key, structuredClone(value))
      },
      update: async (key: string, update: (current: never) => never) => {
        const next = update(structuredClone(records.get(key)) as never)
        records.set(key, structuredClone(next))
        return next
      },
      delete: async (key: string) => records.delete(key),
    }
    const routes = new Map<string, { handler: (req: unknown, res: unknown) => Promise<void> }>()
    const services = {
      webServer: {
        register: (route: {
          path: string
          handler: (req: unknown, res: unknown) => Promise<void>
        }) => {
          routes.set(route.path, route)
          return () => routes.delete(route.path)
        },
      },
      sessions: { get: (id: string) => (id === sessionId ? session : undefined) },
      sessionProjections: {
        stateOf: (_session: unknown, key: string) => (key === 'agentPreset' ? 'rp' : undefined),
      },
      llm: {
        stream: () => {
          const index = streamCount++
          return (async function* () {
            streamStarts[index]?.resolve()
            await gates[index]?.promise
            yield { type: 'text-delta', text: '答复。' }
          })()
        },
      },
      agents: { get: () => ({ options: { provider: 'p', model: 'm' } }) },
      storageDomain: {
        open: async () => ({ table: () => historyTable, close: async () => {} }),
      },
    }
    const copilotCtx = {
      effect: (fn: () => (() => void) | void) => fn(),
      get: (name: string) => (services as Record<string, unknown>)[name],
    }
    const request = () => ({
      method: 'POST',
      url: '/dsh-rrp/copilot',
      on() {},
      async *[Symbol.asyncIterator]() {
        yield JSON.stringify({ sessionId, message: '继续' })
      },
    })
    const response = () => ({
      statusCode: 0,
      setHeader() {},
      writeHead() {},
      write() {},
      end() {},
    })

    try {
      registerCopilotRoute(copilotCtx as never)
      const handler = routes.get('/dsh-rrp/copilot')!.handler
      const firstResponse = response()
      const firstRequest = handler(request(), firstResponse)
      await streamStarts[0]!.promise

      const { ctx, listeners } = fakeLifecycleHost()
      rrp.apply(ctx as never)
      listeners.get('session/disposed')?.({ id: sessionId })

      const secondResponse = response()
      const secondRequest = handler(request(), secondResponse)
      let timeout: ReturnType<typeof setTimeout> | undefined
      const secondStarted = await Promise.race([
        streamStarts[1]!.promise.then(() => true),
        secondRequest.then(() => false),
        new Promise<boolean>((resolve) => {
          timeout = setTimeout(() => resolve(false), 1000)
        }),
      ])
      if (timeout !== undefined) clearTimeout(timeout)
      expect(secondStarted).toBe(true)
      expect(secondResponse.statusCode).toBe(200)

      gates.forEach((gate) => gate.resolve())
      await Promise.all([firstRequest, secondRequest])
    } finally {
      gates.forEach((gate) => gate.resolve())
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
      rmSync(home, { recursive: true, force: true })
    }
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
