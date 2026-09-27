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

  it('exposes legal covers in list and detail responses and omits invalid ones', async () => {
    const previousHome = process.env.DSH_HOME
    const home = mkdtempSync(join(tmpdir(), 'dsh-rrp-cover-route-'))
    try {
      process.env.DSH_HOME = home
      const root = join(home, '.dsh-rrp', 'cards')
      const legal = join(root, 'cover-route')
      const invalid = join(root, 'invalid-cover-route')
      const plain = join(root, 'plain-route')
      mkdirSync(join(legal, 'ui', 'assets'), { recursive: true })
      mkdirSync(join(invalid, 'ui', 'assets'), { recursive: true })
      mkdirSync(plain, { recursive: true })
      writeFileSync(join(legal, 'ui', 'assets', 'cover.png'), 'image')
      writeFileSync(join(invalid, 'ui', 'assets', 'cover.txt'), 'image')
      writeFileSync(
        join(legal, 'card.md'),
        '---\nid: cover-route\nname: 有封面\ncover: assets/cover.png\n---\n\n核心',
      )
      writeFileSync(
        join(invalid, 'card.md'),
        '---\nid: invalid-cover-route\nname: 非法封面\ncover: assets/cover.txt\n---\n\n核心',
      )
      writeFileSync(join(plain, 'card.md'), '---\nid: plain-route\nname: 无封面\n---\n\n核心')

      const testHost = host()
      registerCardsRoute(testHost.ctx as never)
      const listResponse = {
        statusCode: 0,
        body: '',
        end(body?: string) {
          this.body = body ?? ''
        },
      }
      const listRoute = testHost.routes.get('/dsh-rrp/cards')!
      await listRoute.handler({ method: 'GET', url: '/dsh-rrp/cards' }, listResponse)
      const listed = JSON.parse(listResponse.body) as {
        cards: Array<{ id: string; cover?: string }>
      }
      expect(listed.cards.find((card) => card.id === 'cover-route')?.cover).toBe('assets/cover.png')
      expect(listed.cards.find((card) => card.id === 'invalid-cover-route')).not.toHaveProperty(
        'cover',
      )
      expect(listed.cards.find((card) => card.id === 'plain-route')).not.toHaveProperty('cover')

      const oneRoute = testHost.routes.get('/dsh-rrp/cards/one')!
      for (const id of ['cover-route', 'invalid-cover-route', 'plain-route']) {
        const response = {
          statusCode: 0,
          body: '',
          end(body?: string) {
            this.body = body ?? ''
          },
        }
        await oneRoute.handler({ method: 'GET', url: '/dsh-rrp/cards/one?id=' + id }, response)
        const detail = JSON.parse(response.body) as { card: { meta: { cover?: string } } }
        if (id === 'cover-route') expect(detail.card.meta.cover).toBe('assets/cover.png')
        else expect(detail.card.meta).not.toHaveProperty('cover')
      }
    } finally {
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
      rmSync(home, { recursive: true, force: true })
    }
  })
})
