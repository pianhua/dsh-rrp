import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { registerCardsRoute } from '../src/cards-route.ts'

function host() {
  const routes = new Map<string, { handler: (req: unknown, res: unknown) => unknown }>()
  const ctx = {
    effect: (fn: () => (() => void) | void) => fn(),
    get: (name: string) =>
      name === 'webServer'
        ? {
            register(definition: {
              path: string
              handler: (req: unknown, res: unknown) => unknown
            }) {
              routes.set(definition.path, definition)
              return () => {}
            },
          }
        : undefined,
  }
  return { ctx, routes }
}

describe('card detail route visibility boundary', () => {
  it('does not send hidden initial state or schema fields to the browser', async () => {
    const previousHome = process.env.DSH_HOME
    const home = mkdtempSync(join(tmpdir(), 'dsh-rrp-card-route-'))
    try {
      process.env.DSH_HOME = home
      const card = join(home, '.dsh-rrp', 'cards', 'secret-card')
      mkdirSync(card, { recursive: true })
      writeFileSync(card + '/card.md', '---\nid: secret-card\nname: 秘密卡\n---\n\n公开核心')
      writeFileSync(
        card + '/state.json',
        JSON.stringify({
          version: 2,
          trackedObjects: {},
          globalFields: {
            secret: {
              type: 'string',
              value: '隐藏初始状态',
              definition: 'card-defined',
              visibility: 'hidden',
            },
          },
          objectives: [],
          conflicts: [],
          cognition: [],
          relations: [],
          currentEvents: [],
        }),
      )
      writeFileSync(
        card + '/state.schema.json',
        JSON.stringify({
          version: 1,
          fields: [
            {
              id: 'secret',
              label: '隐藏字段标签',
              appliesTo: ['global'],
              type: 'string',
              component: 'text',
              visibility: 'hidden',
            },
          ],
        }),
      )
      const testHost = host()
      registerCardsRoute(testHost.ctx as never)
      const route = testHost.routes.get('/dsh-rrp/cards/one')!
      const response = {
        statusCode: 0,
        body: '',
        end(body?: string) {
          this.body = body ?? ''
        },
      }
      await route.handler({ method: 'GET', url: '/dsh-rrp/cards/one?id=secret-card' }, response)
      expect(response.statusCode).toBe(200)
      expect(response.body).not.toContain('隐藏初始状态')
      expect(response.body).not.toContain('隐藏字段标签')
      expect(response.body).not.toContain('"globalFields":{"secret"')
      expect(response.body).not.toContain('"id":"secret"')
    } finally {
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
      rmSync(home, { recursive: true, force: true })
    }
  })
})
