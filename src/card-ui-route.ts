/**
 * dsh-rrp — the card UI asset route (issue #18, stage v2).
 *
 * Serves one card's validated UI declaration (`file=manifest.json`) and the
 * whole `ui/` asset tree (html/css/js/images/fonts/audio) to the Stage panel.
 * The card pack lives outside the session workspace, so the host resource
 * protocol cannot reach it — this route is the deliberate, read-only door.
 *
 * Guards: canonical card id, user-root-then-shipped resolution, path traversal,
 * extension whitelist, directory indexing prohibition, and per-file ETag. Every
 * response carries `Access-Control-Allow-Origin: *` so opaque-origin iframes
 * can load `@font-face`, fetch and ESM dependencies from the card's own files.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { cardDirOf, readCard, shippedCardRoot } from './cards.ts'
import { isUiAssetName, loadUiManifest, UI_MANIFEST_FILE } from './card-ui.ts'
import { isCardId } from './preset-id.ts'
import { RRP_ROUTES, type CardUiResponse } from './route-contract.ts'
import {
  type RequestLike,
  type ResponseLike,
  type RuntimeFaces,
  type WebServerService,
  queryOf,
  face,
  send,
} from './host-faces.ts'
import { assembleSandboxDoc } from './ui-bridge.ts'

const TAG = '[dsh-rrp]'
const UI_PATH = RRP_ROUTES.cardUi
/** One card HTML page, capped: a bespoke panel is a screen, not an application bundle. */
const UI_HTML_MAX_BYTES = 256 * 1024

const UI_ASSET_CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
}

const TEXT_ASSET_EXTENSIONS = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg'])

/** The directory one card id resolves to (user copy wins), or undefined. */
function resolveCardDir(card: string): string | undefined {
  if (!isCardId(card)) return undefined
  const owned = cardDirOf(card)
  if (owned !== undefined) return owned
  const shipped = join(shippedCardRoot(), card)
  return existsSync(join(shipped, 'card.md')) ? shipped : undefined
}

function contentTypeOf(file: string): string {
  const ext = ('.' + file.split('.').pop()?.toLowerCase()) as string
  return UI_ASSET_CONTENT_TYPES[ext] ?? 'application/octet-stream'
}

function isTextAsset(file: string): boolean {
  const ext = ('.' + file.split('.').pop()?.toLowerCase()) as string
  return TEXT_ASSET_EXTENSIONS.has(ext)
}

function etagOf(stats: { mtime: Date; size: number }): string {
  return 'W/"' + stats.mtime.getTime().toString(16) + '-' + String(stats.size) + '"'
}

function setCorsHeaders(res: { setHeader?(name: string, value: string): void }): void {
  res.setHeader?.('Access-Control-Allow-Origin', '*')
  res.setHeader?.('Cache-Control', 'no-cache')
}

/** Serve one on-disk asset with content-type, ETag, 304, and CORS. */
function serveAsset(
  res: {
    statusCode: number
    setHeader?(name: string, value: string): void
    end(body?: string | Buffer): void
  },
  filePath: string,
): void {
  const stats = statSync(filePath)
  if (stats.isDirectory()) {
    res.statusCode = 404
    res.end('not found')
    return
  }
  const etag = etagOf(stats)
  // res.getHeader is not in our narrow face, so read the raw object when present.
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
  const file = filePath.split(/[\\/]/).pop() ?? ''
  res.statusCode = 200
  res.setHeader?.('content-type', contentTypeOf(file))
  res.setHeader?.('ETag', etag)
  const text = isTextAsset(file)
  res.end(text ? readFileSync(filePath, 'utf8') : readFileSync(filePath))
}

/**
 * Serve one resolved (card, file) pair: the manifest, a wrapped HTML page, or
 * a raw asset. Shared by the query-param and the path-segment route forms.
 */
function serveCardUi(res: ResponseLike, card: string, file: string): void {
  const dir = resolveCardDir(card)
  if (dir === undefined) {
    send(res, 404, { error: 'unknown card' } satisfies CardUiResponse)
    return
  }
  setCorsHeaders(res)
  if (file === UI_MANIFEST_FILE) {
    const initialState = readCard(card)?.initialState ?? null
    const loaded = loadUiManifest(dir, initialState)
    if (loaded.kind === 'absent') send(res, 200, { absent: true } satisfies CardUiResponse)
    else if (loaded.kind === 'error')
      send(res, 422, { error: loaded.error } satisfies CardUiResponse)
    else send(res, 200, { manifest: loaded.manifest } satisfies CardUiResponse)
    return
  }
  if (!isUiAssetName(file)) {
    send(res, 400, {
      error: '只接受 ui/ 目录下扩展名白名单内的相对路径',
    } satisfies CardUiResponse)
    return
  }
  const asset = join(dir, 'ui', file)
  if (!existsSync(asset)) {
    send(res, 404, { error: 'unknown ui file' } satisfies CardUiResponse)
    return
  }
  if (file.endsWith('.html')) {
    const stats = statSync(asset)
    if (stats.size > UI_HTML_MAX_BYTES) {
      send(res, 413, { error: 'ui 文件超过 256KB 上限' } satisfies CardUiResponse)
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
    setCorsHeaders(res)
    res.statusCode = 200
    res.setHeader?.('content-type', 'text/html; charset=utf-8')
    res.setHeader?.('ETag', etag)
    res.end(assembleSandboxDoc(readFileSync(asset, 'utf8')))
    return
  }
  serveAsset(res, asset)
}

function methodGuarded(req: RequestLike, res: ResponseLike, run: () => void): void {
  if (req.method !== undefined && req.method !== 'GET') {
    send(res, 405, { error: 'method not allowed' })
    return
  }
  try {
    run()
  } catch (error) {
    send(res, 500, { error: String(error) })
  }
}

/**
 * Register the read-only card UI routes: the legacy query-param form
 * (`/dsh-rrp/card-ui?card=&file=`) and the path-segment form
 * (`/dsh-rrp/card-ui/<card>/<file>`) that sandboxed pages need so relative
 * asset URLs resolve inside the iframe document.
 * @param ctx - the host context owning the registration.
 */
export function registerCardUiRoute(ctx: Context): void {
  const runtime = ctx as unknown as RuntimeFaces
  const webServer = face<WebServerService>(runtime, 'webServer')
  if (webServer === undefined) {
    console.warn(TAG + ' card UI route idle (missing webServer)')
    return
  }

  ctx.effect(() => {
    const disposeExact = webServer.register({
      kind: 'exact',
      path: UI_PATH,
      handler: (req, res) =>
        methodGuarded(req, res, () => {
          const query = queryOf(req)
          serveCardUi(res, query?.get('card') ?? '', query?.get('file') ?? UI_MANIFEST_FILE)
        }),
    })
    // Prefix form: the host matches `${path}/…`, so the path itself carries no
    // trailing slash (the exact table above still wins for the bare path).
    const disposePrefix = webServer.register({
      kind: 'prefix',
      path: UI_PATH,
      handler: (req, res) =>
        methodGuarded(req, res, () => {
          const pathname = new URL(req.url ?? '', 'http://localhost').pathname
          const rest = decodeURIComponent(pathname.slice((UI_PATH + '/').length))
          const slash = rest.indexOf('/')
          const card = slash === -1 ? rest : rest.slice(0, slash)
          const file = slash === -1 ? UI_MANIFEST_FILE : rest.slice(slash + 1)
          serveCardUi(res, card, file)
        }),
    })
    console.log(TAG + ' card UI route armed at ' + UI_PATH + ' (+ path form)')
    return () => {
      disposePrefix()
      disposeExact()
    }
  }, 'dsh-rrp: card UI route')
}
