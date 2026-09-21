import { describe, expect, it } from 'vitest'
import { registerLoreRoute } from '../src/lore-route.ts'
import { seedCardTriggersForTesting } from '../src/cards.ts'
import type { CardContext } from '../src/card-types.ts'
import { parseWhen, type TriggerDef, type WhenCondition } from '../src/lore-condition.ts'
import { RRP_LORE_KEY, applyLoreChange, type LoreEntry } from '../src/lore-state.ts'
import { rrpPayloadOf } from '../src/state-payload.ts'
import { emptyWorldState, type WorldState } from '../src/world-state.ts'
import { transcriptProjections } from './stubs/transcript-projections.ts'

/** Minimal fake host with synchronous projection folding, like Session.append. */
function fakeHost(opts?: { agentPreset?: string; card?: CardContext; worldState?: WorldState }) {
  let lore: LoreEntry[] = []
  let failAppend = false
  const appended: Array<{ type: string; data: unknown }> = []
  const session = {
    id: 's1',
    append(type: string, data: unknown) {
      if (failAppend) throw new Error('disk full')
      appended.push({ type, data })
      const change = rrpPayloadOf({ type, data })?.sediment
      if (change !== undefined) lore = applyLoreChange(lore, change)
      return { seq: appended.length }
    },
  }
  const sessions = { get: (id: string) => (id === session.id ? session : undefined) }
  const projections = transcriptProjections(appended, (_session: unknown, key: string) => {
    if (key === RRP_LORE_KEY) return lore
    if (key === 'agentPreset') return opts?.agentPreset
    if (key === 'rrpCard') return opts?.card
    if (key === 'rrpWorldState') return opts?.worldState
    return undefined
  })
  let route: { handler: (req: unknown, res: unknown) => unknown } | undefined
  const webServer = {
    register: (definition: { handler: (req: unknown, res: unknown) => unknown }) => {
      route = definition
      return () => {}
    },
  }
  const ctx = {
    effect: (fn: () => (() => void) | void) => fn(),
    get: (name: string) =>
      (
        ({
          webServer,
          sessions,
          sessionProjections: projections,
          agents: { get: () => undefined },
        }) as Record<string, unknown>
      )[name],
  }
  return {
    ctx,
    route: () => route,
    appended,
    lore: () => lore,
    failNextAppend: () => {
      failAppend = true
    },
  }
}

/** A JSON request/response pair. */
function exchange(method: string, url: string, body?: unknown) {
  const req = {
    method,
    url,
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield JSON.stringify(body)
    },
  }
  const res = {
    statusCode: 0,
    payload: undefined as unknown,
    setHeader() {},
    end(text?: string) {
      this.payload = text === undefined ? undefined : (JSON.parse(text) as unknown)
    },
  }
  return { req, res }
}

const DRAFT = { name: 'qingqiu-lore', description: '青丘狐族；涉及青丘时使用。', body: '# 青丘' }

describe('lore route (D8)', () => {
  it('appends a manual draft, lists the projection, then appends a removal', async () => {
    const host = fakeHost()
    registerLoreRoute(host.ctx as never)

    const manual = exchange('POST', '/dsh-rrp/lore', {
      sessionId: 's1',
      action: 'manual',
      draft: DRAFT,
    })
    await host.route()!.handler(manual.req, manual.res)
    expect(manual.res.statusCode).toBe(200)
    expect(host.lore().map((skill) => skill.name)).toEqual(['qingqiu-lore'])
    expect(rrpPayloadOf(host.appended[0])?.sediment).toEqual({ kind: 'add', skill: DRAFT })

    const listed = exchange('GET', '/dsh-rrp/lore?sessionId=s1')
    await host.route()!.handler(listed.req, listed.res)
    expect(listed.res.statusCode).toBe(200)
    expect((listed.res.payload as { skills: unknown[] }).skills).toHaveLength(1)
    expect((listed.res.payload as { pending: unknown }).pending).toBeNull()

    const removed = exchange('DELETE', '/dsh-rrp/lore?sessionId=s1&name=qingqiu-lore')
    await host.route()!.handler(removed.req, removed.res)
    expect(removed.res.statusCode).toBe(200)
    expect(host.lore()).toEqual([])
    expect(rrpPayloadOf(host.appended[1])?.sediment).toEqual({
      kind: 'remove',
      name: 'qingqiu-lore',
    })
  })

  it('is add-only: the same projected name twice is refused', async () => {
    const host = fakeHost()
    registerLoreRoute(host.ctx as never)
    const first = exchange('POST', '/dsh-rrp/lore', {
      sessionId: 's1',
      action: 'manual',
      draft: DRAFT,
    })
    await host.route()!.handler(first.req, first.res)
    const second = exchange('POST', '/dsh-rrp/lore', {
      sessionId: 's1',
      action: 'manual',
      draft: DRAFT,
    })
    await host.route()!.handler(second.req, second.res)
    expect(second.res.statusCode).toBe(400)
    expect(host.lore()).toHaveLength(1)
    expect(host.appended).toHaveLength(1)
  })

  it('does not claim success when the Session append fails', async () => {
    const host = fakeHost()
    registerLoreRoute(host.ctx as never)
    host.failNextAppend()
    const manual = exchange('POST', '/dsh-rrp/lore', {
      sessionId: 's1',
      action: 'manual',
      draft: DRAFT,
    })
    await host.route()!.handler(manual.req, manual.res)
    expect(manual.res.statusCode).toBe(500)
    expect(host.lore()).toEqual([])
    expect(host.appended).toEqual([])
  })

  it('rejects a confirm with no pending draft and clears on discard', async () => {
    const host = fakeHost()
    registerLoreRoute(host.ctx as never)
    const confirm = exchange('POST', '/dsh-rrp/lore', { sessionId: 's1', action: 'confirm' })
    await host.route()!.handler(confirm.req, confirm.res)
    expect(confirm.res.statusCode).toBe(400)

    const discard = exchange('POST', '/dsh-rrp/lore', { sessionId: 's1', action: 'discard' })
    await host.route()!.handler(discard.req, discard.res)
    expect(discard.res.statusCode).toBe(200)
  })

  it('reports Scribe unavailability and unknown sessions', async () => {
    const host = fakeHost()
    registerLoreRoute(host.ctx as never)

    const draft = exchange('POST', '/dsh-rrp/lore', {
      sessionId: 's1',
      action: 'draft',
      topic: 'x',
    })
    await host.route()!.handler(draft.req, draft.res)
    expect(draft.res.statusCode).toBe(503)

    const missing = exchange('GET', '/dsh-rrp/lore')
    await host.route()!.handler(missing.req, missing.res)
    expect(missing.res.statusCode).toBe(400)

    const unknown = exchange('GET', '/dsh-rrp/lore?sessionId=nope')
    await host.route()!.handler(unknown.req, unknown.res)
    expect(unknown.res.statusCode).toBe(404)
  })

  it('refuses non-RP sessions with 403 on every method', async () => {
    const host = fakeHost({ agentPreset: 'assistant' })
    registerLoreRoute(host.ctx as never)

    const listed = exchange('GET', '/dsh-rrp/lore?sessionId=s1')
    await host.route()!.handler(listed.req, listed.res)
    expect(listed.res.statusCode).toBe(403)
    expect(listed.res.payload).toEqual({ error: 'not an RP session' })

    const manual = exchange('POST', '/dsh-rrp/lore', {
      sessionId: 's1',
      action: 'manual',
      draft: DRAFT,
    })
    await host.route()!.handler(manual.req, manual.res)
    expect(manual.res.statusCode).toBe(403)

    const removed = exchange('DELETE', '/dsh-rrp/lore?sessionId=s1&name=qingqiu-lore')
    await host.route()!.handler(removed.req, removed.res)
    expect(removed.res.statusCode).toBe(403)

    expect(host.lore()).toEqual([])
    expect(host.appended).toEqual([])
  })

  it('GET reports card triggers with active flags and the injected character budget', async () => {
    const card: CardContext = { id: 'trig-lore-card', name: '触发卡', persona: '', worldCore: '' }
    const state: WorldState = { ...emptyWorldState(), characters: { 米娅: { affinity: 50 } } }
    const mustCond = (src: string): WhenCondition => {
      const parsed = parseWhen(src, '测试')
      if (parsed instanceof Error) throw parsed
      return parsed
    }
    const warm: TriggerDef = {
      id: 'mia-warm',
      name: '温热',
      condition: mustCond('characters.米娅.affinity >= 40'),
      excerpt: 'abc',
    }
    const intimate: TriggerDef = {
      id: 'mia-intimate',
      name: '亲密',
      condition: mustCond('characters.米娅.affinity >= 80'),
      excerpt: 'defgh',
    }
    seedCardTriggersForTesting(card.id, [warm, intimate])
    const host = fakeHost({ card, worldState: state })
    registerLoreRoute(host.ctx as never)

    const listed = exchange('GET', '/dsh-rrp/lore?sessionId=s1')
    await host.route()!.handler(listed.req, listed.res)
    expect(listed.res.statusCode).toBe(200)
    const payload = listed.res.payload as {
      triggers: Array<{ name: string; active: boolean }>
      injectedChars: number
    }
    expect(payload.triggers).toEqual([
      { name: '温热', active: true },
      { name: '亲密', active: false },
    ])
    // Only the hit excerpt counts toward the budget.
    expect(payload.injectedChars).toBe(3)
  })

  it('GET degrades to an empty trigger view without a card or state', async () => {
    const host = fakeHost()
    registerLoreRoute(host.ctx as never)
    const listed = exchange('GET', '/dsh-rrp/lore?sessionId=s1')
    await host.route()!.handler(listed.req, listed.res)
    expect(listed.res.statusCode).toBe(200)
    const payload = listed.res.payload as { triggers: unknown[]; injectedChars: number }
    expect(payload.triggers).toEqual([])
    expect(payload.injectedChars).toBe(0)
  })
})
