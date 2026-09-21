/**
 * dsh-rrp — the card UI asset route (issue #18).
 *
 * Serves one card's validated UI declaration (`file=manifest.json`) and its
 * card-authored HTML pages (`file=<name>.html`) to the Stage panel. The card
 * pack lives outside the session workspace, so the host resource protocol
 * cannot reach it — this route is the deliberate, read-only door.
 *
 * Guards: canonical card id, user-root-then-shipped resolution, and a filename
 * that is either the fixed manifest or a bare `*.html` with no path separator.
 * Nothing else on disk is addressable, and nothing is ever written.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { cardDirOf, shippedCardRoot } from './cards.ts'
import { isUiHtmlName, loadUiManifest, UI_MANIFEST_FILE } from './card-ui.ts'
import { isCardId } from './preset-id.ts'
import { RRP_ROUTES, type CardUiResponse } from './route-contract.ts'
import { type RuntimeFaces, type WebServerService, queryOf, face, send } from './host-faces.ts'

const TAG = '[dsh-rrp]'
const UI_PATH = RRP_ROUTES.cardUi
/** One card HTML page, capped: a bespoke panel is a screen, not an application bundle. */
const UI_HTML_MAX_BYTES = 256 * 1024

/** The directory one card id resolves to (user copy wins), or undefined. */
function resolveCardDir(card: string): string | undefined {
  if (!isCardId(card)) return undefined
  const owned = cardDirOf(card)
  if (owned !== undefined) return owned
  const shipped = join(shippedCardRoot(), card)
  return existsSync(join(shipped, 'card.md')) ? shipped : undefined
}

/**
 * Register the read-only card UI route.
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
    const dispose = webServer.register({
      kind: 'exact',
      path: UI_PATH,
      handler: (req, res) => {
        if (req.method !== undefined && req.method !== 'GET') {
          send(res, 405, { error: 'method not allowed' })
          return
        }
        try {
          const query = queryOf(req)
          const card = query?.get('card') ?? ''
          const file = query?.get('file') ?? UI_MANIFEST_FILE
          const dir = resolveCardDir(card)
          if (dir === undefined) {
            send(res, 404, { error: 'unknown card' } satisfies CardUiResponse)
            return
          }
          if (file === UI_MANIFEST_FILE) {
            const loaded = loadUiManifest(dir)
            if (loaded.kind === 'absent') send(res, 200, { absent: true } satisfies CardUiResponse)
            else if (loaded.kind === 'error')
              send(res, 422, { error: loaded.error } satisfies CardUiResponse)
            else send(res, 200, { manifest: loaded.manifest } satisfies CardUiResponse)
            return
          }
          if (!isUiHtmlName(file)) {
            send(res, 400, {
              error: '只接受 manifest.json 或 ui/ 下的 *.html',
            } satisfies CardUiResponse)
            return
          }
          const page = join(dir, 'ui', file)
          if (!existsSync(page)) {
            send(res, 404, { error: 'unknown ui file' } satisfies CardUiResponse)
            return
          }
          if (statSync(page).size > UI_HTML_MAX_BYTES) {
            send(res, 413, { error: 'ui 文件超过 256KB 上限' } satisfies CardUiResponse)
            return
          }
          res.statusCode = 200
          res.setHeader?.('content-type', 'text/html; charset=utf-8')
          res.end(readFileSync(page, 'utf8'))
        } catch (error) {
          send(res, 500, { error: String(error) })
        }
      },
    })
    console.log(TAG + ' card UI route armed at ' + UI_PATH)
    return dispose
  }, 'dsh-rrp: card UI route')
}
