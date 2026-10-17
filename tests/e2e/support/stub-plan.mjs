/**
 * tests/e2e/support/stub-plan.mjs — The deterministic script the stub model plays back.
 *
 * Plain `.mjs` because the host process loads the stub plugin directly, and it has no TypeScript
 * loader. Type surface lives in `stub-plan.d.mts`, matching this repository's script convention
 * (see `host-runner-ownership.d.mts`).
 *
 * Determinism is a hard requirement, not a style preference: ticket 04 asserts byte-equal
 * transcripts across runs, so any timestamp, uuid or random choice here breaks the whole layer.
 */

/** Marker the harness embeds in a user message to select the Author script. */
export const AUTHOR_MARKER = 'E2E-AUTHOR'

/** Marker selecting the Chronicler script (a structured state settlement reply). */
export const CHRONICLER_MARKER = 'E2E-CHRONICLER'

/** Scripted narrative prose. Deliberately free of volatile values. */
export const AUTHOR_GOLD = '炉火把雪光映在窗纸上，她放下笔，望向门外。'

/**
 * Placeholder for the Chronicler script. The real reply envelope is built in ticket 03 against
 * `chroniclerReplySchema` (src/agents/chronicler.ts) — inventing a state shape here would only
 * prove that the stub can be wrong convincingly.
 */
export const CHRONICLER_PLACEHOLDER_GOLD = 'E2E_CHRONICLER_PLACEHOLDER'

/** Text the stub returns when no marker is present. */
export const NEUTRAL_GOLD = '屋里很安静。'

/**
 * Pick the blocks for one request.
 *
 * @param {string | undefined} latestUserText the newest user-role text in the request.
 * @returns {Array<{ type: 'text', text: string }>} blocks to stream, in order.
 */
export function planBlocks(latestUserText) {
  const text = latestUserText ?? ''
  if (text.includes(CHRONICLER_MARKER)) {
    return [{ type: 'text', text: CHRONICLER_PLACEHOLDER_GOLD }]
  }
  if (text.includes(AUTHOR_MARKER)) {
    return [{ type: 'text', text: AUTHOR_GOLD }]
  }
  return [{ type: 'text', text: NEUTRAL_GOLD }]
}

/**
 * Extract the newest user-role text from a request, the way the stub needs it.
 *
 * @param {ReadonlyArray<{ role?: string, content?: unknown }>} messages request messages.
 * @returns {string | undefined} concatenated text of the last user message, when any.
 */
export function latestUserText(messages) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.role !== 'user') continue
    const content = message.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .map((block) => (typeof block === 'string' ? block : (block?.text ?? '')))
        .join('')
    }
    return undefined
  }
  return undefined
}
