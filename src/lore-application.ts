import { randomUUID } from 'node:crypto'
import { recordActivity } from './activity.ts'
import { CARD_KEY, renderCardContext, type CardContext } from './card-types.ts'
import { readCard } from './cards.ts'
import {
  type AgentsService,
  type JobsService,
  type LlmService,
  type ProjectionsService,
  type ProviderRoute,
  type SessionLike,
  collectText,
  isEmptyReply,
  messageOf,
  nowIso,
  routeOf,
} from './host-faces.ts'
import { invalidateLore } from './lore-runtime.ts'
import { RRP_LORE_KEY, loreEntriesOf, type LoreEntry } from './lore-state.ts'
import { PENDING, DRAFTING } from './lore-drafts.ts'
import { SCRIBE_SYSTEM_PROMPT, buildScribePrompt, parseScribeReply } from './agents/scribe.ts'
import { transcriptOf } from './transcript-reader.ts'
import { WORLD_STATE_KEY, renderWorldState, type WorldState } from './world-state.ts'

const TAG = '[dsh-rrp]'

export interface LoreApplicationFaces {
  llm: LlmService
  jobs: JobsService
  agents: AgentsService
  projections: ProjectionsService
}

/** Stage an externally composed draft; the player still confirms it in Lore. */
export function stageLoreDraft(sessionId: string, entry: LoreEntry): void {
  PENDING.set(sessionId, entry)
  invalidateLore(sessionId)
}

/** The active card's bundled skill names, so lore cannot take their names. */
export function reservedNames(
  projections: ProjectionsService | undefined,
  session: SessionLike,
): string[] {
  if (projections === undefined) return []
  const card = projections.stateOf(session, CARD_KEY) as CardContext | null | undefined
  if (card === null || card === undefined) return []
  const pack = readCard(card.id)
  if (pack === undefined) return []
  return pack.skills.map((skill) => skill.name ?? skill.id).filter((name) => name.length > 0)
}

function currentLore(projections: ProjectionsService, session: SessionLike): LoreEntry[] {
  return loreEntriesOf(projections.stateOf(session, RRP_LORE_KEY))
}

/** Schedule one Scribe pass. Never throws into the route. */
export function scheduleLoreDraft(
  faces: LoreApplicationFaces,
  session: SessionLike,
  topic: string,
): void {
  if (DRAFTING.has(session.id)) return
  const route = routeOf(faces.agents, session.id)
  if (route === undefined) {
    console.warn(TAG + ' Scribe skipped ' + session.id + ': no provider/model route')
    return
  }
  DRAFTING.add(session.id)
  const activityId = randomUUID()
  recordActivity(session.id, {
    id: activityId,
    at: nowIso(),
    actor: 'scribe',
    target: 'lore',
    phase: 'started',
  })
  const owner = faces.agents.get(session.id)
  try {
    faces.jobs.start({
      kind: 'scribe',
      label: '知识起草 Scribe · ' + session.id.slice(0, 8),
      ...(owner === undefined ? {} : { owner }),
      run: () => {
        const controller = new AbortController()
        let cancelled = false
        const done = runDraft(
          faces,
          session,
          route,
          topic,
          activityId,
          controller.signal,
          () => cancelled,
        )
        return {
          cancel: () => {
            cancelled = true
            controller.abort()
          },
          done,
        }
      },
    })
  } catch (error) {
    DRAFTING.delete(session.id)
    console.warn(TAG + ' Scribe could not start a job:', error)
  }
}

/** One Scribe pass: prompt -> model -> parse -> stage (never write). */
async function runDraft(
  faces: LoreApplicationFaces,
  session: SessionLike,
  route: ProviderRoute,
  topic: string,
  activityId: string,
  signal: AbortSignal,
  isCancelled: () => boolean,
): Promise<{ status: string }> {
  try {
    const state = faces.projections.stateOf(session, WORLD_STATE_KEY) as WorldState | undefined
    const worldState = state === undefined ? '（暂无状态）' : renderWorldState(state)
    const card = faces.projections.stateOf(session, CARD_KEY) as CardContext | null | undefined
    const cardBaseline = card === null || card === undefined ? '' : renderCardContext(card)
    const existing = [
      ...reservedNames(faces.projections, session),
      ...currentLore(faces.projections, session).map((skill) => skill.name),
    ]
    const transcript = transcriptOf(faces.projections, session)
    if (isEmptyReply(transcript)) {
      recordActivity(session.id, {
        id: activityId,
        at: nowIso(),
        actor: 'scribe',
        target: 'lore',
        phase: 'failed',
        detailKey: 'detail.noTranscript',
      })
      return { status: 'completed' }
    }

    const stream = faces.llm.stream({
      provider: route.provider,
      model: route.model,
      system: SCRIBE_SYSTEM_PROMPT,
      messages: [
        {
          id: randomUUID(),
          role: 'user',
          content: [
            {
              type: 'text',
              text: buildScribePrompt({ topic, transcript, worldState, cardBaseline, existing }),
            },
          ],
          source: { kind: 'plugin', plugin: 'dsh-rrp' },
        },
      ],
      sessionId: session.id,
      signal,
    })
    const text = await collectText(stream)
    if (isCancelled()) {
      recordActivity(session.id, {
        id: activityId,
        at: nowIso(),
        actor: 'scribe',
        target: 'lore',
        phase: 'failed',
        detailKey: 'detail.cancelled',
      })
      return { status: 'killed' }
    }
    // An empty stream is an infrastructure failure, NOT a "nothing to lore"
    // verdict — conflating them hid a silent-empty epidemic behind the
    // 「目前没有待确认草稿」message (same pathology the copilot route had).
    if (isEmptyReply(text)) {
      console.warn(
        TAG +
          ' Scribe EMPTY reply for ' +
          session.id +
          ' (treated as failure, not nothing-to-lore)',
      )
      recordActivity(session.id, {
        id: activityId,
        at: nowIso(),
        actor: 'scribe',
        target: 'lore',
        phase: 'failed',
        detailKey: 'detail.emptyReply',
      })
      return { status: 'failed' }
    }
    const draft = parseScribeReply(text)
    if (draft === undefined) {
      recordActivity(session.id, {
        id: activityId,
        at: nowIso(),
        actor: 'scribe',
        target: 'lore',
        phase: 'failed',
        detailKey: 'detail.nothingToLore',
      })
      return { status: 'completed' }
    }
    PENDING.set(session.id, draft)
    recordActivity(session.id, {
      id: activityId,
      at: nowIso(),
      actor: 'scribe',
      target: 'lore',
      phase: 'committed',
      detailKey: 'detail.stagedDraft',
      detailName: draft.name,
    })
    console.log(TAG + ' Scribe staged a draft for ' + session.id + ': ' + draft.name)
    return { status: 'completed' }
  } catch (error) {
    recordActivity(session.id, {
      id: activityId,
      at: nowIso(),
      actor: 'scribe',
      target: 'lore',
      phase: 'failed',
      ...(isCancelled() ? { detailKey: 'detail.cancelled' } : { detail: messageOf(error) }),
    })
    return { status: isCancelled() ? 'killed' : 'failed' }
  } finally {
    DRAFTING.delete(session.id)
  }
}
