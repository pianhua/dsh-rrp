import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { readActivity, recordActivity } from '../src/activity.ts'
import { registerChronicler } from '../src/chronicler.ts'
import { registerCopilotRoute } from '../src/copilot.ts'
import { setCopilotLegacyDirForTesting, setCopilotWitnessForTesting } from '../src/copilot-store.ts'
import { DRAFTING } from '../src/lore-drafts.ts'
import { hasLoreDraft, stageLoreDraftForTesting } from '../src/lore-route.ts'
import { RRP_SETTINGS_KEY } from '../src/settings.ts'
import { registerSummarizer } from '../src/summarizer.ts'
import { listProposals, stageProposal } from '../src/steward-proposals.ts'
import { publishState } from '../src/state-publisher.ts'
import { emptyWorldState } from '../src/world-state.ts'
import * as rrp from '../src/index.ts'

/**
 * The mandatory HMR-safety check: mounting then disposing the fiber must leave
 * no residue behind. Stage 2 adds file materialization, so the test points
 * DSH_HOME at a throwaway directory and asserts the preset is cleaned up.
 */
describe('dsh-rrp host half', () => {
  let home: string
  let previousHome: string | undefined

  beforeEach(() => {
    previousHome = process.env.DSH_HOME
    home = mkdtempSync(join(tmpdir(), 'dsh-rrp-host-'))
    process.env.DSH_HOME = home
  })

  afterEach(() => {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  })

  /** Write one synthetic card with one world-knowledge skill. */
  function writeCard(id: string, skill: string): void {
    const cardDir = join(home, '.dsh-rrp', 'cards', id)
    mkdirSync(join(cardDir, 'skills', skill), { recursive: true })
    writeFileSync(join(cardDir, 'card.md'), `---\nid: ${id}\nname: ${id}\n---\n\n# core\n`)
    writeFileSync(
      join(cardDir, 'skills', skill, 'SKILL.md'),
      `---\nname: ${skill}\ndescription: ${skill} description\n---\n\nbody\n`,
    )
  }

  it('mounts and disposes cleanly (HMR safety)', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(rrp)
    expect(fiber).toBeTruthy()
    await fiber.dispose()
  })

  it('disposes the v2 timeline projection registration on plugin unload', () => {
    const registered: string[] = []
    const disposed: string[] = []
    const projectionRegistry = {
      register(definition: { key: string }) {
        registered.push(definition.key)
        return () => disposed.push(definition.key)
      },
    }
    const effects: Array<() => void> = []
    const ctx = {
      effect(fn: () => (() => void) | void) {
        const cleanup = fn()
        if (cleanup !== undefined) effects.push(cleanup)
        return cleanup
      },
      inject(deps: string[], callback: (scoped: unknown) => void) {
        if (deps.length === 1 && deps[0] === 'sessionProjections') callback(ctx)
      },
      get(name: string) {
        return name === 'sessionProjections' ? projectionRegistry : undefined
      },
    }

    rrp.apply(ctx as never)
    expect(registered).toContain('rrpWorldStateTimeline')

    effects.reverse().forEach((cleanup) => cleanup())
    expect(disposed).toContain('rrpWorldStateTimeline')
  })

  it('clears every session cache when the real plugin fiber is disposed', async () => {
    type Listener = (...args: unknown[]) => void
    const sessionId = 'host-mount-unload-cleanup'
    const stateWrites: unknown[] = []
    const session = {
      id: sessionId,
      append: (_type: string, data: unknown) => stateWrites.push(data),
    }
    const worldState = emptyWorldState()
    const projections = {
      stateOf: (_session: unknown, key: string) => {
        if (key === 'agentPreset') return 'rp'
        if (key === 'turnBoundary') return { lastTurn: 8 }
        if (key === RRP_SETTINGS_KEY) return { summaryEnabled: true, summaryEveryTurns: 8 }
        return undefined
      },
    }
    const turnEnd = { type: 'turn/end', data: { reason: { kind: 'completed' } } }
    const makeContext = (listeners: Map<string, Listener>, services: Record<string, unknown>) => ({
      effect: (fn: () => (() => void) | void) => fn(),
      get: (name: string) => services[name],
      on: (event: string, listener: Listener) => {
        listeners.set(event, listener)
        return () => listeners.delete(event)
      },
    })

    let summaryStarts = 0
    let inferenceStarts = 0
    const jobs = {
      attachController: () => () => {},
      start: ({ kind }: { kind: string }) => {
        if (kind === 'summarizer') summaryStarts += 1
        if (kind === 'chronicler') inferenceStarts += 1
        return kind + '-job'
      },
    }
    const agentServices = {
      llm: {
        async *stream() {
          yield { type: 'text-delta', text: '{}' }
        },
      },
      jobs,
      agents: { get: () => ({ options: { provider: 'p', model: 'm' } }) },
      sessionProjections: projections,
    }
    const summaryListeners = new Map<string, Listener>()
    const inferenceListeners = new Map<string, Listener>()
    registerSummarizer(makeContext(summaryListeners, agentServices) as never, 'rp')
    registerChronicler(makeContext(inferenceListeners, agentServices) as never, 'rp')
    summaryListeners.get('session/event')?.(session, turnEnd)
    inferenceListeners.get('session/event')?.(session, turnEnd)
    summaryListeners.get('session/event')?.(session, turnEnd)
    inferenceListeners.get('session/event')?.(session, turnEnd)
    expect(summaryStarts).toBe(1)
    expect(inferenceStarts).toBe(1)

    recordActivity(sessionId, {
      id: 'act-unload',
      at: new Date().toISOString(),
      actor: 'player',
      target: 'world-state',
      phase: 'corrected',
    })
    stageLoreDraftForTesting(sessionId, { name: 'draft', description: 'd', body: 'b' })
    DRAFTING.add(sessionId)
    stageProposal(sessionId, { kind: 'doc-note', title: 'note', body: 'b' })
    expect(readActivity(sessionId).entries).toHaveLength(1)
    expect(hasLoreDraft(sessionId)).toBe(true)
    expect(DRAFTING.has(sessionId)).toBe(true)
    expect(listProposals(sessionId)).toHaveLength(1)
    publishState(session, projections, { worldState })
    expect(stateWrites).toHaveLength(1)

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
    const copilotServices = {
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
      sessionProjections: projections,
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
    setCopilotLegacyDirForTesting(join(home, '.dsh-rrp', 'copilot'))
    setCopilotWitnessForTesting(join(home, 'copilot-witness.json'))
    const copilotCtx = {
      effect: (fn: () => (() => void) | void) => fn(),
      get: (name: string) => copilotServices[name as keyof typeof copilotServices],
    }
    let firstRequest: Promise<void> | undefined
    let secondRequest: Promise<void> | undefined
    try {
      registerCopilotRoute(copilotCtx as never)
      const handler = routes.get('/dsh-rrp/copilot')!.handler
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
      const firstResponse = response()
      firstRequest = handler(request(), firstResponse)
      await streamStarts[0]!.promise
      expect(firstResponse.statusCode).toBe(200)
      const busyResponse = response()
      await handler(request(), busyResponse)
      expect(busyResponse.statusCode).toBe(409)
      expect(streamCount).toBe(1)

      const ctx = new Context()
      const fiber = await ctx.plugin(rrp)
      await fiber.dispose()

      summaryListeners.get('session/event')?.(session, turnEnd)
      inferenceListeners.get('session/event')?.(session, turnEnd)
      expect(summaryStarts).toBe(2)
      expect(inferenceStarts).toBe(2)
      expect(readActivity(sessionId).entries).toEqual([])
      expect(hasLoreDraft(sessionId)).toBe(false)
      expect(DRAFTING.has(sessionId)).toBe(false)
      expect(listProposals(sessionId)).toEqual([])
      publishState(session, projections, { worldState })
      expect(stateWrites).toHaveLength(2)

      const secondResponse = response()
      secondRequest = handler(request(), secondResponse)
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
    } finally {
      gates.forEach((gate) => gate.resolve())
      await Promise.allSettled(
        [firstRequest, secondRequest].filter((request) => request !== undefined),
      )
      rrp.cleanupAllSessions()
    }
  })

  it("scopes each card's skills to its own preset (no cross-card bleed)", async () => {
    writeCard('alpha', 'alpha-lore')
    writeCard('beta', 'beta-lore')

    const ctx = new Context()
    const fiber = await ctx.plugin(rrp)
    try {
      const alphaDir = join(home, '.agent-presets', 'rp-alpha')
      const betaDir = join(home, '.agent-presets', 'rp-beta')

      // Each card preset points at its own skills root...
      expect(readFileSync(join(alphaDir, 'agent.cordis.yml'), 'utf8')).toContain(
        join(alphaDir, 'skills'),
      )
      expect(readFileSync(join(betaDir, 'agent.cordis.yml'), 'utf8')).toContain(
        join(betaDir, 'skills'),
      )

      // ...holds only its own bundle...
      expect(existsSync(join(alphaDir, 'skills', 'alpha-lore', 'SKILL.md'))).toBe(true)
      expect(existsSync(join(alphaDir, 'skills', 'beta-lore', 'SKILL.md'))).toBe(false)
      expect(existsSync(join(betaDir, 'skills', 'beta-lore', 'SKILL.md'))).toBe(true)
      expect(existsSync(join(betaDir, 'skills', 'alpha-lore', 'SKILL.md'))).toBe(false)

      // ...and the base RP preset carries neither card's lore.
      const baseDir = join(home, '.agent-presets', 'rp')
      expect(existsSync(join(baseDir, 'skills', 'alpha-lore'))).toBe(false)
      expect(existsSync(join(baseDir, 'skills', 'beta-lore'))).toBe(false)
    } finally {
      await fiber.dispose()
    }
  })
})
