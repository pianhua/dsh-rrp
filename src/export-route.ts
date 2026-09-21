/**
 * dsh-rrp — the novel export route (issue #31-C).
 *
 * GET /dsh-rrp/export/novel?sessionId=…&title=…&format=md|txt downloads the
 * session's whole story as a clean prose file: player and Author text only,
 * state facts / plugin notices / empty renders filtered out. The full log is
 * read ONCE through the host's session-persistence service (read handles work
 * on live AND cold sessions and never take write ownership), so an epic is
 * never truncated by the transcript projection's tail caps.
 */
import type { Context } from '@deepseek-ai/cordis'
import { RRP_ROUTES } from './route-contract.ts'
import { collectTextBlocks, isPluginNotice, rrpPayloadOf } from './state-payload.ts'

const TAG = '[dsh-rrp]'
const EXPORT_PATH = RRP_ROUTES.novelExport

interface SessionEventLike {
  type: string
  data?: unknown
  seq?: number
}
interface ReadHandleLike {
  read(offset?: number, length?: number): Promise<{ events: readonly SessionEventLike[] }>
  close(): Promise<void>
}
interface PersistenceService {
  open(id: string, access: 'read'): Promise<ReadHandleLike>
}
import {
  type RequestLike,
  type ResponseLike,
  type RuntimeFaces,
  queryOf,
  face,
  send,
} from './host-faces.ts'

/**
 * Extract the story prose from one session's event log, in seq order: every
 * player/assistant text block, minus state facts, plugin notices and empties.
 */
export function extractNovelProse(events: readonly SessionEventLike[]): string[] {
  const prose: string[] = []
  for (const event of events) {
    if (event.type !== 'user/message' && event.type !== 'assistant/message') continue
    if (rrpPayloadOf(event) !== undefined) continue
    // Any plugin message without an rrp payload is bookkeeping (opening
    // fallback notices, stage directions) — never novel prose, either role.
    if (isPluginNotice(event)) continue
    const blocks: string[] = []
    collectTextBlocks(event.data, blocks)
    const text = blocks.join('\n').trim()
    if (text.length === 0) continue
    prose.push(text)
  }
  return prose
}

/** Build the downloadable document; md and txt differ only in decoration. */
export function buildNovelDocument(
  title: string,
  prose: readonly string[],
  format: 'md' | 'txt',
): string {
  const heading = format === 'md' ? '# ' : ''
  const head = heading + (title.length > 0 ? title : '未命名故事')
  return head + '\n\n' + prose.join('\n\n') + '\n'
}

/**
 * Register the export route.
 * @param ctx - the host context owning the registration.
 */
export function registerExportRoute(ctx: Context): void {
  const runtime = ctx as unknown as RuntimeFaces
  const webServer = runtime.get('webServer') as
    | {
        register(route: {
          kind: 'exact'
          path: string
          handler: (req: RequestLike, res: ResponseLike) => void | Promise<void>
        }): () => void
      }
    | undefined
  const persistence = face<PersistenceService>(runtime, 'sessionPersistence')
  if (webServer === undefined || persistence === undefined) {
    console.warn(TAG + ' export route idle (missing webServer/sessionPersistence)')
    return
  }

  ctx.effect(() => {
    const dispose = webServer.register({
      kind: 'exact',
      path: EXPORT_PATH,
      handler: async (req, res) => {
        if (req.method !== undefined && req.method !== 'GET') {
          send(res, 405, { error: 'method not allowed' })
          return
        }
        const query = queryOf(req)
        const sessionId = query?.get('sessionId') ?? ''
        if (sessionId.length === 0) {
          send(res, 400, { error: 'missing sessionId' })
          return
        }
        const format = query?.get('format') === 'txt' ? 'txt' : 'md'
        // Title doubles as the download name; keep it filename-safe.
        const title = (query?.get('title') ?? '')
          .trim()
          .replace(/[\\/:*?"<>|]/g, '_')
          .slice(0, 80)

        let handle: ReadHandleLike
        try {
          handle = await persistence.open(sessionId, 'read')
        } catch {
          send(res, 404, { error: 'unknown session' })
          return
        }
        try {
          const { events } = await handle.read(0, undefined)
          const body = buildNovelDocument(title, extractNovelProse(events), format)
          const filename = encodeURIComponent((title.length > 0 ? title : 'novel') + '.' + format)
          res.statusCode = 200
          res.setHeader?.(
            'content-type',
            format === 'md' ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8',
          )
          res.setHeader?.('content-disposition', "attachment; filename*=UTF-8''" + filename)
          res.end(body)
        } catch (cause) {
          send(res, 500, { error: 'export failed: ' + String(cause) })
        } finally {
          await handle.close().catch(() => {})
        }
      },
    })
    console.log(TAG + ' export route armed at ' + EXPORT_PATH)
    return () => {
      dispose()
    }
  }, 'dsh-rrp: novel export route')
}
