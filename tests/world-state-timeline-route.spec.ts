import { describe, expect, it } from 'vitest'
import { registerWorldStateTimelineRoute } from '../src/world-state-timeline-route.ts'
import { emptyWorldState, type WorldState } from '../src/world-state.ts'
import { emptyWorldStateTimeline, type WorldStateTimeline } from '../src/world-state-timeline.ts'

function host(state: WorldState, timeline: WorldStateTimeline) {
  let route: { handler: (req: unknown, res: unknown) => Promise<void> } | undefined
  let registered = false
  let dispose: (() => void) | undefined
  const session = { id: 'timeline-session' }
  const projections = {
    stateOf: (_session: unknown, key: string) =>
      key === 'rrpWorldState' ? state : key === 'rrpWorldStateTimeline' ? timeline : undefined,
  }
  const ctx = {
    effect(fn: () => (() => void) | void) {
      const cleanup = fn()
      if (cleanup !== undefined) dispose = cleanup
      return cleanup
    },
    get(name: string) {
      return {
        webServer: {
          register(definition: { handler: (req: unknown, res: unknown) => Promise<void> }) {
            route = definition
            registered = true
            return () => {
              registered = false
            }
          },
        },
        sessions: { get: (id: string) => (id === session.id ? session : undefined) },
        sessionProjections: projections,
      }[name]
    },
  }
  registerWorldStateTimelineRoute(ctx as never)
  return { route: route!, dispose: () => dispose?.(), isRegistered: () => registered }
}

function response() {
  return {
    statusCode: 0,
    body: '',
    setHeader() {},
    end(payload?: string) {
      this.body = payload ?? ''
    },
  }
}

describe('player WorldState timeline route', () => {
  it('returns read-only timeline batches without hidden values', async () => {
    const state: WorldState = {
      ...emptyWorldState(),
      trackedObjects: {
        hidden: {
          id: 'hidden',
          kind: 'character',
          name: '幕后势力',
          visibility: 'hidden',
          fields: {},
        },
      },
    }
    const timeline: WorldStateTimeline = {
      ...emptyWorldStateTimeline(),
      batches: [
        {
          kind: 'baseline',
          snapshot: 'initial-state',
          provenance: { actor: 'initial-state' },
        },
        {
          kind: 'changes',
          changes: [
            {
              type: 'modified',
              objectId: 'hidden',
              field: 'trackedObjects.name',
              before: '旧秘密',
              after: '幕后势力',
            },
          ],
          provenance: { actor: 'chronicler', evidence: '秘密证据' },
          origin: 'local',
        },
      ],
    }
    const mounted = host(state, timeline)
    const res = response()
    await mounted.route.handler(
      { method: 'GET', url: '/dsh-rrp/world-state-timeline?sessionId=timeline-session' },
      res,
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('不公开的世界信息')
    expect(res.body).not.toContain('幕后势力')
    expect(res.body).not.toContain('秘密证据')
  })

  it('releases the host route disposer without leaving the timeline route armed', () => {
    const mounted = host(emptyWorldState(), emptyWorldStateTimeline())
    expect(mounted.isRegistered()).toBe(true)
    mounted.dispose()
    expect(mounted.isRegistered()).toBe(false)
  })
})
