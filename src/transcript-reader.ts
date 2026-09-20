/**
 * dsh-rrp — reading the session transcript out of a projection.
 *
 * The host deprecated synchronous log scans, so every prose consumer (the
 * Chronicler, the Summarizer, the Scribe, 月停) reads the folded
 * `TranscriptSlice` instead. Those readers used to live in `chronicler.ts`,
 * which made every other runner import the inference job to render text; this
 * module is their single home.
 *
 * The projection face is a structural type, so this file stays free of the
 * host plumbing in `host-faces.ts` and importable from anywhere.
 */
import { TRANSCRIPT_KEY, emptyTranscriptSlice, type TranscriptSlice } from './transcript.ts'

/** The projection read face these readers need. */
export interface ProjectionReader {
  stateOf(session: unknown, key: string): unknown
}

/** Default cap for a broad transcript handed to a drafting agent. */
export const DEFAULT_TRANSCRIPT_LIMIT = 16000
/** Cap for the prose handed to one Chronicler pass (characters, tail-biased). */
export const CHRONICLER_TRANSCRIPT_LIMIT = 8000

/**
 * Read the transcript slice, degrading to empty when the projection read
 * throws (e.g. racing session disposal) so these readers stay total.
 */
export function transcriptSliceOf(projections: ProjectionReader, session: unknown): TranscriptSlice {
  try {
    return (projections.stateOf(session, TRANSCRIPT_KEY) as TranscriptSlice | undefined) ?? emptyTranscriptSlice()
  } catch {
    return emptyTranscriptSlice()
  }
}

/** Seq of the newest prose the slice holds — the covering cursor's target. */
export function proseHeadSeqOf(projections: ProjectionReader, session: unknown): number {
  const entries = transcriptSliceOf(projections, session).entries
  return entries[entries.length - 1]?.seq ?? -1
}

/**
 * Shared renderer: non-empty slice entries as 【玩家】/【叙述】 parts, tail-capped.
 * The cap drops whole entries from the front instead of slicing mid-string, so
 * the retained head stays byte-identical across runs and keeps its prefix-cache
 * alignment for the Summarizer (H1: sliding char windows destroyed that).
 */
function renderSliceTranscript(
  slice: TranscriptSlice,
  fromIndex: number,
  minSeq: number,
  limit: number,
  maxSeq = Number.POSITIVE_INFINITY,
): string {
  const parts: string[] = []
  for (let index = fromIndex; index < slice.entries.length; index += 1) {
    const entry = slice.entries[index]
    if (entry === undefined || entry.seq <= minSeq) continue
    if (entry.seq > maxSeq) continue
    if (entry.text.length === 0) continue
    parts.push('【' + (entry.role === 'user' ? '玩家' : '叙述') + '】\n' + entry.text)
  }
  // Entry-aligned tail cap: skip leading parts until the remainder fits. Whole
  // parts only — never a mid-text cut — so surviving bytes are prefix-stable.
  let total = parts.length > 0 ? parts.length * 2 - 2 : 0
  for (const part of parts) total += part.length
  let start = 0
  while (start < parts.length && total > limit) {
    total -= (parts[start]?.length ?? 0) + 2
    start += 1
  }
  return parts.slice(start).join('\n\n')
}

/**
 * Render ONLY the latest turn's prose. The Chronicler holds the
 * full prior state, so older turns add cost without adding information.
 *
 * NOTE: the fold's front-trim (500 entries / 64k chars) may have dropped very
 * old user boundary markers; the boundary then resolves to the oldest retained
 * entry instead of the true latest turn start. Intentional and irrelevant in
 * practice — a live turn never sits 500 messages behind the slice head.
 * @param projections - the session-projection read face.
 * @param session - the session whose newest turn is rendered.
 * @returns the latest turn's prose, capped.
 */
export function latestTurnTranscriptOf(projections: ProjectionReader, session: unknown): string {
  const slice = transcriptSliceOf(projections, session)
  let start = 0
  for (let index = slice.entries.length - 1; index >= 0; index -= 1) {
    // Empty-text and plugin-notice user entries count: they mark the boundary
    // exactly like the old raw-log rule (last payload-less user/message).
    if (slice.entries[index]?.role === 'user') {
      start = index
      break
    }
  }
  return renderSliceTranscript(slice, start, -1, CHRONICLER_TRANSCRIPT_LIMIT)
}

/**
 * Render the prose the Chronicler still owes: everything after its last
 * committed fold, cut off at `throughSeq` — the boundary the scheduled pass is
 * responsible for. Turns that piled up behind a busy pass are all covered by
 * one rerun, and a newer turn is never folded before it has ended.
 * @param projections - the session-projection read face.
 * @param session - the session whose un-booked prose is rendered.
 * @param throughSeq - newest entry seq to include, inclusive.
 * @returns the un-booked prose, tail-capped at entry boundaries.
 */
export function pendingTranscriptOf(
  projections: ProjectionReader,
  session: unknown,
  throughSeq: number,
): string {
  const slice = transcriptSliceOf(projections, session)
  // The fold watermark is the cursor, never `lastStateSeq`: settings, lore and
  // summary publishes move that one too, and prose would be silently skipped.
  return renderSliceTranscript(slice, 0, slice.lastFoldSeq, CHRONICLER_TRANSCRIPT_LIMIT, throughSeq)
}

/**
 * Render the session's prose entries, tail-biased and capped.
 * @param projections - the session-projection read face.
 * @param session - the session whose prose is rendered.
 * @param limit - character cap (default {@link DEFAULT_TRANSCRIPT_LIMIT}).
 */
export function transcriptOf(
  projections: ProjectionReader,
  session: unknown,
  limit: number = DEFAULT_TRANSCRIPT_LIMIT,
): string {
  return renderSliceTranscript(transcriptSliceOf(projections, session), 0, -1, limit)
}
