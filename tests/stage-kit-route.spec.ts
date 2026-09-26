import { describe, expect, it } from 'vitest'
import { registerStageKitRoute } from '../src/stage-kit-route.ts'

interface FakeResponse {
  statusCode: number
  headers: Record<string, string>
  text: string | undefined
  setHeader(name: string, value: string): void
  getHeader(name: string): string | undefined
  end(body?: string | Buffer): void
}

function normalizeHeader(name: string): string {
  return name.toLowerCase()
}

function fakeWebServer() {
  const routes = new Map<string, (req: unknown, res: unknown) => void>()
  const ctx = {
    effect: (fn: () => unknown) => fn(),
    get: (name: string) =>
      name === 'webServer'
        ? {
            register: (route: { path: string; handler: (req: unknown, res: unknown) => void }) => {
              routes.set(route.path, route.handler)
              return () => undefined
            },
          }
        : undefined,
  } as never
  registerStageKitRoute(ctx)
  return routes
}

function call(routes: Map<string, (req: unknown, res: unknown) => void>, path: string) {
  const res: FakeResponse = {
    statusCode: 0,
    headers: {},
    text: undefined,
    setHeader(name, value) {
      this.headers[normalizeHeader(name)] = value
    },
    getHeader(name) {
      return this.headers[normalizeHeader(name)]
    },
    end(body) {
      this.text = typeof body === 'string' ? body : undefined
    },
  }
  routes.get(path)?.({ method: 'GET', url: path }, res)
  return { status: res.statusCode, headers: res.headers, text: res.text }
}

describe('/dsh-rrp/stage-kit routes', () => {
  it('serve the bundled kit.css and kit.js with correct types and CORS', () => {
    const routes = fakeWebServer()
    const css = call(routes, '/dsh-rrp/stage-kit/kit.css')
    expect(css.status).toBe(200)
    expect(css.headers['content-type']).toContain('text/css')
    expect(css.headers['access-control-allow-origin']).toBe('*')
    expect(css.headers['etag']).toBeDefined()
    expect(css.text).toContain('.rrp-stage')

    const js = call(routes, '/dsh-rrp/stage-kit/kit.js')
    expect(js.status).toBe(200)
    expect(js.headers['content-type']).toContain('javascript')
    expect(js.text).toContain('window.rrpKit')
  })

  it('returns 304 on matching ETag', () => {
    const routes = fakeWebServer()
    const first = call(routes, '/dsh-rrp/stage-kit/kit.css')
    const etag = first.headers['etag']
    const res: FakeResponse = {
      statusCode: 0,
      headers: {},
      text: undefined,
      setHeader(name, value) {
        this.headers[normalizeHeader(name)] = value
      },
      getHeader(name) {
        return normalizeHeader(name) === 'if-none-match' ? etag : undefined
      },
      end(body) {
        this.text = typeof body === 'string' ? body : undefined
      },
    }
    routes.get('/dsh-rrp/stage-kit/kit.css')?.(
      { method: 'GET', url: '/dsh-rrp/stage-kit/kit.css' },
      res,
    )
    expect(res.statusCode).toBe(304)
  })
})
