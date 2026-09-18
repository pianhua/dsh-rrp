/**
 * dsh-rrp — TranscriptSlice: the incremental answer to deprecated history reads.
 *
 * The host deprecated synchronous session-event reads (decision note:
 * .agents/notes/implemented/architecture/2026-09-09-deprecate-synchronous-session-event-reads.md):
 * consumers must maintain derived state incrementally in session projections
 * and read the projection instead of scanning the log. This slice is that
 * derived state for prose: the Chronicler/Summarizer/Scribe transcript, the
 * state-publisher adoption lanes, and the sediment-presence flag all fold
 * here, event by event.
 *
 * Dependency-free vocabulary shared by the host projection fold
 * (src/projection/transcript.ts) and its consumers. Keep this module free
 * of node/zod imports.
 */

/** Projection key under which the transcript slice is registered/read. */
export const TRANSCRIPT_KEY = 'rrpTranscript'

/** One prose message folded from the log, in commit order. */
export interface TranscriptEntry {
  /** Seq of the source event (log index); the fold stamps every entry. */
  seq: number
  role: 'user' | 'assistant'
  /** Trimmed prose; may be '' for turn-boundary markers and plugin notices. */
  text: string
}

/**
 * The incremental transcript slice. `entries` is a capped, append-only tail;
 * the scalar fields track the latest state-bearing event for each consumer
 * that used to re-scan the log.
 */
export interface TranscriptSlice {
  /** Capped tail of prose entries, append-only. */
  entries: TranscriptEntry[]
  /** Seq of the latest rrp-bearing event, -1 when none. */
  lastStateSeq: number
  /** Latest card-lane adoption (fingerprint per cardFingerprint semantics). */
  card?: { fingerprint: string }
  /** Latest facts-lane adoption text. */
  facts?: { text: string }
  /** Any rrp payload with sediment !== undefined, ever. */
  sedimentSeen: boolean
  /** Turn number of the latest summary publish, -1 when none (durable watermark). */
  lastSummaryTurn: number
}

/** The empty slice: no events folded yet. */
export function emptyTranscriptSlice(): TranscriptSlice {
  return { entries: [], lastStateSeq: -1, sedimentSeen: false, lastSummaryTurn: -1 }
}
