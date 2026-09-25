/**
 * dsh-rrp — the TranscriptSlice session-projection unit.
 *
 * The host deprecated synchronous session-event reads, so every consumer that
 * used to scan the log (Chronicler transcripts, state-publisher adoption,
 * lore presence) now folds this unit incrementally and reads the slice.
 *
 * Host-only unit: no client view. The host registry supports wire-less units
 * (a dedicated register() overload; wire-less keys are omitted from client
 * snapshots and served by stateOf like any other unit).
 *
 * Unrelated events return the SAME state reference, letting the registry's
 * Object.is gate do zero downstream work.
 */
import { z } from 'zod'
import {
  collectTextBlocks,
  isHostReminder,
  isPluginNotice,
  messageTextOf,
  rrpPayloadOf,
} from '../state-payload.ts'
import { TRANSCRIPT_KEY, emptyTranscriptSlice, type TranscriptSlice } from '../transcript.ts'

/** Tail caps: enough turns for any Chronicler/Summarizer prompt, bounded memory. */
const ENTRY_CAP = 500
const CHAR_CAP = 65536

const transcriptEntrySchema = z.object({
  seq: z.number().int().min(0),
  role: z.enum(['user', 'assistant']),
  text: z.string().max(4000),
})

/** Runtime state validator (the persisted-cache precondition). */
export const transcriptSchema = z.object({
  entries: z.array(transcriptEntrySchema),
  lastStateSeq: z.number().int(),
  // .catch: rows persisted before the fold cursor existed resume from "none".
  lastFoldSeq: z.number().int().catch(-1),
  card: z.object({ fingerprint: z.string() }).optional(),
  facts: z.object({ text: z.string() }).optional(),
  sedimentSeen: z.boolean(),
  // .catch: rows persisted before the watermark field default to "none".
  lastSummaryTurn: z.number().int().catch(-1),
})

/** The projection definition registered into `ctx.sessionProjections`. */
export const transcriptProjection = {
  key: TRANSCRIPT_KEY,
  stateSchema: transcriptSchema,
  // v2: host `<system-reminder>` user messages are dropped, exactly like the
  // worldline digest learned in v2 — they are not the player's turn, and as an
  // entry they both fed host chatter to the agents and moved the turn boundary.
  stateVersion: 2,
  init: (): TranscriptSlice => emptyTranscriptSlice(),
  apply: (
    state: TranscriptSlice,
    event: { type: string; data?: unknown; seq?: number },
  ): TranscriptSlice => {
    if (event.type !== 'user/message' && event.type !== 'assistant/message') return state
    // Defensive: without a usable seq the readers' seq comparisons are meaningless.
    const seq = event.seq
    if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0) return state

    const payload = rrpPayloadOf(event)
    if (payload !== undefined) {
      // Only state-bearing payloads reserve a Chronicler watermark. Pure plugin
      // markers (notably worldlineForkCut) must leave the transcript untouched.
      if (payload.worldState === undefined && payload.summary === undefined) return state
      // State-bearing write: adopt lanes, never prose. Always a new reference.
      const next: TranscriptSlice = { ...state, lastStateSeq: seq }
      // The Chronicler's resume cursor advances only alongside the state it
      // describes, so a fork or restart resumes from the same prose.
      if (payload.worldState !== undefined && typeof payload.stateFoldSeq === 'number') {
        next.lastFoldSeq = payload.stateFoldSeq
      }
      if (payload.card !== undefined) {
        next.card = { fingerprint: messageTextOf(event) + '\u0000card=' + payload.card.id }
      }
      if (
        payload.worldState !== undefined ||
        payload.summary !== undefined ||
        payload.settings !== undefined ||
        payload.sediment !== undefined
      ) {
        next.facts = { text: messageTextOf(event) }
      }
      if (payload.sediment !== undefined) next.sedimentSeen = true
      // Durable Summarizer watermark: the turn that produced this summary.
      if (payload.summary !== undefined && typeof payload.summaryTurn === 'number') {
        next.lastSummaryTurn = payload.summaryTurn
      }
      return next
    }

    // Prose candidate.
    const blocks: string[] = []
    collectTextBlocks(event.data, blocks)
    const text = blocks.join('\n').trim()
    if (event.type === 'assistant/message') {
      // Assistant notices/empties are never a boundary and render nothing.
      if (text.length === 0 || isPluginNotice(event)) return state
    }
    // A host reminder is neither prose nor a turn boundary: skip it whole.
    if (event.type === 'user/message' && isHostReminder(text)) return state
    // User messages always append — even empty text or a plugin notice, which
    // remain turn-boundary markers (renderers skip empty entries).
    const entries = [
      ...state.entries,
      {
        seq,
        role: event.type === 'user/message' ? ('user' as const) : ('assistant' as const),
        text,
      },
    ]
    // Front-trim while over either cap. NOTE: very old boundary markers may be
    // dropped beyond this window (intentional; irrelevant for any live turn).
    let drop = 0
    let chars = 0
    for (const entry of entries) chars += entry.text.length
    while (entries.length - drop > ENTRY_CAP || chars > CHAR_CAP) {
      chars -= entries[drop]?.text.length ?? 0
      drop += 1
    }
    return { ...state, entries: drop === 0 ? entries : entries.slice(drop) }
  },
}
