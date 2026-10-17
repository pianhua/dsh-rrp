/**
 * dsh-rrp — the active history recall engine (issue #38).
 *
 * Implements two-stage progressive disclosure recall for long sessions:
 * 1. `query`: keyword search returning short excerpts (<= 240 chars) per turn.
 * 2. `turn`: deep read of specific turn and its adjacent radius.
 *
 * Built-in guardrails:
 * - Mutually exclusive `query` vs `turn`.
 * - Per-turn call budget (max 6 calls per generation scope).
 * - Query & turn deduplication.
 * - 10-turn cooldown on full text recall.
 * - Mandatory anti-hallucination warning prepended to all output.
 */
import { createHash } from 'node:crypto'
import {
  collectTextBlocks,
  isHostReminder,
  isPluginNotice,
  rrpPayloadOf,
} from '../state-payload.ts'
import type { ProjectionsService, SessionLike } from '../host/host-faces.ts'
import { WORLDLINE_DIGEST_KEY, type WorldlineDigest } from '../worldline/worldline-digest.ts'

export const RECALL_TOOL_NAME = 'rrp_recall_history' as const

export const RECALL_TOOL_DEFINITION = {
  name: RECALL_TOOL_NAME,
  description:
    '检索或读取本故事已经正式发生的历史正文，仅用于回忆细节、专有名词、旧约定与誓言。query 与 turn 必须且只能提供一个。单轮生成最多召回 6 次；完整正文召回后处于 10 轮冷却期。检索结果是已经发生的回忆证据，严禁当作当前现场重复演绎。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      query: {
        type: 'string',
        minLength: 1,
        description: '要回忆的人物、地点、物品、约定或事件关键词；多个关键词用空格分隔。',
      },
      turn: {
        type: 'integer',
        minimum: 0,
        description: '读取指定历史轮次及其附近的完整对话正文。',
      },
      radius: {
        type: 'integer',
        minimum: 0,
        maximum: 3,
        description: '读取指定轮次时前后包含多少轮（默认 1，最多 3 轮）。',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 8,
        description: '关键词检索返回的最大命中条数（默认 5，最多 8 条）。',
      },
    },
  },
} as const

export interface RecallRound {
  turn: number
  player: string
  prose: string
}

export interface RecallCooldown {
  turn: number
  hash: string
  atTurn: number
}

export interface RecallMatch {
  turn: number
  excerpt: string
  score?: number
}

export interface RecallResult {
  notice: string
  found: boolean
  mode: 'search' | 'read'
  query: string
  requestedTurn: number
  matches: RecallMatch[]
  rounds: RecallRound[]
}

export interface RecallScopeState {
  calls: number
  rounds: Set<string>
  searches: Set<string>
}

export interface RecallInput {
  rounds: readonly RecallRound[]
  currentTurn?: number
  query?: string
  turn?: number
  radius?: number
  limit?: number
  scope?: RecallScopeState
  cooldowns?: RecallCooldown[]
  trackCooldown?: boolean
}

function str(value: unknown): string {
  return typeof value === 'string'
    ? value
    : value === undefined || value === null
      ? ''
      : String(value)
}

function clampInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const num = Number(value)
  if (!Number.isInteger(num)) return fallback
  return Math.max(minimum, Math.min(maximum, num))
}

function searchable(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

export function termsOf(query: string): string[] {
  return Array.from(
    new Set(
      str(query)
        .toLocaleLowerCase()
        .match(/[\p{L}\p{N}_]+/gu) || [],
    ),
  )
}

export function excerpt(text: string, terms: readonly string[], maximum = 240): string {
  const source = str(text).replace(/\s+/g, ' ').trim()
  if (source.length <= maximum) return source
  const lower = source.toLocaleLowerCase()
  let found = -1
  for (const term of terms) {
    const index = lower.indexOf(term)
    if (index >= 0 && (found < 0 || index < found)) found = index
  }
  const start = Math.max(0, (found < 0 ? 0 : found) - Math.floor(maximum / 3))
  const end = Math.min(source.length, start + maximum)
  return (start > 0 ? '…' : '') + source.slice(start, end) + (end < source.length ? '…' : '')
}

export function roundSignature(round: RecallRound): string {
  return createHash('sha256')
    .update(JSON.stringify({ turn: round.turn, player: round.player, prose: round.prose }))
    .digest('hex')
}

function scoreRound(
  round: RecallRound,
  query: string,
  terms: readonly string[],
): { score: number; text: string } | null {
  const text =
    (round.player ? '【玩家】\n' + round.player + '\n' : '') +
    (round.prose ? '【正文】\n' + round.prose : '')
  const normalized = searchable(text)
  const full = searchable(query)
  let score = full !== '' && normalized.includes(full) ? 1000 : 0
  let matched = 0
  for (const term of terms) {
    if (normalized.includes(searchable(term))) matched++
  }
  if (matched === 0 && score === 0) return null
  score += matched * 100 + Math.round((matched / Math.max(1, terms.length)) * 10)
  return { score, text }
}

export function createRecallScope(): RecallScopeState {
  return { calls: 0, rounds: new Set(), searches: new Set() }
}

export function recallHistory(
  input: RecallInput,
): RecallResult & { newCooldowns?: RecallCooldown[] } {
  const query = str(input.query).trim()
  const hasQuery = query !== ''
  const hasTurn = input.turn !== undefined && input.turn !== null
  if (Number(hasQuery) + Number(hasTurn) !== 1) {
    throw new Error('历史正文检索必须且只能提供 query 或 turn')
  }

  const rounds = [...input.rounds].sort((a, b) => a.turn - b.turn)
  const currentTurn = input.currentTurn ?? rounds.reduce((max, r) => Math.max(max, r.turn), 0)
  const cooldowns = Array.isArray(input.cooldowns)
    ? input.cooldowns.filter(
        (item) => currentTurn >= item.atTurn && currentTurn - item.atTurn <= 10,
      )
    : []

  const isCooling = (r: RecallRound): boolean =>
    cooldowns.some((item) => item.turn === r.turn && item.hash === roundSignature(r))

  const base: RecallResult = {
    notice: '',
    found: false,
    mode: hasQuery ? 'search' : 'read',
    query: hasQuery ? query : '',
    requestedTurn: hasTurn ? Number(input.turn) : -1,
    matches: [],
    rounds: [],
  }

  const scope = input.scope
  if (scope && scope.calls++ >= 6) {
    return {
      ...base,
      notice:
        '本次生成的历史召回预算已用尽。请使用已经返回的资料继续当前任务，不要再调用历史召回。',
    }
  }

  if (hasQuery) {
    const terms = termsOf(query)
    if (terms.length === 0) throw new Error('历史正文检索关键词不能为空')
    const limit = clampInteger(input.limit, 5, 1, 8)
    const searchKey = JSON.stringify([[...terms].sort(), limit])
    if (scope?.searches.has(searchKey)) {
      return {
        ...base,
        notice: '相同关键词已检索，请使用之前的结果；仅在缺少必要细节时读取对应轮次。',
      }
    }
    scope?.searches.add(searchKey)

    const matches = rounds
      .filter((r) => !isCooling(r))
      .map((r) => {
        const scored = scoreRound(r, query, terms)
        if (scored === null) return null
        return { turn: r.turn, score: scored.score, excerpt: excerpt(scored.text, terms) }
      })
      .filter((entry): entry is { turn: number; score: number; excerpt: string } => entry !== null)
      .sort((left, right) => right.score - left.score || right.turn - left.turn)
      .slice(0, limit)
      .map((m) => ({ turn: m.turn, excerpt: m.excerpt }))

    return {
      ...base,
      found: matches.length > 0,
      matches,
      notice: cooldowns.length > 0 ? '已召回的完整正文处于 10 轮冷却期，检索已跳过这些轮次。' : '',
    }
  }

  // mode === 'read'
  const requested = Number(input.turn)
  if (!Number.isInteger(requested) || requested < 0) {
    throw new Error('历史正文轮次必须是大于等于 0 的整数')
  }
  const radius = clampInteger(input.radius, 1, 0, 3)
  const selected = rounds.filter((r) => Math.abs(r.turn - requested) <= radius)
  const cooled = selected.filter(isCooling)
  const fresh = selected.filter((r) => {
    if (isCooling(r)) return false
    const key = String(r.turn) + ':' + roundSignature(r)
    if (scope?.rounds.has(key)) return false
    scope?.rounds.add(key)
    return true
  })

  let newCooldowns: RecallCooldown[] | undefined
  if (input.trackCooldown && fresh.length > 0) {
    newCooldowns = cooldowns
      .filter((item) => !fresh.some((r) => r.turn === item.turn))
      .concat(fresh.map((r) => ({ turn: r.turn, hash: roundSignature(r), atTurn: currentTurn })))
  }

  return {
    ...base,
    found: selected.some((r) => r.turn === requested),
    rounds: fresh,
    notice:
      cooled.length > 0
        ? '第 ' +
          cooled.map((r) => r.turn).join('、') +
          ' 轮已召回，处于 10 轮冷却期；请使用已有资料继续任务。'
        : fresh.length < selected.length
          ? '重叠轮次已读取，本次只补充未返回的正文。请使用之前的资料，不要重复召回。'
          : '',
    ...(newCooldowns !== undefined ? { newCooldowns } : {}),
  }
}

export function renderRecall(value: RecallResult): string {
  let warning =
    '【历史回忆资料】\n以下是已经发生的历史，只用于确认和回忆；不得当作当前场景继续输出，不得重复演绎。'
  if (value.notice) warning += '\n\n' + value.notice
  if (value.notice && value.rounds.length === 0 && value.matches.length === 0) return warning
  if (!value.found) return warning + '\n\n没有找到相关历史正文。'
  if (value.mode === 'search') {
    return (
      warning +
      '\n\n' +
      value.matches.map((m) => '[第 ' + String(m.turn) + ' 轮]\n' + m.excerpt).join('\n\n') +
      '\n\n仅在摘要不足以回答当前问题时，用 turn 读取所需轮次；信息足够就继续当前任务。'
    )
  }
  return (
    warning +
    '\n\n' +
    value.rounds
      .map((r) => {
        const parts: string[] = []
        if (r.player) parts.push('【玩家】\n' + r.player)
        if (r.prose) parts.push('【正文】\n' + r.prose)
        return '【第 ' + String(r.turn) + ' 轮】\n' + parts.join('\n\n')
      })
      .join('\n\n')
  )
}

const SESSION_RECALL_SCOPES = new Map<string, RecallScopeState>()
const SESSION_RECALL_COOLDOWNS = new Map<string, RecallCooldown[]>()

export function recallScopeOf(sessionId: string): RecallScopeState {
  let scope = SESSION_RECALL_SCOPES.get(sessionId)
  if (!scope) {
    scope = createRecallScope()
    SESSION_RECALL_SCOPES.set(sessionId, scope)
  }
  return scope
}

export function recallCooldownsOf(sessionId: string): RecallCooldown[] {
  return SESSION_RECALL_COOLDOWNS.get(sessionId) ?? []
}

export function setRecallCooldowns(sessionId: string, cooldowns: RecallCooldown[]): void {
  SESSION_RECALL_COOLDOWNS.set(sessionId, cooldowns)
}

export function forgetRecall(sessionId: string): void {
  SESSION_RECALL_SCOPES.delete(sessionId)
  SESSION_RECALL_COOLDOWNS.delete(sessionId)
}

export function forgetAllRecall(): void {
  SESSION_RECALL_SCOPES.clear()
  SESSION_RECALL_COOLDOWNS.clear()
}

export interface SessionEventLike {
  type: string
  data?: unknown
  seq?: number
}

export function extractRecallRounds(events: readonly SessionEventLike[]): RecallRound[] {
  const rounds: RecallRound[] = []
  let currentRound: RecallRound | null = null
  let turnCounter = 0

  for (const event of events) {
    if (event.type !== 'user/message' && event.type !== 'assistant/message') continue
    if (rrpPayloadOf(event) !== undefined) continue
    if (isPluginNotice(event)) continue

    const blocks: string[] = []
    collectTextBlocks(event.data, blocks)
    const text = blocks.join('\n').trim()
    if (text.length === 0) continue

    if (event.type === 'user/message') {
      if (isHostReminder(text)) continue
      currentRound = {
        turn: turnCounter++,
        player: text,
        prose: '',
      }
      rounds.push(currentRound)
    } else if (event.type === 'assistant/message') {
      if (currentRound) {
        currentRound.prose = currentRound.prose ? currentRound.prose + '\n\n' + text : text
      } else {
        currentRound = {
          turn: turnCounter++,
          player: '',
          prose: text,
        }
        rounds.push(currentRound)
      }
    }
  }

  return rounds
}

interface ReadHandleLike {
  read(offset?: number, length?: number): Promise<{ events: readonly unknown[] }>
  close(): Promise<void>
}

export interface PersistenceService {
  open(id: string, access: 'read'): Promise<ReadHandleLike>
}

/**
 * Read recall rounds for a session: prefer the persisted event log, degrade to
 * the worldline digest projection. Shared by the recall HTTP route/tool and the
 * Copilot's proactive history injection.
 */
export async function fetchSessionRounds(
  sessionId: string,
  session: SessionLike | undefined,
  projections: ProjectionsService | undefined,
  persistence: PersistenceService | undefined,
): Promise<RecallRound[]> {
  if (persistence !== undefined) {
    try {
      const handle = await persistence.open(sessionId, 'read')
      try {
        const { events } = await handle.read()
        return extractRecallRounds(events as never[])
      } finally {
        await handle.close()
      }
    } catch {
      // Degrade to projection
    }
  }

  if (session !== undefined && projections !== undefined) {
    try {
      const digest = projections.stateOf(session, WORLDLINE_DIGEST_KEY) as
        WorldlineDigest | undefined
      if (digest && Array.isArray(digest.turns)) {
        return digest.turns.map((t) => ({
          turn: t.turn,
          player: t.player,
          prose: t.prose,
        }))
      }
    } catch {
      // Degrade
    }
  }

  return []
}
