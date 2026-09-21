#!/usr/bin/env node
/**
 * inspect-context.mjs — measure durable context-message accumulation.
 *
 * Usage:
 *   node scripts/inspect-context.mjs <session.v3.jsonl.zstd>
 *   node scripts/inspect-context.mjs --latest
 *
 * Reads a DSH session log (multi-frame zstd), folds the surface the same way
 * the host does, and reports how many of dsh-rrp's context messages are still
 * ON THE SURFACE (model-visible) vs merely present in the append-only log.
 *
 * Expected under the CURRENT append-only publisher (replace was retired: it
 * broke the prefix cache, measured hit rate 90% -> 27%):
 *   on-surface card  = 1        (deduped: the card context is appended once)
 *   on-surface facts >= 1       (one per state change; old copies leave the
 *                                surface via host compaction, not replace)
 *   replace events   = 0        (any replace here means a regression)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { zstdDecompressSync } from 'node:zlib'

const MAGIC = [0x28, 0xb5, 0x2f, 0xfd]

function decode(path) {
  const buffer = readFileSync(path)
  const parts = []
  for (let i = 0; i + 4 <= buffer.length; i += 1) {
    if (buffer[i] !== MAGIC[0] || buffer[i + 1] !== MAGIC[1] || buffer[i + 2] !== MAGIC[2] || buffer[i + 3] !== MAGIC[3]) continue
    try { parts.push(zstdDecompressSync(buffer.slice(i)).toString('utf8')) } catch { /* not a frame start */ }
  }
  return parts.join('')
}

function newestSessionFile() {
  const root = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'sessions')
  const candidates = []
  for (const workspace of readdirSync(root)) {
    const dir = join(root, workspace)
    let entries
    try { entries = readdirSync(dir) } catch { continue }
    for (const entry of entries) {
      const file = join(dir, entry, 'session.v3.jsonl.zstd')
      try { candidates.push({ file, mtime: statSync(file).mtimeMs }) } catch { /* skip */ }
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime)
  return candidates[0]?.file
}

const textOf = (event) => {
  // \`user/message\` data is the UserMessage directly; \`assistant/message\` wraps it.
  const content = event?.data?.content ?? event?.data?.message?.content
  if (!Array.isArray(content)) return ''
  return content.map((block) => block?.text ?? '').join('')
}

const argv = process.argv.slice(2)
const usageOnly = argv.includes('--usage')
const positional = argv.filter((value) => !value.startsWith('--'))
const file = positional[0] ?? newestSessionFile()
if (file === undefined) {
  console.error('no session file found')
  process.exit(2)
}
const raw = decode(file)
const events = []
for (const line of raw.split(/\r?\n/)) {
  if (line.trim().length === 0) continue
  try { events.push(JSON.parse(line)) } catch { /* skip */ }
}

// --usage: objective per-turn KV-cache hit rate, straight from the logged usage.
if (usageOnly) {
  console.log('file: ' + file)
  console.log('')
  console.log('turn | cacheMissIn | cacheRead | prompt | hit%')
  for (const event of events) {
    if (event.type !== 'assistant/message') continue
    const usage = event.data?.usage
    if (usage === undefined || typeof usage.inputTokens !== 'number') continue
    const cache = typeof usage.cacheReadTokens === 'number' ? usage.cacheReadTokens : 0
    const prompt = usage.inputTokens + cache
    const hit = prompt === 0 ? 0 : Math.round((cache / prompt) * 100)
    console.log(
      String(event.data.turn ?? '?').padStart(4) + ' | ' +
      String(usage.inputTokens).padStart(11) + ' | ' +
      String(cache).padStart(9) + ' | ' +
      String(prompt).padStart(6) + ' | ' +
      String(hit).padStart(4) + '%',
    )
  }
  process.exit(0)
}

const owned = events.filter((event) => event.type === 'user/message' && /^【(当前卡包|世界状态)/.test(textOf(event)))
const card = owned.filter((event) => textOf(event).startsWith('【当前卡包'))
const facts = owned.filter((event) => textOf(event).startsWith('【世界状态'))
const replaces = owned.filter((event) => event.surfaceOp !== undefined && typeof event.surfaceOp === 'object')

// Fold the surface exactly like the host: append pushes, replace shadows a range.
const surface = []
for (const event of events) {
  const op = event.surfaceOp
  if (op === undefined) continue
  if (op === 'append') { surface.push(event.seq); continue }
  if (op?.op === 'replace') {
    for (let i = surface.length - 1; i >= 0; i -= 1) {
      if (surface[i] >= op.startSeq && surface[i] <= op.endSeq) surface.splice(i, 1)
    }
    surface.push(event.seq)
  }
}
const onSurface = new Set(surface)
const countOnSurface = (list) => list.filter((event) => onSurface.has(event.seq)).length

const header = events.find((event) => event.type === 'session')
console.log('file        : ' + file)
console.log('session     : ' + (header?.id ?? '?') + '  preset=' + (header?.agentPreset ?? '?') + '  parent=' + (header?.parentSession ?? '-'))
console.log('log events  : ' + events.length)
console.log('surface     : ' + surface.length + ' nodes')
console.log('')
console.log('dsh-rrp context messages IN LOG    : card=' + card.length + '  facts=' + facts.length)
console.log('dsh-rrp context messages ON SURFACE: card=' + countOnSurface(card) + '  facts=' + countOnSurface(facts))
console.log('replace-shaped context events      : ' + replaces.length)
console.log('')
console.log(replaces.length > 0
  ? 'VERDICT: replace WAS accepted (surface should hold 1 card + 1 facts).'
  : 'VERDICT: no replace event seen — either all appends, or a rejected replace fell back to append.')
console.log('')
console.log('recent dsh-rrp context events (seq | surfaceOp | on-surface | head):')
for (const event of owned.slice(-8)) {
  const op = event.surfaceOp === undefined ? 'append(?log-only)' : (typeof event.surfaceOp === 'string' ? event.surfaceOp : JSON.stringify(event.surfaceOp))
  console.log('  ' + String(event.seq).padStart(5) + ' | ' + op.padEnd(42) + ' | ' + String(onSurface.has(event.seq)).padEnd(5) + ' | ' + JSON.stringify(textOf(event).slice(0, 28)))
}
