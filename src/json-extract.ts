/**
 * dsh-rrp — fault-tolerant JSON extraction from a model reply.
 *
 * Models sometimes wrap the payload in Markdown fences, add prose around it,
 * or get cut off mid-stream. This module recovers the first JSON object with
 * a cheap best-effort ladder before giving up. Dependency-free: both the
 * host agents and any client preview may import it.
 */

/**
 * Build the suffix that would close `text` as JSON: a trailing unterminated
 * string is quoted shut, then every unclosed `{`/`[` (tracked on a stack,
 * string-aware) is popped with its matching closer.
 */
function autoClose(text: string): string {
  const stack: string[] = []
  let inString = false
  let escaped = false
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{' || ch === '[') stack.push(ch)
    else if (ch === '}' || ch === ']') stack.pop()
  }
  let suffix = inString ? '"' : ''
  while (stack.length > 0) {
    suffix += stack.pop() === '{' ? '}' : ']'
  }
  return suffix
}

/** Drop commas that sit directly before a closer (`{"a":1,}` → `{"a":1}`). String-aware. */
function stripTrailingCommas(text: string): string {
  let out = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string
    if (inString) {
      out += ch
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      continue
    }
    if (ch === ',') {
      let j = i + 1
      while (j < text.length && /\s/.test(text[j] as string)) j += 1
      if (text[j] === '}' || text[j] === ']') continue // drop the stray comma
    }
    out += ch
  }
  return out
}

/**
 * Drop closers that have no opener (`{"a":1}}` → `{"a":1}`): the mirror image
 * of {@link autoClose} for a model that finishes the payload and then keeps
 * stamping braces. String-aware; stops at the first closer that balances.
 */
function dropSurplusClosers(text: string): string {
  let depth = 0
  let inString = false
  let escaped = false
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{' || ch === '[') depth += 1
    else if (ch === '}' || ch === ']') depth -= 1
  }
  let trimmed = text
  while (depth < 0 && trimmed.length > 0 && (trimmed.endsWith('}') || trimmed.endsWith(']'))) {
    trimmed = trimmed.slice(0, -1)
    depth += 1
  }
  return trimmed
}

/**
 * Parse as-is, else without trailing commas, else with an auto closing suffix,
 * else with surplus closers dropped. Each rung only runs when the one above
 * threw, so a well-formed reply never pays for the ladder.
 */
function tryParseLoose(candidate: string): unknown | undefined {
  try {
    return JSON.parse(candidate)
  } catch {
    /* try de-commaed */
  }
  try {
    return JSON.parse(stripTrailingCommas(candidate))
  } catch {
    /* try closed */
  }
  try {
    return JSON.parse(candidate + autoClose(candidate))
  } catch {
    /* try over-closed */
  }
  try {
    return JSON.parse(dropSurplusClosers(candidate))
  } catch {
    return undefined
  }
}

/** Count occurrences of one character. */
function countChar(text: string, char: string): number {
  return text.split(char).length - 1
}

/**
 * Brace depth at `position` (counting `{`/`}` literally, strings included).
 * Best-effort: only used to avoid cutting a repair point AFTER the outer
 * object has already closed.
 */
function braceDepthAt(text: string, position: number): number {
  return countChar(text.slice(0, position), '{') - countChar(text.slice(0, position), '}')
}

/** Index of the last comma still inside unclosed braces, or -1. */
function lastInsideComma(text: string): number {
  let comma = text.lastIndexOf(',')
  while (comma !== -1 && braceDepthAt(text, comma) <= 0) {
    comma = text.lastIndexOf(',', comma - 1)
  }
  return comma
}

/**
 * True when the fragment holds an unterminated string literal (odd quote
 * count): closing the object there would seal a half-word into the data, so
 * the repair prefers to cut at the preceding comma instead.
 */
function danglingPartialString(fragment: string): boolean {
  return countChar(fragment, '"') % 2 === 1
}

/** Max comma-truncation points to walk back (bounds pathological inputs). */
const MAX_TRUNCATION_ATTEMPTS = 64

/**
 * Extract the first JSON object from a free-text model reply.
 *
 * Ladder:
 * 1. Unwrap Markdown fences, find the first `{`.
 * 2. Balanced reply (complete object, maybe prose-wrapped): parse the
 *    first-`{` … last-`}` window.
 * 3. Unbalanced reply (cut mid-stream): walk back through commas that still
 *    sit inside the unclosed object, drop the dangling tail, close what
 *    remains and retry — at most 64 points, so pathological input cannot
 *    loop. A fragment cut inside a string is dropped rather than sealed shut.
 *
 * @param reply - the raw model output.
 * @returns the parsed value, or undefined when nothing was recoverable.
 */
export function extractFirstJsonObject(reply: string): unknown | undefined {
  // Strip code fences (` ```json ` / ` ``` `), keeping the fenced content.
  const text = reply.replace(/```(?:json)?/gi, '')
  const start = text.indexOf('{')
  if (start === -1) return undefined

  const tail = text.slice(start)
  const truncated = countChar(tail, '{') > countChar(tail, '}')

  if (!truncated) {
    const end = text.lastIndexOf('}')
    if (end > start) {
      const direct = tryParseLoose(text.slice(start, end + 1))
      if (direct !== undefined) return direct
    }
  }

  // Truncation repair (also reached when the window above failed to parse).
  let candidate = tail
  for (let attempt = 0; attempt < MAX_TRUNCATION_ATTEMPTS; attempt += 1) {
    const comma = lastInsideComma(candidate)
    const fragment = comma === -1 ? candidate : candidate.slice(comma + 1)
    // Seal the candidate only when the dangling fragment is not a partial
    // string; otherwise prefer cutting at the comma (cleaner truncation).
    if (comma === -1 || !danglingPartialString(fragment)) {
      const repaired = tryParseLoose(candidate)
      if (repaired !== undefined) return repaired
    }
    if (comma === -1) break
    candidate = candidate.slice(0, comma)
  }
  return undefined
}
