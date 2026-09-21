/**
 * dsh-rrp — the card workspace route (issue #37, 「一卡一区」).
 *
 * One workspace per card is the save-grouping unit: every session created
 * for a card lands in the card's own workspace (forks re-attach natively via
 * the host's forkWorkspace lineage walk), so the roster shows one drawer per
 * card holding exactly that card's saves and branches — never the ungrouped
 * soup of coding sessions and other cards.
 *
 * The route only ENSURES the adoption, idempotently:
 *   mkdir -p <dshHome>/.dsh-rrp/saves/<cardId>
 *   registry.create(dir, cardName)   — same canonical path returns the record
 *   drifted title → setTitle(cardName) — a renamed card reclaims its drawer
 * The client then creates sessions with the returned workspaceId; the host
 * attach validates cwd === workspace path itself. All host verbs, zero
 * parallel world. Missing workspaceRegistry → 503 and the client falls back
 * to the old ungrouped flow rather than blocking a play session.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { harnessHome } from './home.ts'
import { isCardId } from './preset-id.ts'
import { RRP_ROUTES } from './route-contract.ts'
import { type RuntimeFaces, type WebServerService, readJsonBody, face, send } from './host-faces.ts'

const TAG = '[dsh-rrp]'
const PATH = RRP_ROUTES.cardWorkspace

interface WorkspaceEntityLike {
  readonly id: string
  readonly path: string
  readonly title: string
  setTitle?(title: string): Promise<unknown>
}

interface WorkspaceRegistryLike {
  create(path: string, title: string): Promise<WorkspaceEntityLike>
  resolveByPath?(path: string): Promise<WorkspaceEntityLike | undefined>
}

/** The card's save-group directory (also the sessions' cwd inside the group). */
export function cardSaveDir(cardId: string, home: string = harnessHome()): string {
  return join(home, '.dsh-rrp', 'saves', cardId)
}

/**
 * Register the card-workspace ensure route.
 * @param ctx - the host context owning the registration.
 */
export function registerCardWorkspaceRoute(ctx: Context): void {
  const runtime = ctx as unknown as RuntimeFaces
  const webServer = face<WebServerService>(runtime, 'webServer')
  if (webServer === undefined) {
    console.warn(TAG + ' card workspace route idle (missing webServer)')
    return
  }

  ctx.effect(() => {
    const dispose = webServer.register({
      kind: 'exact',
      path: PATH,
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          send(res, 405, { error: 'method not allowed' })
          return
        }
        const body = await readJsonBody(req)
        if (body === undefined) {
          send(res, 400, { error: 'invalid JSON body' })
          return
        }
        const request = body as { cardId?: unknown; cardName?: unknown }
        if (typeof request.cardId !== 'string' || !isCardId(request.cardId)) {
          send(res, 400, { error: 'invalid cardId' })
          return
        }
        if (typeof request.cardName !== 'string' || request.cardName.trim().length === 0) {
          send(res, 400, { error: 'invalid cardName' })
          return
        }
        const cardName = request.cardName.trim()

        // Lazy probe per request: the registry may mount after this plugin,
        // and a missing one must degrade the client flow, not arm-time.
        const registry = face<WorkspaceRegistryLike>(runtime, 'workspaceRegistry')
        if (registry === undefined) {
          send(res, 503, { error: 'workspaceRegistry unavailable' })
          return
        }

        let dir: string
        try {
          dir = cardSaveDir(request.cardId)
          mkdirSync(dir, { recursive: true })
        } catch (error) {
          send(res, 500, { error: 'save dir creation failed: ' + String(error) })
          return
        }

        try {
          const prior =
            typeof registry.resolveByPath === 'function'
              ? await registry.resolveByPath(dir)
              : undefined
          const workspace = await registry.create(dir, cardName)
          // The registry keeps the existing record (and its title) on reuse;
          // a renamed card must not leave its drawer under the old name.
          if (
            prior !== undefined &&
            workspace.title !== cardName &&
            typeof workspace.setTitle === 'function'
          ) {
            await workspace.setTitle(cardName)
          }
          send(res, 200, {
            ok: true,
            workspaceId: workspace.id,
            path: workspace.path,
            created: prior === undefined,
          })
        } catch (error) {
          send(res, 500, { error: 'workspace ensure failed: ' + String(error) })
        }
      },
    })
    console.log(TAG + ' card workspace route armed at ' + PATH)
    return dispose
  }, 'dsh-rrp: card workspace route')
}
