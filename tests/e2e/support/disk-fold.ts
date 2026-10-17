/**
 * tests/e2e/support/disk-fold.ts — 独立读盘：绕开投影注册表，从会话日志 JSONL 本身
 * 折叠 `source.rrp` 载荷并比对我们自己的投影读数。
 *
 * 为什么存在（play-e2e 票据 04）：界面/投影通过 ≠ 落盘正确。投影是宿主进程内折叠的
 * 派生态；这条链要守的是「日志本身 fold 出来的世界状态、时间线与折叠游标」和投影一致。
 * 纯折叠部分（foldEvents 等）不碰文件系统，单测直接喂合成事件；读盘部分只有
 * readSessionEvents 一个薄 I/O 壳，由 e2e 现场真实日志驱动。
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  collectTextBlocks,
  isHostReminder,
  isPluginNotice,
  messageTextOf,
  rrpPayloadOf,
} from '../../../src/state-payload.ts'
import {
  WORLD_STATE_TIMELINE_VERSION,
  foldWorldStateTimeline,
  isWorldStateTimelineBatch,
  type WorldStateTimeline,
} from '../../../src/world-state-timeline.ts'

/** One event decoded from the session log (the host stamps every row with its log seq). */
export interface LoggedEvent {
  seq: number
  type: string
  data?: unknown
}

/** The independent fold result, mirroring the projection semantics for the rrp lanes. */
export interface DiskFold {
  /** All decoded events in log order (header excluded). */
  events: LoggedEvent[]
  /** Last `source.rrp.worldState` payload folded from the log (undefined when none). */
  worldState: unknown
  /** WorldState timeline: every valid batch folded in commit order. */
  timeline: WorldStateTimeline
  /** Chronicler resume cursor: newest `stateFoldSeq` riding a worldState payload. */
  lastFoldSeq: number
  /** Seq of the newest state-bearing rrp event (worldState or summary), -1 when none. */
  lastStateSeq: number
  /** Model-facing text of every facts-lane message, in commit order (metadata-lane guard). */
  factsTexts: Array<{ seq: number; text: string }>
}

const SURFACE_EVENT_TYPES = new Set(['system/message', 'user/message', 'assistant/message'])

/**
 * The first surface event of the session — V4 requires it to be the protected
 * `system/message` head (src/start.ts); anything else means the invariant broke.
 */
export function firstSurfaceEvent(events: ReadonlyArray<LoggedEvent>): LoggedEvent | undefined {
  return events.find((event) => SURFACE_EVENT_TYPES.has(event.type))
}

/**
 * Fold raw log events into the independent view. Mirrors src/projection/transcript.ts for
 * the rrp lanes: state-bearing payloads are never prose and advance only their own cursors.
 */
export function foldEvents(events: ReadonlyArray<LoggedEvent>): DiskFold {
  const fold: DiskFold = {
    events: [...events],
    worldState: undefined,
    timeline: { version: WORLD_STATE_TIMELINE_VERSION, batches: [] },
    lastFoldSeq: -1,
    lastStateSeq: -1,
    factsTexts: [],
  }
  for (const event of events) {
    const payload = rrpPayloadOf(event)
    if (payload === undefined) continue
    if (payload.worldState !== undefined) {
      fold.worldState = payload.worldState
      fold.lastStateSeq = event.seq
      if (typeof payload.stateFoldSeq === 'number') fold.lastFoldSeq = payload.stateFoldSeq
    } else if (payload.summary !== undefined) {
      fold.lastStateSeq = event.seq
    }
    if (isWorldStateTimelineBatch(payload.worldStateTimelineBatch)) {
      fold.timeline = foldWorldStateTimeline(fold.timeline, payload.worldStateTimelineBatch)
    }
    if (
      payload.worldState !== undefined ||
      payload.summary !== undefined ||
      payload.settings !== undefined ||
      payload.sediment !== undefined
    ) {
      fold.factsTexts.push({ seq: event.seq, text: messageTextOf(event) })
    }
  }
  return fold
}

/**
 * Prose entries the way the transcript projection folds them: rrp lanes are never prose,
 * host reminders are dropped, assistant empties/notices render nothing. User messages
 * always count (turn-boundary markers keep their possibly-empty text).
 */
export function proseEntries(events: ReadonlyArray<LoggedEvent>): Array<{
  seq: number
  role: 'user' | 'assistant'
  text: string
}> {
  const entries: Array<{ seq: number; role: 'user' | 'assistant'; text: string }> = []
  for (const event of events) {
    if (event.type !== 'user/message' && event.type !== 'assistant/message') continue
    if (rrpPayloadOf(event) !== undefined) continue
    const blocks: string[] = []
    collectTextBlocks(event.data, blocks)
    const text = blocks.join('\n').trim()
    if (event.type === 'assistant/message' && (text.length === 0 || isPluginNotice(event))) {
      continue
    }
    if (event.type === 'user/message' && isHostReminder(text)) continue
    entries.push({
      seq: event.seq,
      role: event.type === 'user/message' ? 'user' : 'assistant',
      text,
    })
  }
  return entries
}

function isLoggedEvent(value: unknown): value is LoggedEvent {
  if (value === null || typeof value !== 'object') return false
  const record = value as { seq?: unknown; type?: unknown }
  return typeof record.seq === 'number' && typeof record.type === 'string'
}

/**
 * Read one session's events straight from the JSONL persistence root ($DSH_HOME/sessions).
 * The e2e profile pins the backend to `compression: 'none'`, so rows are plaintext JSON;
 * the first row of each artifact is the session header (`{type:'session', id, …}`).
 * @param sessionsRoot - the host's session-persistence root directory.
 * @param sessionId - the durable session identity to select.
 * @returns all decoded events sorted by seq (newest generation wins on a seq collision).
 */
export async function readSessionEvents(
  sessionsRoot: string,
  sessionId: string,
): Promise<LoggedEvent[]> {
  const files: string[] = []
  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(path)
    }
  }
  await walk(sessionsRoot)

  const bySeq = new Map<number, LoggedEvent>()
  for (const file of files) {
    let lines: string[]
    try {
      lines = (await readFile(file, 'utf8')).split('\n')
    } catch {
      continue
    }
    const headerLine = lines.find((line) => line.trim().length > 0)
    if (headerLine === undefined) continue
    let header: { type?: unknown; id?: unknown }
    try {
      header = JSON.parse(headerLine) as { type?: unknown; id?: unknown }
    } catch {
      continue
    }
    if (header.type !== 'session' || header.id !== sessionId) continue
    for (const line of lines) {
      if (line.trim().length === 0) continue
      let value: unknown
      try {
        value = JSON.parse(line)
      } catch {
        continue
      }
      if (isLoggedEvent(value)) bySeq.set(value.seq, value)
    }
  }
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq)
}
