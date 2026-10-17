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

/** Provider id the isolated profile selects as `agent-default-model`. */
export const STUB_PROVIDER = 'dsh-rrp-e2e'

/** Scripted narrative prose. Deliberately free of volatile values. */
export const AUTHOR_GOLD = '炉火把雪光映在窗纸上，她放下笔，望向门外。'

/**
 * The Chronicler script (ticket 04): a real envelope accepted by `parseChroniclerReply`,
 * built by applying ONE exported change literal to the card's initial WorldState. The stub
 * (host side) and the spec (assert side) both read the same change literal and the same
 * card `state.json`, so the expected state is derived, never duplicated by hand.
 *
 * Selection rule: the Chronicler's user prompt embeds 【本轮明确剧情证据】; a marked turn's
 * evidence contains AUTHOR_MARKER (the marker rides the player's message into the transcript),
 * so the fold that covers a marked turn commits the change, and any other fold (the opening
 * turn above all) replies with an empty patch — the runner then no-ops without publishing.
 */
export const CHRONICLER_GOLD_CHANGE = {
  /** New value for `trackedObjects.inn.fields.time` (the scripted before/after pair). */
  timeValue: '入夜渐深，雪声未歇',
  /** One added currentEvent (the scripted collection-add shape). */
  event: {
    id: 'evt-e2e-night-watch',
    type: 'ongoing',
    fact: '炉火映着雪光烧到半夜，满屋目光仍落在那柄旧剑上。',
    relatedObjects: [{ objectId: 'inn' }],
    status: 'active',
  },
  changeSummary: '时间推进到深夜；客栈新增一条进行中的事件。',
  evidence: ['炉火与雪光表明夜已深（叙述）。'],
}

/**
 * Apply the scripted change to one complete WorldState v2 snapshot, returning a NEW snapshot.
 * Deliberately field-level so the fold produces a `modified` change (old/new values) plus an
 * `added` currentEvent — the two timeline shapes ticket 04 asserts.
 * @param {unknown} baseState the card's initial state (already WorldState v2 shaped).
 * @returns {Record<string, unknown>} the complete post-change state.
 */
export function applyChroniclerChange(baseState) {
  const base = baseState
  if (
    base === null ||
    typeof base !== 'object' ||
    base.trackedObjects === null ||
    typeof base.trackedObjects !== 'object'
  ) {
    throw new Error('dsh-rrp E2E：桩缺少卡包初始世界状态（DSH_RRP_E2E_CARD_STATE）。')
  }
  const state = structuredClone(base)
  const inn = state.trackedObjects.inn
  if (
    inn === null ||
    typeof inn !== 'object' ||
    inn.fields === null ||
    typeof inn.fields !== 'object'
  ) {
    throw new Error('dsh-rrp E2E：卡包初始状态里没有 trackedObjects.inn.fields，剧本无法落笔。')
  }
  if (inn.fields.time === null || typeof inn.fields.time !== 'object') {
    throw new Error('dsh-rrp E2E：卡包初始状态缺少 inn.fields.time，剧本无法落笔。')
  }
  inn.fields.time.value = CHRONICLER_GOLD_CHANGE.timeValue
  const events = Array.isArray(state.currentEvents) ? state.currentEvents : []
  state.currentEvents = [...events, structuredClone(CHRONICLER_GOLD_CHANGE.event)]
  return state
}

/**
 * Render one Chronicler reply envelope as the streamed text.
 * @param {unknown} [baseState] the card initial state; omit (or pass undefined) for the
 *   no-op envelope (empty patch), which the runner folds to "no state change".
 * @returns {string} one JSON object accepted by `parseChroniclerReply`.
 */
export function chroniclerEnvelope(baseState) {
  if (baseState === undefined) {
    return JSON.stringify({
      patch: {},
      changeSummary: '本轮没有可记录的明确世界后果。',
      evidence: [],
    })
  }
  return JSON.stringify({
    state: applyChroniclerChange(baseState),
    changeSummary: CHRONICLER_GOLD_CHANGE.changeSummary,
    evidence: [...CHRONICLER_GOLD_CHANGE.evidence],
  })
}

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
 * Extract the newest PLAYER-voice text: like {@link latestUserText}, but trailing
 * `<system-reminder>` user messages are the loop's bookkeeping, never the player's
 * message, so they are skipped. The scene marker rides the player's text; without this
 * the marker would drown under the reminder the loop appends after the player turn
 * (found by ticket 04 against the real host loop).
 *
 * @param {ReadonlyArray<{ role?: string, content?: unknown }>} messages request messages.
 * @returns {string | undefined} concatenated text of the newest non-reminder user message.
 */
export function latestPlayerText(messages) {
  for (let index = (messages?.length ?? 0) - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.role !== 'user') continue
    const content = message.content
    const text =
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content
              .map((block) => (typeof block === 'string' ? block : (block?.text ?? '')))
              .join('')
          : undefined
    if (text === undefined) continue
    if (text.startsWith('<system-reminder>')) continue
    return text
  }
  return undefined
}

/**
 * Pick the blocks for one request: caller first, scene second.
 *
 * @param {unknown} input the adapter request (`messages`, optional `system`).
 * @param {{ wrongGold?: boolean, cardState?: unknown }} [options] negative-control switch and
 *   the card's initial WorldState (host side it arrives via `DSH_RRP_E2E_CARD_STATE`), both
 *   passed in so this stays a pure function of its arguments.
 * @returns {Array<{ type: 'text', text: string }>} blocks to stream, in order.
 */
export function planBlocks(input, { wrongGold = false, cardState = undefined } = {}) {
  const caller = callerOf(systemTextOf(input))
  if (caller === 'chronicler') {
    const evidence = latestPlayerText(input?.messages ?? []) ?? ''
    const marked = cardState !== undefined && evidence.includes(AUTHOR_MARKER)
    return [{ type: 'text', text: chroniclerEnvelope(marked ? cardState : undefined) }]
  }
  if (caller === 'author') {
    const text = latestPlayerText(input?.messages ?? []) ?? ''
    if (wrongGold) return [{ type: 'text', text: WRONG_GOLD }]
    if (text.includes(AUTHOR_MARKER)) return [{ type: 'text', text: AUTHOR_GOLD }]
  }
  return [{ type: 'text', text: NEUTRAL_GOLD }]
}
