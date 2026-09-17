/**
 * dsh-rrp — where our durable state lives in the session log.
 *
 * The host persistence read path refuses to interpret a log containing a
 * session event type this build does not know unless the event carries the
 * envelope's `ignorable: true` marker. Out-of-repo event names are outside the
 * generated vocabulary BY CONSTRUCTION, and `Session.append` exposes no way to
 * set `ignorable` — so a plugin that invents an event type makes every session
 * containing it unreadable ("refusing to interpret the log").
 *
 * We therefore never invent an event type. Our state rides INSIDE a known
 * `user/message` event, in the message `source` — the metadata field the model
 * never sees (only `content` reaches the provider). One context message thus
 * carries both the model-facing text and the exact structured payload that our
 * session projections fold, so nothing extra is added to the conversation.
 *
 * Dependency-free: host projections and the client may both import it.
 */
import type { CardContext } from './card-types.ts'
import type { MacroSummary } from './macro-summary.ts'
import type { RrpSettings } from './settings.ts'
import type { SedimentChange } from './sediment-state.ts'
import type { WorldState } from './world-state.ts'

/** The plugin identity stamped on every context message we own. */
export const RRP_PLUGIN = 'dsh-rrp'

/** The structured payload carried in a plugin message's `source.rrp`. */
export interface RrpStatePayload {
  /** Active card setting (session-constant). */
  card?: CardContext
  /** Complete post-change world state (whole-value rule). */
  worldState?: WorldState
  /** Complete post-change macro summary; explicit `null` clears it. */
  summary?: MacroSummary | null
  /** Complete player settings for this Session. */
  settings?: RrpSettings
  /** One incremental dynamic-lore operation for this worldline. */
  sediment?: SedimentChange
}

/**
 * Build one plugin `user/message` value carrying both the model-facing text
 * and the structured payload.
 * @param id - message id (host writers pass a UUID; tests may pass a literal).
 * @param text - the model-facing content text.
 * @param payload - the structured state hidden in `source.rrp`.
 * @returns a serializable UserMessage value.
 */
export function rrpStateMessage(id: string, text: string, payload: RrpStatePayload): Record<string, unknown> {
  return {
    id,
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'plugin', plugin: RRP_PLUGIN, rrp: payload },
  }
}

/** One logged event, only the fields this module reads. */
export interface PayloadEventLike {
  type?: string
  data?: unknown
}

/**
 * Extract our structured payload from one logged event.
 * @param event - any logged event.
 * @returns the payload when the event is one of our plugin `user/message`
 *   context messages, else undefined.
 */
export function rrpPayloadOf(event: PayloadEventLike | undefined): RrpStatePayload | undefined {
  if (event?.type !== 'user/message') return undefined
  const data = event.data as { source?: { kind?: unknown; plugin?: unknown; rrp?: unknown } } | undefined
  const source = data?.source
  if (source === undefined || source.kind !== 'plugin' || source.plugin !== RRP_PLUGIN) return undefined
  const payload = source.rrp
  if (payload === null || typeof payload !== 'object') return undefined
  return payload as RrpStatePayload
}

/** The model-facing text of one message event (`user/message` data IS the message). */
export function messageTextOf(event: PayloadEventLike | undefined): string {
  const data = event?.data as { content?: unknown } | undefined
  const content = data?.content
  if (!Array.isArray(content)) return ''
  return content.map((block) => (block as { text?: unknown }).text ?? '').join('')
}
