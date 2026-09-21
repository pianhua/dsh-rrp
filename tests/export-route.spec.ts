import { describe, expect, it } from 'vitest'
import { registerExportRoute, extractNovelProse, buildNovelDocument } from '../src/export-route.ts'
import { RRP_ROUTES } from '../src/route-contract.ts'

/** Minimal message event: one text block wrapped the way the host payloads look. */
function message(role: 'user' | 'assistant', text: string, extra: Record<string, unknown> = {}) {
  return { type: role + '/message', seq: 1, data: { content: [{ type: 'text', text }], ...extra } }
}

describe('novel prose extraction (issue #31-C)', () => {
  it('keeps player and Author prose in order, drops facts and plugin notices', () => {
    const prose = extractNovelProse([
      message('user', '我把碗放下。'),
      // State facts ride plugin user messages with an rrp payload.
      {
        type: 'user/message',
        seq: 2,
        data: {
          source: { kind: 'plugin', plugin: 'dsh-rrp', rrp: { worldState: { scene: {} } } },
          content: [{ type: 'text', text: 'state write' }],
        },
      },
      message('assistant', '老者抬眼。'),
      // Plugin notices without a payload (the opening fallback) are bookkeeping.
      {
        type: 'user/message',
        seq: 4,
        data: {
          source: { kind: 'plugin', plugin: 'dsh-rrp' },
          content: [{ type: 'text', text: '开局提示' }],
        },
      },
      { type: 'session/title', seq: 5, data: {} },
      message('assistant', ''),
      message('user', '雪更大了。'),
    ] as never[])
    expect(prose).toEqual(['我把碗放下。', '老者抬眼。', '雪更大了。'])
  })

  it('builds md and txt documents with a title heading', () => {
    expect(buildNovelDocument('雪夜', ['甲', '乙'], 'md')).toBe('# 雪夜\n\n甲\n\n乙\n')
    expect(buildNovelDocument('雪夜', ['甲'], 'txt')).toBe('雪夜\n\n甲\n')
    expect(buildNovelDocument('', ['甲'], 'md')).toBe('# 未命名故事\n\n甲\n')
  })
})

describe('novel export route (issue #31-C)', () => {
  function fakeHost(events: unknown[]) {
    let closes = 0
    const persistence = {
      open: async (id: string, access: string) => {
        if (id === 'missing') throw new Error('not found')
        if (access !== 'read') throw new Error('read only')
        return {
          read: async () => ({ events: events as never[] }),
          close: async () => {
            closes += 1
          },
        }
      },
    }
    const handlers = new Map<string, (req: unknown, res: unknown) => void | Promise<void>>()
    const webServer = {
      register: (route: {
        path: string
        handler: (req: unknown, res: unknown) => void | Promise<void>
      }) => {
        handlers.set(route.path, route.handler)
        return () => {}
      },
    }
    const ctx = {
      effect: (fn: () => (() => void) | void) => fn(),
      get: (name: string) =>
        (({ webServer, sessionPersistence: persistence }) as Record<string, unknown>)[name],
    }
    return { ctx, handlers, closes: () => closes }
  }

  async function call(host: ReturnType<typeof fakeHost>, url: string, method = 'GET') {
    const req = { method, url }
    const headers: Record<string, string> = {}
    let status = 0
    let body = ''
    const res = {
      get statusCode() {
        return status
      },
      set statusCode(value: number) {
        status = value
      },
      setHeader: (name: string, value: string) => {
        headers[name] = value
      },
      end: (chunk?: string) => {
        if (chunk !== undefined) body += chunk
      },
    }
    await host.handlers.get(RRP_ROUTES.novelExport)!(req, res)
    return { status, headers, body }
  }

  it('downloads the whole story as an attachment and closes the read handle', async () => {
    const host = fakeHost([message('user', '我放下碗。'), message('assistant', '老者抬眼看我。')])
    registerExportRoute(host.ctx as never)
    const res = await call(
      host,
      '/dsh-rrp/export/novel?sessionId=s1&title=' + encodeURIComponent('雪夜·主线') + '&format=md',
    )
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/markdown')
    expect(res.headers['content-disposition']).toContain("filename*=UTF-8''")
    expect(decodeURIComponent(res.headers['content-disposition'])).toContain('雪夜·主线.md')
    expect(res.body).toBe('# 雪夜·主线\n\n我放下碗。\n\n老者抬眼看我。\n')
    expect(host.closes()).toBe(1)
  })

  it('sanitizes hostile titles and supports txt', async () => {
    const host = fakeHost([message('assistant', '正文')])
    registerExportRoute(host.ctx as never)
    const res = await call(host, '/dsh-rrp/export/novel?sessionId=s1&title=a/b:c&format=txt')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/plain')
    expect(res.body.startsWith('a_b_c')).toBe(true)
  })

  it('404s unknown sessions, 400s missing sessionId, 405s non-GET', async () => {
    const host = fakeHost([])
    registerExportRoute(host.ctx as never)
    expect((await call(host, '/dsh-rrp/export/novel?sessionId=missing')).status).toBe(404)
    expect((await call(host, '/dsh-rrp/export/novel')).status).toBe(400)
    expect((await call(host, '/dsh-rrp/export/novel?sessionId=s1', 'POST')).status).toBe(405)
  })

  it('stays silent when the host lacks sessionPersistence', () => {
    const handlers = new Map<string, unknown>()
    const webServer = {
      register: (route: { path: string }) => {
        handlers.set(route.path, route)
        return () => {}
      },
    }
    const ctx = {
      effect: (fn: () => void) => fn(),
      get: (name: string) => (({ webServer }) as Record<string, unknown>)[name],
    }
    registerExportRoute(ctx as never)
    expect(handlers.size).toBe(0)
  })
})
