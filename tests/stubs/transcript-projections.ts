/**
 * Test helper: a sessionProjections stub that serves the transcript slice by
 * folding a fake event log through the real transcript unit — the same work
 * the host projection drive does, minus the Cordis registry.
 */
import { transcriptProjection } from '../../src/projection/transcript.ts'
import { TRANSCRIPT_KEY, type TranscriptSlice } from '../../src/transcript.ts'

/** One raw log event as specs build it; the fold stamps seqs by array index. */
export type RawEvent = { type?: string; data?: unknown }

/** Fold a seq-stamped event array through the transcript unit. */
export function transcriptSliceOf(events: readonly RawEvent[]): TranscriptSlice {
  let state = transcriptProjection.init()
  events.forEach((event, index) => {
    if (event.type === undefined) return
    state = transcriptProjection.apply(state, { type: event.type, data: event.data, seq: index })
  })
  return state
}

/**
 * A projections read face: TRANSCRIPT_KEY serves the folded slice (re-folded
 * on every read, so late appends are visible); every other key delegates to
 * `stateOf`, and an undefined delegation result falls back to the slice for
 * TRANSCRIPT_KEY only.
 */
export function transcriptProjections(
  events: readonly RawEvent[],
  stateOf?: (session: unknown, key: string) => unknown,
): { stateOf(session: unknown, key: string): unknown } {
  return {
    stateOf(session: unknown, key: string) {
      if (key === TRANSCRIPT_KEY) {
        const override = stateOf?.(session, key)
        return override === undefined ? transcriptSliceOf(events) : override
      }
      return stateOf?.(session, key)
    },
  }
}
