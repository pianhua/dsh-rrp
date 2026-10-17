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

/**
 * Stable identity lines of the agents that call the model. They are the first layer of the
 * six-layer prompt contract and are guarded by tests/unit/agents-contract.spec.ts, so they are the
 * least-invasive way to tell callers apart — the alternative would be injecting markers into
 * production prompts, which the spec forbids.
 */
export const CALLER_SIGNATURES = {
  author: 'You are the Author Agent of DSH-Chronicle',
  chronicler: '状态推演（Chronicler Agent）',
  copilot: '你是「月停」——',
}

/** Marker the harness embeds in a player message to select the Author scene. */
export const AUTHOR_MARKER = 'E2E-AUTHOR'

/** Scripted narrative prose. Deliberately free of volatile values. */
export const AUTHOR_GOLD = '炉火把雪光映在窗纸上，她放下笔，望向门外。'

/**
 * Placeholder for the Chronicler script. The real envelope is built in ticket 04 against
 * `chroniclerReplySchema` — only a real turn can prove it parses and folds. Inventing a state shape
 * here would just prove the stub can be wrong convincingly.
 */
export const CHRONICLER_PLACEHOLDER_GOLD = 'E2E_CHRONICLER_PLACEHOLDER'

/** Text the stub returns when it cannot identify the caller or the scene. */
export const NEUTRAL_GOLD = '屋里很安静。'

/**
 * Output that deliberately violates what ticket 04 asserts. Selected only by the negative-control
 * run, where the suite must fail non-zero — a test that passes under every input asserts nothing.
 */
export const WRONG_GOLD = 'E2E_WRONG_GOLD_OUTPUT'

/**
 * Flatten the system prompt of one request.
 *
 * Loop-built requests carry it as the leading system-role message; one-shot callers pass
 * `input.system` instead (dsh-llm/lib/types/types.d.ts:495-506).
 *
 * @param {unknown} input the adapter request.
 * @returns {string} system prompt text, or '' when the request carries none.
 */
export function systemTextOf(input) {
  if (typeof input?.system === 'string') return input.system
  const leading = input?.messages?.[0]
  if (leading?.role !== 'system') return ''
  const content = leading.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((block) => (typeof block === 'string' ? block : (block?.text ?? '')))
      .join('')
  }
  return ''
}

/**
 * Identify which of our agents is calling, from its system prompt.
 *
 * @param {string} systemText flattened system prompt.
 * @returns {'author' | 'chronicler' | 'copilot' | 'unknown'}
 */
export function callerOf(systemText) {
  for (const [caller, signature] of Object.entries(CALLER_SIGNATURES)) {
    if (systemText.includes(signature))
      return /** @type {'author' | 'chronicler' | 'copilot'} */ (caller)
  }
  return 'unknown'
}

/**
 * Extract the newest user-role text from a request.
 *
 * @param {ReadonlyArray<{ role?: string, content?: unknown }>} messages request messages.
 * @returns {string | undefined} concatenated text of the last user message, when any.
 */
export function latestUserText(messages) {
  for (let index = (messages?.length ?? 0) - 1; index >= 0; index--) {
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

/**
 * Pick the blocks for one request: caller first, scene second.
 *
 * @param {unknown} input the adapter request (`messages`, optional `system`).
 * @param {{ wrongGold?: boolean }} [options] negative-control switch, passed in so this stays pure.
 * @returns {Array<{ type: 'text', text: string }>} blocks to stream, in order.
 */
export function planBlocks(input, { wrongGold = false } = {}) {
  const caller = callerOf(systemTextOf(input))
  if (caller === 'chronicler') {
    return [{ type: 'text', text: CHRONICLER_PLACEHOLDER_GOLD }]
  }
  if (caller === 'author') {
    const text = latestUserText(input?.messages ?? []) ?? ''
    if (wrongGold) return [{ type: 'text', text: WRONG_GOLD }]
    if (text.includes(AUTHOR_MARKER)) return [{ type: 'text', text: AUTHOR_GOLD }]
  }
  return [{ type: 'text', text: NEUTRAL_GOLD }]
}
