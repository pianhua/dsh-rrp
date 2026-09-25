/**
 * dsh-rrp — the card-pack read route (Stage 6).
 *
 * The future card gallery reads the card list and one card's details over the
 * host webserver (HOST_ALIGNMENT: an endpoint only where one is genuinely
 * needed; never \`createServer\`). Read-only: starting a session stays the
 * client's job (ctx.sessions.create -> agentPresets.select -> prompt). All
 * handler failures degrade to a JSON error, never a crash.
 */
import type { Context } from '@deepseek-ai/cordis'
import { importCardFromJson, importCardFromPng, writeImportedCard } from './card-import.ts'
import { listCards, readCard } from './cards.ts'
import { toPlayerSafeCardPack } from './card-types.ts'
import { ensureCardPreset } from './preset.ts'

const TAG = '[dsh-rrp]'
/** Exact read paths; the list returns summaries, \`one\` takes the whole pack. */
import {
  RRP_ROUTES,
  type CardImportResponse,
  type CardListResponse,
  type CardOneResponse,
} from './route-contract.ts'
const LIST_PATH = RRP_ROUTES.cards
const ONE_PATH = RRP_ROUTES.cardOne
const IMPORT_PATH = RRP_ROUTES.cardImport

import {
  type RuntimeFaces,
  type WebServerService,
  queryOf,
  readJsonBody,
  CARD_IMPORT_BODY_LIMIT,
  face,
  send,
} from './host-faces.ts'

/**
 * Register the read-only card-pack routes.
 * @param ctx - the host context owning the registration.
 */
export function registerCardsRoute(ctx: Context): void {
  const runtime = ctx as unknown as RuntimeFaces
  const webServer = face<WebServerService>(runtime, 'webServer')
  if (webServer === undefined) {
    console.warn(TAG + ' card route idle (missing webServer)')
    return
  }

  ctx.effect(() => {
    const disposeList = webServer.register({
      kind: 'exact',
      path: LIST_PATH,
      handler: (req, res) => {
        if (req.method !== undefined && req.method !== 'GET') {
          send(res, 405, { error: 'method not allowed' })
          return
        }
        try {
          const cards = listCards()
          // A card added after boot has no rp-<id> preset yet; make it
          // startable (agentPresets.select) without a plugin reload.
          for (const card of cards) ensureCardPreset(card.id)
          send(res, 200, { cards } satisfies CardListResponse)
        } catch (error) {
          send(res, 500, { error: String(error) })
        }
      },
    })
    const disposeOne = webServer.register({
      kind: 'exact',
      path: ONE_PATH,
      handler: (req, res) => {
        if (req.method !== undefined && req.method !== 'GET') {
          send(res, 405, { error: 'method not allowed' })
          return
        }
        try {
          const id = queryOf(req)?.get('id') ?? ''
          if (id.length === 0) {
            send(res, 400, { error: 'missing id' })
            return
          }
          const card = readCard(id)
          if (card === undefined) {
            send(res, 404, { error: 'unknown card' })
            return
          }
          send(res, 200, { card: toPlayerSafeCardPack(card) } satisfies CardOneResponse)
        } catch (error) {
          send(res, 500, { error: String(error) })
        }
      },
    })
    const disposeImport = webServer.register({
      kind: 'exact',
      path: IMPORT_PATH,
      handler: async (req, res) => {
        if (req.method !== undefined && req.method !== 'POST') {
          send(res, 405, { error: 'method not allowed' })
          return
        }
        try {
          const result = await readJsonBody(req, { maxBytes: CARD_IMPORT_BODY_LIMIT })
          if (!result.ok) {
            send(res, result.status, { error: result.error })
            return
          }
          const body = result.body
          if (body.kind !== 'png' && body.kind !== 'json') {
            send(res, 400, { error: 'kind must be png or json' })
            return
          }
          if (typeof body.data !== 'string' || body.data.length === 0) {
            send(res, 400, { error: 'missing data' })
            return
          }
          const source =
            body.kind === 'png'
              ? importCardFromPng(Buffer.from(body.data, 'base64'))
              : importCardFromJson(Buffer.from(body.data, 'base64').toString('utf8'))
          if (source === undefined) {
            send(res, 422, {
              error: 'not a recognizable character card (tavern PNG / v2 / v3 JSON)',
            })
            return
          }
          const written = writeImportedCard(source)
          if (written === undefined) {
            send(res, 500, { error: 'could not allocate a card id' })
            return
          }
          send(res, 200, { ok: true, ...written } satisfies CardImportResponse)
        } catch (error) {
          send(res, 500, { error: String(error) })
        }
      },
    })
    console.log(TAG + ' card routes armed at ' + LIST_PATH + ' and ' + ONE_PATH)
    return () => {
      disposeList()
      disposeOne()
      disposeImport()
    }
  }, 'dsh-rrp: card routes')
}
