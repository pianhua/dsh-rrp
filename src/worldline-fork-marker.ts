import type { Context } from '@deepseek-ai/cordis'
import type { ProjectionsService, SessionLike, SessionsService } from './host-faces.ts'
import { face, type ListeningRuntimeFaces } from './host-faces.ts'
import { WORLDLINE_DIGEST_KEY, type WorldlineDigest } from './worldline-digest.ts'
import { publishWorldlineForkCut } from './state-publisher.ts'

interface ForkSession extends SessionLike {
  readonly inheritedEventCount?: number
  readonly header?: {
    readonly parentSession?: string
    readonly isSeeded?: boolean
    readonly origin?: string
  }
}

export function isWorldlineFork(session: ForkSession): boolean {
  return (
    session.header?.parentSession !== undefined &&
    session.header.isSeeded === true &&
    session.header.origin !== 'subagent'
  )
}

export function validInheritedEventCount(value: number | undefined): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

export function forkCutTurn(
  digest: WorldlineDigest | undefined,
  inheritedEventCount: number,
): number | null {
  if (digest === undefined) return null
  const last = [...digest.turns].reverse().find((entry) => entry.seq < inheritedEventCount)
  return last === undefined ? null : last.turn + 1
}

export interface WorldlineForkMarkerFaces {
  sessions: Pick<SessionsService, 'get'>
  projections: ProjectionsService
  publish?: typeof publishWorldlineForkCut
}

export function publishWorldlineForkMarker(
  child: ForkSession,
  faces: WorldlineForkMarkerFaces,
): boolean {
  if (!isWorldlineFork(child)) return false
  const parentId = child.header!.parentSession!
  const parent = faces.sessions.get(parentId) as ForkSession | undefined
  if (parent === undefined) return false
  const digest = faces.projections.stateOf(parent, WORLDLINE_DIGEST_KEY) as
    WorldlineDigest | undefined
  const turn = forkCutTurn(digest, validInheritedEventCount(child.inheritedEventCount))
  return (faces.publish ?? publishWorldlineForkCut)(parent, child.id, turn)
}

export function registerWorldlineForkMarker(ctx: Context): void {
  const runtime = ctx as unknown as ListeningRuntimeFaces
  const sessions = face<SessionsService>(runtime, 'sessions')
  const projections = face<ProjectionsService>(runtime, 'sessionProjections')
  if (sessions === undefined || projections === undefined) return
  ctx.effect(() => {
    const published = new Set<string>()
    return runtime.on('session/created', (...args: unknown[]) => {
      try {
        const child = args[0] as ForkSession | undefined
        if (child === undefined || published.has(child.id) || !isWorldlineFork(child)) return
        if (publishWorldlineForkMarker(child, { sessions, projections })) published.add(child.id)
      } catch (cause) {
        console.warn('[dsh-rrp] worldline fork marker failed: ' + String(cause))
      }
    })
  }, 'dsh-rrp: worldline fork markers')
}
