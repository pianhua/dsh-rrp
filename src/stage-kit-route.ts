/**
 * dsh-rrp — official stage-kit asset route (stage v2).
 *
 * Serves the plugin-bundled `assets/stage-kit/` files to card pages under
 * `/dsh-rrp/stage-kit/kit.css` and `/dsh-rrp/stage-kit/kit.js`. Same CORS,
 * whitelist, content-type and ETag posture as the card UI asset route.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import {
  type RuntimeFaces,
  type WebServerService,
  type RequestLike,
  type ResponseLike,
  face,
} from './host-faces.ts'

const TAG = '[dsh-rrp]'
const STAGE_KIT_DIR = fileURLToPath(new URL('../assets/stage-kit/', import.meta.url))

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
}

function etagOf(stats: { mtime: Date; size: number }): string {
  return 'W/"' + stats.mtime.getTime().toString(16) + '-' + String(stats.size) + '"'
}

function serve(req: RequestLike, res: ResponseLike, fileName: string): void {
  const filePath = join(STAGE_KIT_DIR, fileName)
  if (!existsSync(filePath)) {
    res.statusCode = 404
    res.end('not found')
    return
  }
  const stats = statSync(filePath)
  if (stats.isDirectory()) {
    res.statusCode = 404
    res.end('not found')
    return
  }
  const etag = etagOf(stats)
  const ifNoneMatch =
    'getHeader' in res &&
    typeof (res as { getHeader?(name: string): unknown }).getHeader === 'function'
      ? ((res as { getHeader?(name: string): unknown }).getHeader?.('if-none-match') as
          string | undefined)
      : undefined
  if (ifNoneMatch === etag) {
    res.statusCode = 304
    res.end()
    return
  }
  const ext = ('.' + fileName.split('.').pop()?.toLowerCase()) as string
  res.statusCode = 200
  res.setHeader?.('content-type', CONTENT_TYPES[ext] ?? 'application/octet-stream')
  res.setHeader?.('Access-Control-Allow-Origin', '*')
  res.setHeader?.('Cache-Control', 'no-cache')
  res.setHeader?.('ETag', etag)
  res.end(readFileSync(filePath, 'utf8'))
}

/**
 * Register the read-only stage-kit routes.
 * @param ctx - the host context owning the registration.
 */
export function registerStageKitRoute(ctx: Context): void {
  const runtime = ctx as unknown as RuntimeFaces
  const webServer = face<WebServerService>(runtime, 'webServer')
  if (webServer === undefined) {
    console.warn(TAG + ' stage-kit route idle (missing webServer)')
    return
  }

  ctx.effect(() => {
    const disposeCss = webServer.register({
      kind: 'exact',
      path: '/dsh-rrp/stage-kit/kit.css',
      handler: (req, res) => {
        if (req.method !== undefined && req.method !== 'GET') {
          res.statusCode = 405
          res.end('method not allowed')
          return
        }
        serve(req, res, 'kit.css')
      },
    })
    const disposeJs = webServer.register({
      kind: 'exact',
      path: '/dsh-rrp/stage-kit/kit.js',
      handler: (req, res) => {
        if (req.method !== undefined && req.method !== 'GET') {
          res.statusCode = 405
          res.end('method not allowed')
          return
        }
        serve(req, res, 'kit.js')
      },
    })
    console.log(TAG + ' stage-kit routes armed')
    return () => {
      disposeCss()
      disposeJs()
    }
  }, 'dsh-rrp: stage-kit routes')
}
