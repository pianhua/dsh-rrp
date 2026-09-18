/**
 * dsh-rrp — the TranscriptSlice session-projection unit.
 *
 * The host deprecated synchronous session-event reads, so every consumer that
 * used to scan the log (Chronicler transcripts, state-publisher adoption,
 * sediment presence) now folds this unit incrementally and reads the slice.
 *
 * Host-only unit: no client view. The host registry supports wire-less units
 * (a dedicated register() overload; wire-less keys are omitted from client
 * snapshots and served by stateOf like any other unit).
 *
 * Unrelated events return the SAME state reference, letting the registry's
 * Object.is gate do zero downstream work.
 */
import { z } from 'zod'
import { messageTextOf, rrpPayloadOf } from '../state-payload.ts'
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
  card: z.object({ fingerprint: z.string() }).optional(),
  facts: z.object({ text: z.string() }).optional(),
  sedimentSeen: z.boolean(),
})

/**
 * True for plugin-issued notices WITHOUT an rrp payload (e.g. the opening
 * fallback notice appended by start.ts): they are bookkeeping, never player
 * prose. A user notice still marks a turn boundary (an empty entry); an
 * assistant notice is skipped entirely.
 */
function isPluginNotice(event: { type: string; data?: unknown }): boolean {
  const source = (event.data as { source?: { kind?: unknown } } | undefined)?.source
  return source?.kind === 'plugin' && rrpPayloadOf(event) === undefined
}

/** Recursively collect { type: 'text', text } blocks from an event payload. */
function collectTextBlocks(value: unknown, out: string[]): void {
  if (value === null || value === undefined) return
  if (Array.isArray(value)) {
    for (const item of value) collectTextBlocks(item, out)
    return
  }
  if (typeof value !== 'object') return
  const record = value as Record<string, unknown>
  if (record.type === 'text' && typeof record.text === 'string') {
    out.push(record.text)
    return
  }
  for (const item of Object.values(record)) collectTextBlocks(item, out)
}

/** The projection definition registered into `ctx.sessionProjections`. */
export const transcriptProjection = {
  key: TRANSCRIPT_KEY,
  stateSchema: transcriptSchema,
  stateVersion: 1,
  init: (): TranscriptSlice => emptyTranscriptSlice(),
  apply: (state: TranscriptSlice, event: { type: string; data?: unknown; seq?: number }): TranscriptSlice => {
    if (event.type !== 'user/message' && event.type !== 'assistant/message') return state
    // Defensive: without a usable seq the readers' seq comparisons are meaningless.
    const seq = event.seq
    if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0) return state

    const payload = rrpPayloadOf(event)
    if (payload !== undefined) {
      // State-bearing write: adopt lanes, never prose. Always a new reference.
      const next: TranscriptSlice = { ...state, lastStateSeq: seq }
      if (payload.card !== undefined) {
        next.card = { fingerprint: messageTextOf(event) + '\u0000card=' + payload.card.id }
      }
      if (payload.worldState !== undefined || payload.summary !== undefined
        || payload.settings !== undefined || payload.sediment !== undefined) {
        next.facts = { text: messageTextOf(event) }
      }
      if (payload.sediment !== undefined) next.sedimentSeen = true
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
    // User messages always append — even empty text or a plugin notice, which
    // remain turn-boundary markers (renderers skip empty entries).
    const entries = [...state.entries, { seq, role: event.type === 'user/message' ? 'user' as const : 'assistant' as const, text }]
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
