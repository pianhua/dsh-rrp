#!/usr/bin/env node
/**
 * repair-v3-openings.mjs — repair V3 session logs whose opening events predate
 * the host 0.2.0 turn invariant.
 *
 * dsh-rrp 0.1.6 wrote the opening assistant message as a bare
 * `assistant/message { turn: 0, step: 0 }`. Host 0.2.0 requires every message
 * to be inside an opened turn and step, so those logs cannot be migrated to V4.
 * A small number of fork tails were also written without any `turn/start`.
 * This one-shot repair wraps only those known shapes; it never changes message
 * roles, content, or ordering.
 *
 * Usage:
 *   node scripts/repair-v3-openings.mjs                         # dry run
 *   node scripts/repair-v3-openings.mjs --apply                 # rewrite + .bak
 *   node scripts/repair-v3-openings.mjs --workspace <dir>       # one workspace
 *   node scripts/repair-v3-openings.mjs --apply --workspace --D-projects-dsh-rrp--
 *
 * DRY RUN IS THE DEFAULT. This tool rewrites host session logs directly because
 * the host refuses to load the affected files before migration. Verify the dry
 * run and the repaired sessions, then retire this script; it is not a runtime
 * migration layer.
 */
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync, gzipSync, zstdCompressSync, zstdDecompressSync } from 'node:zlib'

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd]
const TURN_EVENT_TYPES = new Set([
  'assistant/message',
  'turn/start',
  'step/start',
  'system/message',
  'tool/call',
  'tool/result',
  'step/end',
  'turn/end',
  'assistant/attempt',
  'llm/retry',
  'llm/retry-started',
])
const STEP_EVENT_TYPES = new Set(['assistant/message', 'step/start', 'step/end'])

function frameStarts(buffer) {
  const starts = []
  for (let index = 0; index + 4 <= buffer.length; index += 1) {
    if (
      buffer[index] === ZSTD_MAGIC[0] &&
      buffer[index + 1] === ZSTD_MAGIC[1] &&
      buffer[index + 2] === ZSTD_MAGIC[2] &&
      buffer[index + 3] === ZSTD_MAGIC[3]
    ) {
      starts.push(index)
    }
  }
  return starts
}

/** Decode gzip or the host's concatenated zstd frames. */
function decode(path) {
  const buffer = readFileSync(path)
  if (path.endsWith('.gz')) return gunzipSync(buffer).toString('utf8')
  const starts = frameStarts(buffer)
  if (starts.length === 0) throw new Error('no zstd frame found')
  return starts
    .map((start, index) => {
      const end = index + 1 < starts.length ? starts[index + 1] : buffer.length
      return zstdDecompressSync(buffer.slice(start, end)).toString('utf8')
    })
    .join('')
}

/**
 * Preserve the host's physical contract: the first zstd frame is exactly the
 * header line, and the remaining event lines are in a second frame. Gzip logs
 * remain one gzip stream.
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
    const workspacePath = join(root, workspace)
    let sessions
    try {
      sessions = readdirSync(workspacePath)
    } catch {
      continue
    }
    for (const session of sessions) {
      const sessionPath = join(workspacePath, session)
      let names
      try {
        names = readdirSync(sessionPath)
      } catch {
        continue
      }
      for (const name of names) {
        if (!name.startsWith('session.v3.jsonl.')) continue
        if (!name.endsWith('.zstd') && !name.endsWith('.gz')) continue
        files.push(join(sessionPath, name))
      }
    }
  }
  return files
}

function isEvent(value) {
  return value !== null && typeof value === 'object' && typeof value.type === 'string'
}

function hasTurnData(event) {
  return (
    isEvent(event) &&
    TURN_EVENT_TYPES.has(event.type) &&
    event.data !== null &&
    typeof event.data === 'object' &&
    typeof event.data.turn === 'number'
  )
}

function eventTime(event, fallback) {
  return typeof event.time === 'number' ? event.time : fallback
}

function insertedEvent(type, data, adjacent) {
  return {
    type,
    time: eventTime(adjacent, Date.now()),
    data,
  }
}

// V4 surface invariant (migrator foldSurface): the first surface event must be
// a system/message — it becomes the protected head that later host system
// prompts may replace. dsh-rrp logs start with plugin user/message context, so
// the head turn is prepended and every existing turn number shifts by one.
const SURFACE_EVENT_TYPES = new Set([
  'system/message',
  'developer/message',
  'user/message',
  'assistant/message',
  'tool/result',
])

const HEAD_TEXT = '【DSH-Chronicle】RP 会话：正文由 Author 执笔，设定由卡包与技能按世界状态注入。'

// The V3 codec requires a plugin source on system/message, and the v3→v4
// migrator only lifts `@deepseek-ai/dsh-system-prompt` (role system) to the
// V4 `system-prompt` kind that V4 load validation demands. The protected head
// must therefore be attributed to the host's system-prompt producer.
const HEAD_SOURCE = { kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt' }

// Earlier head insertions used the V4 source shape (or our own plugin name) and
// missed the surfaceOp marker, all of which the codecs refuse. Normalize our
// head system messages to the one shape both eras accept.
function rewriteV4StyleSystemSources(events) {
  let changed = 0
  for (const event of events) {
    if (event.type !== 'system/message') continue
    const message = event.data?.message
    const source = message?.source
    const ours =
      source?.kind === 'system-prompt' ||
      (source?.kind === 'plugin' && source?.plugin === 'dsh-rrp')
    if (source !== undefined && source !== null && ours) {
      message.source = { ...HEAD_SOURCE }
      changed += 1
    }
    if (event.surfaceOp === undefined) {
      event.surfaceOp = 'append'
      changed += 1
    }
  }
  return changed
}

function ensureSurfaceHead(events) {
  const firstSurfaceIndex = events.findIndex(
    (event) => isEvent(event) && SURFACE_EVENT_TYPES.has(event.type),
  )
  if (firstSurfaceIndex === -1) return 0
  if (events[firstSurfaceIndex].type === 'system/message') return 0
  for (const event of events) {
    if (!hasTurnData(event)) continue
    event.data.turn += 1
  }
  const adjacent = events[firstSurfaceIndex]
  const headMessage = {
    id: randomUUID(),
    role: 'system',
    content: [{ type: 'text', text: HEAD_TEXT }],
    source: { ...HEAD_SOURCE },
  }
  const headTurn = [
    insertedEvent('turn/start', { turn: 1 }, adjacent),
    insertedEvent('step/start', { turn: 1, step: 1 }, adjacent),
    { ...insertedEvent('system/message', { turn: 1, step: 1, message: headMessage }, adjacent), surfaceOp: 'append' },
    insertedEvent('step/end', { turn: 1, step: 1 }, adjacent),
    insertedEvent('turn/end', { turn: 1, reason: { kind: 'completed' } }, adjacent),
  ]
  events.splice(firstSurfaceIndex, 0, ...headTurn)
  return headTurn.length
}

function normalizeEventLines(text) {
  const lines = text.split('\n')
  const headerLine = lines.shift() ?? ''
  if (headerLine.length === 0) throw new Error('missing header line')
  const events = []
  for (const line of lines) {
    if (line.length === 0) continue
    const event = JSON.parse(line)
    if (!isEvent(event)) throw new Error('body line is not an event object')
    events.push(event)
  }
  return { header: JSON.parse(headerLine), events }
}

function rewriteSeedMarkers(header, events) {
  let changed = 0
  const hasMarker = events.some(
    (event) => isEvent(event) && event.type === 'session/end-seed',
  )
  if (!hasMarker) return 0
  // The V4 migrator refuses an inherited end-seed in a header that claims
  // unseeded (migration.ts), and 0.1.6 wrote isSeeded:false on some forked
  // logs that do carry the marker. The marker is the ground truth: align the
  // header instead of leaving the log unloadable.
  if (header.isSeeded !== true) {
    header.isSeeded = true
    changed += 1
  }
  for (const event of events) {
    if (event.type !== 'session/end-seed') continue
    if (JSON.stringify(event.data) === JSON.stringify({ inherited: true })) continue
    event.data = { inherited: true }
    changed += 1
  }
  return changed
}

function openingCandidate(events) {
  const openings = events.filter(
    (event) =>
      event.type === 'assistant/message' &&
      event.data !== null &&
      typeof event.data === 'object' &&
      event.data.turn === 0,
  )
  return openings.length === 1 ? openings[0] : undefined
}

function openingRepair(events) {
  const startIndex = events.findIndex((event) => event.type === 'turn/start')
  const opening = openingCandidate(events)
  if (startIndex !== -1 && opening === undefined) {
    return { kind: 'skip', reason: 'has turn/start but no unique turn-0 opening' }
  }
  if (startIndex !== -1) {
    const openingIndex = events.indexOf(opening)
    for (const event of events) {
      if (!hasTurnData(event)) continue
      if (event.data.turn >= 1) event.data.turn += 1
    }
    opening.data.turn = 1
    opening.data.step = 1
    const before = [
      insertedEvent('turn/start', { turn: 1 }, opening),
      insertedEvent('step/start', { turn: 1, step: 1 }, opening),
    ]
    const after = [
      insertedEvent('step/end', { turn: 1, step: 1 }, opening),
      insertedEvent('turn/end', { turn: 1, reason: { kind: 'completed' } }, opening),
    ]
    events.splice(openingIndex, 0, ...before)
    const shiftedOpeningIndex = openingIndex + before.length
    events.splice(shiftedOpeningIndex + 1, 0, ...after)
    return {
      kind: 'repair',
      label: 'opening',
      insertions: ['turn/start(1)', 'step/start(1,1)', 'step/end(1,1)', 'turn/end(1)'],
      turnMap: '0→1; n≥1→n+1',
    }
  }

  const firstTurnIndex = events.findIndex(hasTurnData)
  if (firstTurnIndex === -1) return { kind: 'skip', reason: 'no turn-bearing event' }
  for (const event of events) {
    if (!hasTurnData(event)) continue
    event.data.turn = 1
    if (event.type === 'assistant/message' && event.data.step === 0) event.data.step = 1
  }

  const firstStepEventIndex = events.findIndex(
    (event) =>
      STEP_EVENT_TYPES.has(event.type) &&
      event.data !== null &&
      typeof event.data === 'object' &&
      typeof event.data.step === 'number',
  )
  const existingStepStart = events.some((event) => event.type === 'step/start')
  const firstStepEvent = firstStepEventIndex === -1 ? undefined : events[firstStepEventIndex]
  const step =
    firstStepEvent !== undefined && typeof firstStepEvent.data.step === 'number'
      ? firstStepEvent.data.step
      : 1
  const insertions = ['turn/start(1)']
  events.splice(firstTurnIndex, 0, insertedEvent('turn/start', { turn: 1 }, events[firstTurnIndex]))

  let stepStartIndex = firstStepEventIndex
  if (stepStartIndex !== -1) stepStartIndex += 1
  if (!existingStepStart && stepStartIndex !== -1) {
    events.splice(stepStartIndex, 0, insertedEvent('step/start', { turn: 1, step }, firstStepEvent))
    insertions.push('step/start(1,' + String(step) + ')')
  }

  const stepEndIndex = events.findIndex(
    (event) =>
      event.type === 'step/end' &&
      event.data !== null &&
      typeof event.data === 'object' &&
      event.data.turn === 1 &&
      event.data.step === step,
  )
  if (stepEndIndex === -1) {
    const turnEndIndex = events.findIndex(
      (event) =>
        event.type === 'turn/end' &&
        event.data !== null &&
        typeof event.data === 'object' &&
        event.data.turn === 1,
    )
    const endEvent = insertedEvent('step/end', { turn: 1, step }, events.at(-1))
    if (turnEndIndex === -1) events.push(endEvent)
    else events.splice(turnEndIndex, 0, endEvent)
    insertions.push('step/end(1,' + String(step) + ')')
  }

  const turnEndExists = events.some(
    (event) =>
      event.type === 'turn/end' &&
      event.data !== null &&
      typeof event.data === 'object' &&
      event.data.turn === 1,
  )
  if (!turnEndExists) {
    events.push(
      insertedEvent('turn/end', { turn: 1, reason: { kind: 'completed' } }, events.at(-1)),
    )
    insertions.push('turn/end(1)')
  }
  return {
    kind: 'repair',
    label: 'orphan-tail',
    insertions,
    turnMap: 'all turn-bearing events→1; assistant step 0→1',
  }
}

function repairFile(path) {
  const text = decode(path)
  const { header, events } = normalizeEventLines(text)
  const before = events.length
  // Seed-marker/header integrity runs for every log, including ones whose
  // turn structure needs no repair (0.1.6 seeded-header bug).
  const seedChanges = rewriteSeedMarkers(header, events)
  const sourceChanges = rewriteV4StyleSystemSources(events)
  const result = openingRepair(events)
  const headInsertions = ensureSurfaceHead(events)
  if (result.kind === 'skip' && seedChanges === 0 && sourceChanges === 0 && headInsertions === 0) {
    return { kind: 'skip', reason: result.reason, before, after: before, text }
  }
  const insertions = [
    ...(result.kind === 'repair' ? result.insertions : []),
    ...(headInsertions > 0 ? ['surface-head turn(1)'] : []),
  ]
  const turnMap =
    result.kind === 'repair'
      ? result.turnMap + (headInsertions > 0 ? '; head→+1' : '')
      : [
          seedChanges > 0 ? 'seed-header' : '',
          sourceChanges > 0 ? 'system-source' : '',
          headInsertions > 0 ? 'head→+1' : '',
        ]
          .filter((part) => part.length > 0)
          .join('; ')
  for (let index = 0; index < events.length; index += 1) events[index].seq = index
  const body = events.map((event) => JSON.stringify(event)).join('\n')
  return {
    kind: 'repair',
    label: result.kind === 'repair' ? result.label + (headInsertions > 0 ? '+head' : '') : headInsertions > 0 ? 'head-only' : 'seed-only',
    insertions,
    before,
    after: events.length,
    seedChanges,
    sourceChanges,
    turnMap,
    text: JSON.stringify(header) + '\n' + (body.length === 0 ? '' : body + '\n'),
  }
}

function parseArgs(argv) {
  const apply = argv.includes('--apply')
  const workspaceIndex = argv.indexOf('--workspace')
  if (workspaceIndex !== -1 && workspaceIndex + 1 >= argv.length) {
    throw new Error('--workspace requires a directory name')
  }
  const known = new Set(['--apply', '--workspace'])
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--workspace') {
      index += 1
      continue
    }
    if (!known.has(argv[index])) throw new Error('unknown argument ' + argv[index])
  }
  return { apply, onlyWorkspace: workspaceIndex === -1 ? undefined : argv[workspaceIndex + 1] }
}

let args
try {
  args = parseArgs(process.argv.slice(2))
} catch (error) {
  console.error(String(error?.message ?? error))
  process.exit(2)
}

const root = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'sessions')
if (!existsSync(root)) {
  console.error('no sessions root at ' + root)
  process.exit(1)
}

let scanned = 0
let repaired = 0
let skipped = 0
let failed = 0
let changedEvents = 0
for (const file of sessionFiles(root, args.onlyWorkspace)) {
  scanned += 1
  const relative = file.slice(root.length + 1)
  let result
  try {
    result = repairFile(file)
  } catch (error) {
    failed += 1
    console.warn('ERROR ' + relative + ': ' + String(error?.message ?? error))
    continue
  }
  if (result.kind === 'skip') {
    skipped += 1
    console.log(
      'SKIP ' +
        relative +
        ' (' +
        result.reason +
        '; events ' +
        String(result.before) +
        '→' +
        String(result.after) +
        ')',
    )
    continue
  }
  repaired += 1
  changedEvents += result.after - result.before + (result.seedChanges ?? 0)
  const additions = result.insertions?.join(', ') ?? 'none'
  const map = result.turnMap ?? 'none'
  console.log(
    (args.apply ? 'REPAIR ' : 'WOULD REPAIR ') +
      relative +
      ' [' +
      result.label +
      '; insert ' +
      additions +
      '; map ' +
      map +
      '; events ' +
      String(result.before) +
      '→' +
      String(result.after) +
      (result.seedChanges > 0 ? '; end-seed data→{inherited:true}' : '') +
      (result.sourceChanges > 0 ? '; system source→plugin' : '') +
      ']',
  )
  if (args.apply) {
    const backup = file + '.bak'
    if (!existsSync(backup)) copyFileSync(file, backup)
    writeFileSync(file, encode(file, result.text))
  }
}

console.log('')
console.log(
  (args.apply ? 'Applied' : 'Dry run') +
    ': ' +
    String(scanned) +
    ' log(s) scanned, ' +
    String(repaired) +
    ' changed, ' +
    String(skipped) +
    ' skipped, ' +
    String(changedEvents) +
    ' event/data changes, ' +
    String(failed) +
    ' failed.',
)
if (!args.apply && repaired > 0)
  console.log('Re-run with --apply to rewrite (originals kept as *.bak).')
if (failed > 0) process.exitCode = 1
