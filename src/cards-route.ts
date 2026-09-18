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
import { listCards, readCard } from './cards.ts'
import { ensureCardPreset } from './preset.ts'

const TAG = '[dsh-rrp]'
/** Exact read paths; the list returns summaries, \`one\` takes the whole pack. */
const LIST_PATH = '/dsh-rrp/cards'
const ONE_PATH = '/dsh-rrp/cards/one'

interface RequestLike {
  method?: string
  url?: string
}
interface ResponseLike {
  statusCode: number
  setHeader?(name: string, value: string): void
  end(body?: string): void
}
interface WebServerService {
  register(route: {
    kind: 'exact'
    path: string
    handler: (req: RequestLike, res: ResponseLike) => void | Promise<void>
  }): () => void
}
interface RuntimeFaces {
  get(name: string): unknown
}

/** Respond with a JSON body. */
function send(res: ResponseLike, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader?.('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

/**
 * Register the read-only card-pack routes.
 * @param ctx - the host context owning the registration.
 */
export function registerCardsRoute(ctx: Context): void {
  const runtime = ctx as unknown as RuntimeFaces
  const webServer = runtime.get('webServer') as WebServerService | undefined
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
          send(res, 200, { cards })
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
          const id = new URL(req.url ?? '', 'http://localhost').searchParams.get('id')
          if (id === null || id.length === 0) {
            send(res, 400, { error: 'missing id' })
            return
          }
          const card = readCard(id)
          if (card === undefined) {
            send(res, 404, { error: 'unknown card' })
            return
          }
          send(res, 200, { card })
        } catch (error) {
          send(res, 500, { error: String(error) })
        }
      },
    })
    console.log(TAG + ' card routes armed at ' + LIST_PATH + ' and ' + ONE_PATH)
    return () => {
      disposeList()
      disposeOne()
    }
  }, 'dsh-rrp: card routes')
}
