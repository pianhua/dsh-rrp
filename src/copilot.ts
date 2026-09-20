/**
 * dsh-rrp — the Copilot advisor (route + history + undo + steward proposals).
 *
 * The Copilot (月停) lives in the right sidebar's third tab and talks to the
 * player out-of-band: their conversation history is kept OUT of the session
 * log (the narrative stream stays pure) on the host Storage domain (issue #21)
 * — plugin-owned records, host-owned durability. Its only writes into the
 * session are the same published lanes everyone else uses (WorldState facts,
 * staged lore draft) — append-only, fork-safe, and attributed `actor:
 * 'copilot'` in the activity ledger.
 *
 * Undo is honest about the append-only log: it publishes the pre-action
 * snapshot as ONE new state (a revert, not an erasure), so the ledger keeps
 * both records. One snapshot per turn, a stack of the last 10.
 *
 * Host-first: one host webserver route with SSE streaming over the raw Node
 * response, `ctx.llm.stream` with the session's own provider/model route, and
 * the non-RP 403 guard every other write path carries.
 */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { COPILOT_SYSTEM_PROMPT, buildCopilotPrompt, parseCopilotActions } from './agents/copilot.ts'
import { recordActivity } from './activity.ts'
import { CARD_KEY, renderCardContext, type CardContext } from './card-types.ts'
import { readCard } from './cards.ts'
import {
  type AgentsService,
  type LlmService,
  type ProjectionsService,
  type RequestLike,
  type ResponseLike,
  type RuntimeFaces,
  type SessionLike,
  type SessionsService,
  type WebServerService,
  acceptsRrpWrites,
  face,
  nowIso,
  queryOf,
  readJsonBody,
  routeOf,
  send,
} from './host-faces.ts'
import {
  emptyCopilotStore,
  openCopilotStore,
  type CopilotHistoryView,
  type CopilotStore,
  type CopilotStoreHandle,
  type CopilotTurn,
  type CopilotTurnAction,
  type CopilotUndoEntry,
} from './copilot-store.ts'
import { transcriptOf } from './transcript-reader.ts'
import { SUMMARY_KEY, renderMacroSummary } from './macro-summary.ts'
import { stageLoreDraft, reservedNames } from './lore-route.ts'
import { RRP_LORE_KEY, loreEntriesOf, validateLoreEntry } from './lore-state.ts'
import { publishState } from './state-publisher.ts'
import { confirmProposal, discardProposal, listProposals, stageProposal } from './steward-proposals.ts'
import { COPILOT_NO_MODEL_ROUTE, COPILOT_SSE, RRP_ROUTES, encodeSseFrame } from './route-contract.ts'
import { NO_WORLD_STATE_CHANGE, WORLD_STATE_KEY, applyConstraints, diffWorldState, emptyWorldState, pruneWorldState, renderWorldState, type DynamicFieldValue, type WorldState, type WorldStateRelation } from './world-state.ts'
import { worldStateSchema } from './projection/world-state.ts'

const TAG = '[dsh-rrp]'
const COPILOT_PATH = RRP_ROUTES.copilot
const UNDO_PATH = RRP_ROUTES.copilotUndo
const PROPOSALS_PATH = RRP_ROUTES.copilotProposals

/** Kept turns per session; the panel only renders a recent window anyway. */
const TURNS_LIMIT = 50
/** Revert snapshots kept per session. */
const UNDO_LIMIT = 10
/** Copilot turns fed back as conversation history. */
const HISTORY_FEED = 20

// ---------------------------------------------------------------------------
// History lives on the host Storage domain (see copilot-store.ts). Fork
// isolation is deliberate: sessionId keys the record, so a forked worldline
// starts with an empty advisor instead of quoting prose from its sibling.

function readCopilotHistory(handle: CopilotStoreHandle, sessionId: string): CopilotHistoryView {
  const store = handle.load(sessionId)
  return { turns: store.turns.slice(-TURNS_LIMIT), undoCount: store.undo.length }
}

// ---------------------------------------------------------------------------
// In-flight guard: one advisory turn per session at a time.

const IN_FLIGHT = new Set<string>()

/** Drop in-flight markers when a session is disposed. */
export function forgetCopilot(sessionId: string): void {
  IN_FLIGHT.delete(sessionId)
}

/** Drop every in-flight marker (plugin unload must not leave state behind). */
export function forgetAllCopilot(): void {
  IN_FLIGHT.clear()
}

/**
 * Re-render the card block from the on-disk source at question time (issue #34):
 * the CARD_KEY projection is a start-time snapshot, so without this a card-edit
 * proposal that landed mid-session would keep feeding the steward stale text.
 * The per-run player override (session projection) wins over the card's declared
 * player; a card that vanished from disk falls back to the snapshot.
 */
export function liveCardContextText(card: CardContext, home?: string): string {
  const live = readCard(card.id, home)
  if (live === undefined) return renderCardContext(card)
  return (
    renderCardContext({
      id: live.meta.id,
      name: live.meta.name,
      persona: live.persona,
      worldCore: live.worldCore,
      player: card.player ?? live.meta.player,
    }) + '\n（本区块为提问时实时读盘的卡包源文件。）'
  )
}

/** Write one SSE frame (codec shared with the panel via route-contract). */
function writeSse(res: ResponseLike, event: string, data: unknown): void {
  res.write?.(encodeSseFrame(event, data))
}

/**
 * Merge one action patch over the current state: per-name merge for
 * characters/inventory, per-field merge for scene/flags, whole-value replace
 * for relations and dynamic fields (with constraint clamping); null deletes
 * a dynamic-field key.
 */
export function mergeWorldStatePatch(prior: WorldState, patch: Record<string, unknown>): WorldState {
  const next: WorldState = structuredClone(prior)
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'characters' || key === 'inventory' || key === 'flags') {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('patch.' + key + ' 必须是对象')
      }
      const bucket = next[key] as Record<string, unknown>
      for (const [name, entry] of Object.entries(value as Record<string, unknown>)) {
        if (entry === null) {
          delete bucket[name]
        } else if (key === 'flags') {
          if (typeof entry !== 'string' && typeof entry !== 'number' && typeof entry !== 'boolean') {
            throw new Error('patch.flags.' + name + ' 必须是标量')
          }
          bucket[name] = entry
        } else {
          if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
            throw new Error('patch.' + key + '.' + name + ' 必须是对象')
          }
          bucket[name] = { ...(bucket[name] as Record<string, unknown> ?? {}), ...(entry as Record<string, unknown>) }
        }
      }
      continue
    }
    if (key === 'scene') {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('patch.scene 必须是对象')
      }
      next.scene = { ...next.scene, ...(value as Record<string, string>) }
      continue
    }
    if (key === 'relations') {
      // Whole-value replace; pruneWorldState normalizes pairs afterwards.
      if (!Array.isArray(value)) {
        throw new Error('patch.relations 必须是数组')
      }
      next.relations = value as WorldStateRelation[]
      continue
    }
    // Dynamic field: full DynamicFieldValue, clamped to its constraints.
    if (value === null) {
      delete (next as Record<string, unknown>)[key]
      continue
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('patch.' + key + ' 必须是动态字段对象或 null')
    }
    const field = value as Partial<DynamicFieldValue>
    if (field.value === undefined || (field.type !== 'number' && field.type !== 'string' && field.type !== 'boolean')) {
      throw new Error('patch.' + key + ' 需要完整的 {type, value}')
    }
    ;(next as Record<string, unknown>)[key] = applyConstraints({
      type: field.type,
      value: field.value as number | string | boolean,
      ...(typeof field.min === 'number' ? { min: field.min } : {}),
      ...(typeof field.max === 'number' ? { max: field.max } : {}),
    })
  }
  const pruned = pruneWorldState(next)
  const validated = worldStateSchema.safeParse(pruned)
  if (!validated.success) throw new Error('状态校验失败：' + validated.error.issues[0]?.message)
  return validated.data as WorldState
}

/** Register the Copilot routes. Capability-gated like every other route. */
export function registerCopilotRoute(ctx: Context): void {
  const runtime = ctx as unknown as RuntimeFaces
  const webServer = face<WebServerService>(runtime, 'webServer')
  const sessions = face<SessionsService>(runtime, 'sessions')
  const projections = face<ProjectionsService>(runtime, 'sessionProjections')
  const llm = face<LlmService>(runtime, 'llm')
  const agents = face<AgentsService>(runtime, 'agents')
  if (webServer === undefined || sessions === undefined || projections === undefined || llm === undefined || agents === undefined) {
    console.warn(TAG + ' copilot route idle (missing webServer/sessions/sessionProjections/llm/agents)')
    return
  }

  /** Shared entry validation: session exists and belongs to the RP family. */
  const resolveSession = (sessionId: string, res: ResponseLike): SessionLike | undefined => {
    const session = sessions.get(sessionId)
    if (session === undefined) {
      send(res, 404, { error: 'unknown session' })
      return undefined
    }
    if (!acceptsRrpWrites(projections, session)) {
      send(res, 403, { error: 'not an RP session' })
      return undefined
    }
    return session
  }

  ctx.effect(() => {
    // One domain open per effect; handlers await the shared promise (settles
    // once). If storage fails to open the routes answer 503 instead of
    // silently dropping history.
    let disposed = false
    const storeReady = openCopilotStore((name) => runtime.get(name)).then(({ handle }) => {
      if (disposed) {
        void handle.close()
        throw new Error('copilot store disposed before open')
      }
      return handle
    })
    const takeStore = async (): Promise<CopilotStoreHandle | undefined> => {
      try {
        return await storeReady
      } catch {
        return undefined
      }
    }

    const disposeUndo = webServer.register({
      kind: 'exact',
      path: UNDO_PATH,
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
        const sessionId = body.sessionId
        if (typeof sessionId !== 'string' || sessionId.length === 0) {
          send(res, 400, { error: 'missing sessionId' })
          return
        }
        const session = resolveSession(sessionId, res)
        if (session === undefined) return
        const store = await takeStore()
        if (store === undefined) {
          send(res, 503, { error: 'copilot history unavailable' })
          return
        }

        // Pop on the domain write chain: atomic, so racing undos cannot
        // double-spend one snapshot.
        const entry = await store.mutate(sessionId, (draft) => draft.undo.pop())
        if (entry === undefined) {
          send(res, 400, { error: 'nothing to undo' })
          return
        }
        // The revert is itself one new published state (append-only honesty):
        // the values roll back, the ledger keeps both records.
        if (!publishState(session, projections, { worldState: entry.snapshot })) {
          await store.mutate(sessionId, (draft) => { draft.undo.push(entry) })
          send(res, 500, { error: 'WorldState write failed' })
          return
        }
        recordActivity(sessionId, {
          id: randomUUID(), at: nowIso(), actor: 'copilot', target: 'world-state', phase: 'corrected',
          detailKey: 'detail.copilotUndone',
        })
        console.log(TAG + ' copilot undo restored pre-turn state for ' + sessionId)
        send(res, 200, { ok: true, digest: entry.digest, undoCount: store.load(sessionId).undo.length })
      },
    })

    const disposeProposals = webServer.register({
      kind: 'exact',
      path: PROPOSALS_PATH,
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
        const sessionId = body.sessionId
        const action = body.action
        const id = body.id
        if (typeof sessionId !== 'string' || sessionId.length === 0) {
          send(res, 400, { error: 'missing sessionId' })
          return
        }
        if (resolveSession(sessionId, res) === undefined) return
        if ((action !== 'confirm' && action !== 'discard') || typeof id !== 'string' || id.length === 0) {
          send(res, 400, { error: 'unknown action' })
          return
        }

        if (action === 'discard') {
          discardProposal(sessionId, id)
          send(res, 200, { ok: true, proposals: listProposals(sessionId) })
          return
        }

        // confirm：提案种类决定账本 target；落盘/已阅结果写一条矫正记录。
        const proposal = listProposals(sessionId).find((entry) => entry.id === id)
        const result = confirmProposal(sessionId, id)
        if (!result.ok) {
          send(res, 400, { error: result.error })
          return
        }
        recordActivity(sessionId, {
          id: randomUUID(), at: nowIso(), actor: 'copilot',
          target: proposal?.kind === 'doc-note' ? 'doc-note' : 'card', phase: 'corrected',
          detail: result.summary,
        })
        console.log(TAG + ' copilot proposal confirmed for ' + sessionId + ': ' + result.summary)
        send(res, 200, { ok: true, summary: result.summary, proposals: listProposals(sessionId) })
      },
    })

    const disposeMain = webServer.register({
      kind: 'exact',
      path: COPILOT_PATH,
      handler: async (req, res) => {
        const query = queryOf(req)
        const store = await takeStore()
        if (store === undefined) {
          send(res, 503, { error: 'copilot history unavailable' })
          return
        }

        // GET: history + undo depth. DELETE: clear history.
        if (req.method === 'GET') {
          const sessionId = query?.get('sessionId') ?? ''
          if (sessionId.length === 0) {
            send(res, 400, { error: 'missing sessionId' })
            return
          }
          if (resolveSession(sessionId, res) === undefined) return
          send(res, 200, { ...readCopilotHistory(store, sessionId), proposals: listProposals(sessionId) })
          return
        }
        if (req.method === 'DELETE') {
          const sessionId = query?.get('sessionId') ?? ''
          if (sessionId.length === 0) {
            send(res, 400, { error: 'missing sessionId' })
            return
          }
          if (resolveSession(sessionId, res) === undefined) return
          // Issue #27: this is the ONLY history-erasing path in the whole
          // plugin. Audit it loudly so a vanished record can be diagnosed
          // from the host log instead of archaeology.
          console.warn(TAG + ' copilot history DELETED for ' + sessionId
            + ' (' + String(store.load(sessionId).turns.length) + ' turns) at ' + nowIso())
          await store.remove(sessionId)
          send(res, 200, { ok: true })
          return
        }
        if (req.method !== 'POST') {
          send(res, 405, { error: 'method not allowed' })
          return
        }

        const body = await readJsonBody(req)
        if (body === undefined) {
          send(res, 400, { error: 'invalid JSON body' })
          return
        }
        const sessionId = body.sessionId
        const message = body.message
        if (typeof sessionId !== 'string' || sessionId.length === 0) {
          send(res, 400, { error: 'missing sessionId' })
          return
        }
        if (typeof message !== 'string' || message.trim().length === 0) {
          send(res, 400, { error: 'missing message' })
          return
        }
        const session = resolveSession(sessionId, res)
        if (session === undefined) return
        if (IN_FLIGHT.has(sessionId)) {
          send(res, 409, { error: 'busy' })
          return
        }
        const route = routeOf(agents, sessionId)
        if (route === undefined) {
          send(res, 503, { error: COPILOT_NO_MODEL_ROUTE })
          return
        }

        IN_FLIGHT.add(sessionId)
        try {
          await store.mutate(sessionId, (draft) => {
            draft.turns.push({ role: 'player', text: message, at: nowIso() })
            draft.turns = draft.turns.slice(-TURNS_LIMIT)
          })
          const store0 = store.load(sessionId)

          // SSE over the raw Node response.
          res.statusCode = 200
          res.setHeader?.('content-type', 'text/event-stream; charset=utf-8')
          res.setHeader?.('cache-control', 'no-cache')
          ;(res as { writeHead?: (status: number) => void }).writeHead?.(200)

          const controller = new AbortController()
          req.on?.('close', () => { controller.abort() })

          const state = (projections.stateOf(session, WORLD_STATE_KEY) as WorldState | undefined) ?? emptyWorldState()
          const card = projections.stateOf(session, CARD_KEY) as CardContext | null | undefined
          const summaryValue = projections.stateOf(session, SUMMARY_KEY)
          const lore = loreEntriesOf(projections.stateOf(session, RRP_LORE_KEY))
          const prompt = buildCopilotPrompt({
            question: message,
            card: card === null || card === undefined ? '' : liveCardContextText(card),
            worldState: renderWorldState(state),
            summary: summaryValue === null || summaryValue === undefined ? '' : renderMacroSummary(summaryValue as Parameters<typeof renderMacroSummary>[0]),
            lore: lore.map((skill) => '- ' + skill.name + '：' + skill.description).join('\n'),
            transcript: transcriptOf(projections, session),
          })

          const historyMessages = store0.turns.slice(-HISTORY_FEED, -1).map((turn) => ({
            id: randomUUID(),
            role: turn.role === 'player' ? 'user' : 'assistant',
            content: [{ type: 'text', text: turn.text }],
            source: { kind: 'plugin', plugin: 'dsh-rrp' },
          }))
          const stream = llm.stream({
            provider: route.provider,
            model: route.model,
            system: COPILOT_SYSTEM_PROMPT,
            messages: [
              ...historyMessages,
              {
                id: randomUUID(),
                role: 'user',
                content: [{ type: 'text', text: prompt }],
                source: { kind: 'plugin', plugin: 'dsh-rrp' },
              },
            ],
            sessionId,
            signal: controller.signal,
          })

          let reply = ''
          try {
            for await (const chunk of stream) {
              if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
                reply += chunk.text
                writeSse(res, COPILOT_SSE.chunk, { text: chunk.text })
              }
            }
          } catch (error) {
            if (controller.signal.aborted) {
              writeSse(res, COPILOT_SSE.error, { error: 'aborted' })
              res.end()
              return
            }
            throw error
          }

          // An empty stream is a failure, not a turn: persisting a blank
          // bubble (real-world rate was 2/3 during testing) would leave the
          // player a silent answer and feed an empty assistant message back
          // as history context. Surface the error instead; nothing is stored.
          if (reply.trim().length === 0) {
            console.warn(TAG + ' copilot EMPTY reply for ' + sessionId + ' (treated as failure, not persisted)')
            writeSse(res, COPILOT_SSE.error, { error: 'empty reply' })
            res.end()
            return
          }

          // Execute the action block, if any. Failures are reported per action
          // and never abort the turn — the player still got their answer.
          const applied: CopilotTurnAction[] = []
          const actions = parseCopilotActions(reply)
          const worldActions = actions.filter((action) => action.type === 'update_world_state')
          let priorForUndo: WorldState | undefined
          if (worldActions.length > 0) {
            priorForUndo = (projections.stateOf(session, WORLD_STATE_KEY) as WorldState | undefined) ?? emptyWorldState()
          }
          for (const action of actions) {
            try {
              if (action.type === 'update_world_state') {
                const prior = (projections.stateOf(session, WORLD_STATE_KEY) as WorldState | undefined) ?? emptyWorldState()
                const next = mergeWorldStatePatch(prior, action.patch)
                const digest = diffWorldState(prior, next)
                if (digest === NO_WORLD_STATE_CHANGE) {
                  applied.push({ kind: 'failed', error: '状态无实质变化' })
                  continue
                }
                if (!publishState(session, projections, { worldState: next })) {
                  throw new Error('WorldState write failed')
                }
                recordActivity(sessionId, {
                  id: randomUUID(), at: nowIso(), actor: 'copilot', target: 'world-state', phase: 'corrected',
                  detail: (action.reason !== undefined ? action.reason + '：' : '') + digest,
                })
                applied.push({ kind: 'world-state', digest })
                continue
              }
              // propose_card_edit / propose_doc_note: stage for player
              // confirmation in the panel — nothing touches the disk here.
              if (action.type === 'propose_card_edit') {
                stageProposal(sessionId, {
                  kind: 'card-edit',
                  card: action.proposal.card,
                  file: action.proposal.file,
                  content: action.proposal.content,
                  ...(action.proposal.reason !== undefined ? { reason: action.proposal.reason } : {}),
                })
                recordActivity(sessionId, {
                  id: randomUUID(), at: nowIso(), actor: 'copilot', target: 'card', phase: 'corrected',
                  detailKey: 'detail.stagedCardEdit', detailName: action.proposal.card + '/' + action.proposal.file,
                })
                applied.push({ kind: 'proposal', proposalKind: 'card-edit', subject: action.proposal.card + '/' + action.proposal.file })
                continue
              }
              if (action.type === 'propose_doc_note') {
                stageProposal(sessionId, { kind: 'doc-note', title: action.note.title, body: action.note.body })
                recordActivity(sessionId, {
                  id: randomUUID(), at: nowIso(), actor: 'copilot', target: 'doc-note', phase: 'corrected',
                  detailKey: 'detail.stagedDocNote', detailName: action.note.title,
                })
                applied.push({ kind: 'proposal', proposalKind: 'doc-note', subject: action.note.title })
                continue
              }
              // draft_lore: validate then stage for player confirmation.
              const existing = loreEntriesOf(projections.stateOf(session, RRP_LORE_KEY)).map((skill) => skill.name)
              const result = validateLoreEntry(action.draft, existing, reservedNames(projections, session))
              if (!result.ok) throw new Error(result.error)
              stageLoreDraft(sessionId, result.skill)
              recordActivity(sessionId, {
                id: randomUUID(), at: nowIso(), actor: 'copilot', target: 'lore', phase: 'corrected',
                detailKey: 'detail.stagedDraft', detailName: result.skill.name,
              })
              applied.push({ kind: 'lore', name: result.skill.name })
            } catch (error) {
              applied.push({ kind: 'failed', error: String((error as { message?: string })?.message ?? error) })
            }
          }
          const copilotTurn: CopilotTurn = {
            role: 'copilot',
            text: reply,
            at: nowIso(),
            ...(applied.length > 0 ? { actions: applied } : {}),
          }
          const undoCount = await store.mutate(sessionId, (draft) => {
            if (priorForUndo !== undefined && applied.some((entry) => entry.kind === 'world-state')) {
              draft.undo.push({
                id: randomUUID(),
                at: nowIso(),
                digest: applied.filter((entry): entry is { kind: 'world-state'; digest: string } => entry.kind === 'world-state').map((entry) => entry.digest).join('；'),
                snapshot: priorForUndo,
              })
              draft.undo = draft.undo.slice(-UNDO_LIMIT)
            }
            draft.turns.push(copilotTurn)
            draft.turns = draft.turns.slice(-TURNS_LIMIT)
            return draft.undo.length
          })

          writeSse(res, COPILOT_SSE.action, { applied })
          writeSse(res, COPILOT_SSE.done, { turn: copilotTurn, undoCount })
          res.end()
          console.log(TAG + ' copilot turn completed for ' + sessionId + (applied.length > 0 ? ' (' + String(applied.length) + ' action(s))' : ''))
        } catch (error) {
          console.warn(TAG + ' copilot turn failed:', error)
          try {
            writeSse(res, COPILOT_SSE.error, { error: String((error as { message?: string })?.message ?? error) })
            res.end()
          } catch {
            /* the socket may already be gone */
          }
        } finally {
          IN_FLIGHT.delete(sessionId)
        }
      },
    })

    console.log(TAG + ' copilot route armed at ' + COPILOT_PATH)
    return () => {
      disposed = true
      void storeReady.then((handle) => handle.close()).catch(() => {})
      disposeMain()
      disposeUndo()
      disposeProposals()
    }
  }, 'dsh-rrp: copilot route')
}
