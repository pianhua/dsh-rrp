#!/usr/bin/env node
/**
 * repair-legacy-sessions.mjs — make session logs written by older dsh-rrp builds
 * loadable again.
 *
 * Those builds invented session event types (`rrp/card`, `rrp/world-state`,
 * `rrp/summary`, `rrp/activity`). The host refuses to interpret a log
 * containing an event type it does not know unless the event carries the
 * envelope's `ignorable: true` marker, so every such session fails to load with
 * a red "历史加载失败" banner.
 *
 * Those records are now purely informational for reconstruction (our state lives
 * in ordinary `user/message` context messages), so marking them ignorable is
 * exactly what the envelope contract asks for. The repair is additive: it only
 * adds `"ignorable":true` to `rrp/*` event lines.
 *
 * Usage:
 *   node scripts/repair-legacy-sessions.mjs                       # dry run
 *   node scripts/repair-legacy-sessions.mjs --apply               # rewrite + .bak
 *   node scripts/repair-legacy-sessions.mjs --workspace <dir>     # one workspace
 *   node scripts/repair-legacy-sessions.mjs --apply --workspace --D-projects-dsh-rrp--
 *
 * ONE-SHOT TOOL: this rewrites host session logs directly (no host API can
 * mark events ignorable), which is only justified because the host itself
 * cannot load these legacy logs at all. Run once per affected machine, verify
 * the sessions load, then retire this script — do not build on it.
 */
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync, gzipSync, zstdCompressSync, zstdDecompressSync } from 'node:zlib'

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd]

/**
 * Decode a multi-frame zstd or a gzip session log.
 * Node decompresses a whole frame CONCATENATION, so slicing at a frame start
 * yields that frame plus every later one; the first slice therefore already is
 * the full plaintext, and the loop dedupes.
 */
function decode(path) {
  const buffer = readFileSync(path)
  if (path.endsWith('.gz')) return gunzipSync(buffer).toString('utf8')
  for (let i = 0; i + 4 <= buffer.length; i += 1) {
    if (
      buffer[i] !== ZSTD_MAGIC[0] ||
      buffer[i + 1] !== ZSTD_MAGIC[1] ||
      buffer[i + 2] !== ZSTD_MAGIC[2] ||
      buffer[i + 3] !== ZSTD_MAGIC[3]
    )
      continue
    try {
      return zstdDecompressSync(buffer.slice(i)).toString('utf8')
    } catch {
      /* not a frame start */
    }
  }
  return ''
}

/**
 * Re-encode while PRESERVING the host's physical contract: the artifact is a
 * concatenation of independent zstd frames whose FIRST frame is exactly the
 * header line (the host asserts this and refuses a single whole-file frame).
 * So we write exactly two frames: header, then the patched body.
 */
function encode(path, text) {
  const newline = text.indexOf('\n')
  const headerLine = newline === -1 ? text : text.slice(0, newline)
  const body = newline === -1 ? '' : text.slice(newline + 1)
  if (path.endsWith('.gz')) return gzipSync(Buffer.from(headerLine + '\n' + body, 'utf8'))
  const headerFrame = zstdCompressSync(Buffer.from(headerLine + '\n', 'utf8'))
  if (body.length === 0) return headerFrame
  return Buffer.concat([headerFrame, zstdCompressSync(Buffer.from(body, 'utf8'))])
}

/** Every candidate session log under the sessions root. */
function sessionFiles(root, onlyWorkspace) {
  const files = []
  let workspaces
  try {
    workspaces = readdirSync(root)
  } catch {
    return files
  }
  for (const workspace of workspaces) {
    if (onlyWorkspace !== undefined && workspace !== onlyWorkspace) continue
    const dir = join(root, workspace)
    let entries
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      const sessionDir = join(dir, entry)
      let inner
      try {
        inner = readdirSync(sessionDir)
      } catch {
        continue
      }
      for (const name of inner) {
        if (!name.endsWith('.zstd') && !name.endsWith('.gz')) continue
        files.push(join(sessionDir, name))
      }
    }
  }
  return files
}

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const workspaceIndex = argv.indexOf('--workspace')
const onlyWorkspace = workspaceIndex === -1 ? undefined : argv[workspaceIndex + 1]
const root = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'sessions')

if (!existsSync(root)) {
  console.error('no sessions root at ' + root)
  process.exit(1)
}

let scanned = 0
let repaired = 0
let events = 0
for (const file of sessionFiles(root, onlyWorkspace)) {
  scanned += 1
  let text
  try {
    text = decode(file)
  } catch (error) {
    console.warn('skip (decode failed) ' + file + ': ' + String(error?.message ?? error))
    continue
  }
  const lines = text.split('\n')
  let touched = 0
  const next = lines.map((line) => {
    if (line.length === 0 || !line.includes('"rrp/')) return line
    let event
    try {
      event = JSON.parse(line)
    } catch {
      return line
    }
    if (event === null || typeof event !== 'object') return line
    if (typeof event.type !== 'string' || !event.type.startsWith('rrp/')) return line
    if (event.ignorable === true) return line
    event.ignorable = true
    touched += 1
    return JSON.stringify(event)
  })
  if (touched === 0) continue
  repaired += 1
  events += touched
  const relative = file.slice(root.length + 1)
  console.log(
    (apply ? 'REPAIR ' : 'WOULD REPAIR ') + relative + ' (' + String(touched) + ' rrp event(s))',
  )
  if (apply) {
    const backup = file + '.pre-ignorable.bak'
    if (!existsSync(backup)) copyFileSync(file, backup)
    writeFileSync(file, encode(file, next.join('\n')))
  }
}

console.log('')
console.log(
  (apply ? 'Applied' : 'Dry run') +
    ': ' +
    String(scanned) +
    ' log(s) scanned, ' +
    String(repaired) +
    ' need repair, ' +
    String(events) +
    ' rrp event(s) affected.',
)
if (!apply && repaired > 0)
  console.log('Re-run with --apply to rewrite (originals kept as *.pre-ignorable.bak).')
