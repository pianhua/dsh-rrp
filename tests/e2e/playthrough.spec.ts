import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { WORLD_STATE_KEY } from '../../src/world-state/world-state.ts'
import {
  WORLD_STATE_TIMELINE_KEY,
  type WorldStateTimeline,
} from '../../src/world-state/world-state-timeline.ts'
import { TRANSCRIPT_KEY, type TranscriptSlice } from '../../src/transcript.ts'
import { interpolateCardText } from '../../src/cards/card-types.ts'
import type { CardPackPlayerView } from '../../src/cards/card-types.ts'
import type { WorldState } from '../../src/world-state/world-state.ts'
import { RRP_ROUTES } from '../../src/route-contract.ts'
import {
  AUTHOR_GOLD,
  AUTHOR_MARKER,
  CHRONICLER_GOLD_CHANGE,
  STUB_PROVIDER,
  applyChroniclerChange,
} from './support/stub-plan.mjs'
import {
  firstSurfaceEvent,
  foldEvents,
  proseEntries,
  readSessionEvents,
} from './support/disk-fold.ts'
import { startIsolatedHost, type IsolatedHost } from './support/isolated-host.ts'

/**
 * 票据 04：完整玩局断言链 —— 开卡 → 玩家消息 → 正文 → Chronicler 结算 → 世界状态/时间线变化
 * → 独立读盘 → 重启不丢。一条测试跑完（验收即「一条完整玩局断言链」），断言不只看投影：
 * 磁盘上的会话日志被独立折叠一遍并与投影对账。
 *
 * 负向对照：`DSH_RRP_E2E_WRONG_GOLD=1 pnpm run test:e2e` 必须非零退出——桩把 Author 正文
 * 换成 WRONG_GOLD，`Author 正文落盘` 一项立即失败（见 tests/README.md 的复述步骤）。
 */

const repoRoot = resolve(import.meta.dirname, '../..')
const CARD_ID = 'yanmen-inn'
const REQUEST_ID = 'e2e-req-playthrough-1'
const PLAYER_LINE = `${AUTHOR_MARKER}：她起身，推门看了一眼门外的雪。`
const BOOT_TIMEOUT_MS = 180_000
const TURN_TIMEOUT_MS = 60_000

const supportDir = resolve(import.meta.dirname, 'support')
const auditFile = resolve(repoRoot, `.scratch/e2e-playthrough-audit-${process.pid}.jsonl`)

function pause(ms: number): Promise<void> {
  return new Promise((resolvePause) => {
    setTimeout(resolvePause, ms)
  })
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init)
  const body = await response.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new Error(`非 JSON 响应（HTTP ${response.status}）：${body.slice(0, 400)}`)
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}：${JSON.stringify(parsed).slice(0, 400)}（${url}）`)
  }
  return parsed
}

async function waitFor<T>(
  poll: () => Promise<T | undefined>,
  what: string,
  timeoutMs = TURN_TIMEOUT_MS,
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await poll()
    if (value !== undefined) return value
    if (Date.now() > deadline) throw new Error(`等待超时：${what}`)
    await pause(150)
  }
}

/** `provenance.at` 是时钟值（nowIso），跨跑不稳定；对账时统一抹平。 */
function withStableAt(timeline: WorldStateTimeline): WorldStateTimeline {
  return {
    ...timeline,
    batches: timeline.batches.map((batch) => ({
      ...batch,
      provenance: { ...batch.provenance, at: '<volatile>' },
    })),
  }
}

describe('完整玩局断言链（play-e2e 票据 04）', () => {
  let host: IsolatedHost | undefined

  afterAll(async () => {
    await host?.close()
    if (process.env.DSH_RRP_E2E_KEEP_AUDIT === '1') {
      console.log('AUDIT-FILE', auditFile)
      return
    }
    await rm(auditFile, { force: true })
  })

  it(
    '开卡 → 玩一轮 → Chronicler 结算 → 独立读盘一致 → 重启后仍在',
    { timeout: BOOT_TIMEOUT_MS * 2 },
    async () => {
      // The plugin's package main is lib/index.js, so a stale or missing build would measure
      // the wrong code — same guard as the ticket 01 boot spec.
      expect(existsSync(resolve(repoRoot, 'lib/index.js')), 'E2E 前必须先 pnpm run build').toBe(
        true,
      )

      host = await startIsolatedHost({
        repoRoot,
        profileName: 'play',
        stubPlugin: resolve(supportDir, 'stub-model.mjs'),
        driverPlugin: resolve(supportDir, 'driver-plugin.mjs'),
        stubProvider: STUB_PROVIDER,
        auditFile,
        cardStateFile: resolve(repoRoot, 'cards', CARD_ID, 'state.json'),
      })
      const base = host.baseUrl
      const card = (
        (await fetchJson(`${base}${RRP_ROUTES.cardOne}?id=${CARD_ID}`)) as {
          card: CardPackPlayerView
        }
      ).card
      expect(card.id).toBe(CARD_ID)
      expect(card.initialState).not.toBeNull()
      const openingBody = card.openings[0]?.body
      expect(openingBody).toBeTruthy()

      // ── 开局：画廊顺序（create → select → start → prompt），真实 POST /dsh-rrp/start，
      //    禁止 session.append 造开局（V4 受保护头）。select 必须早于 start（路由校验
      //    preset 匹配），而 agent 组合随首次需要发生——loop 的回合计数器在组合时冻结，
      //    时序错了冷读即拒（见交付评论）。────────────────────────────────────────────
      const created = (await fetchJson(`${base}/dsh-rrp-e2e/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })) as { sessionId: string; agentPreset?: string }
      // 裸 create 采用部署默认 preset（standard）；真正的 RP preset 在 /select 切换。
      expect(created.sessionId).toBeTruthy()
      const sessionId = created.sessionId
      const selected = (await fetchJson(`${base}/dsh-rrp-e2e/select`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, presetId: `rp-${CARD_ID}` }),
      })) as { ok: boolean }
      expect(selected.ok).toBe(true)

      const started = (await fetchJson(`${base}${RRP_ROUTES.start}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: created.sessionId,
          state: card.initialState,
          opening: openingBody,
          card: {
            id: card.id,
            name: card.meta.name,
            persona: card.persona,
            worldCore: card.worldCore,
            player: card.meta.player,
          },
        }),
      })) as { ok: boolean; cardWritten: boolean; stateWritten: boolean; openingWritten: string }
      expect(started).toEqual({
        ok: true,
        cardWritten: true,
        stateWritten: true,
        openingWritten: 'assistant',
      })

      const projectionsOf = async (): Promise<Record<string, unknown> | undefined> => {
        const body = (await fetchJson(
          `${base}/dsh-rrp-e2e/projections?sessionId=${encodeURIComponent(sessionId)}`,
        )) as { values?: Record<string, unknown> } | null
        return body?.values
      }

      // ── 玩一轮：带标记玩家消息 → 正文逐字节等于剧本 → 等 Chronicler 结算落盘 ─────────
      await fetchJson(`${base}/dsh-rrp-e2e/prompt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, requestId: REQUEST_ID, text: PLAYER_LINE }),
      })

      const turn = await waitFor(async () => {
        const values = await projectionsOf()
        const slice = values?.[TRANSCRIPT_KEY] as TranscriptSlice | undefined
        const entries = slice?.entries ?? []
        const userIndex = entries.findIndex(
          (entry) => entry.role === 'user' && entry.text.includes(AUTHOR_MARKER),
        )
        if (userIndex < 0) return undefined
        const reply = entries
          .slice(userIndex + 1)
          .find((entry) => entry.role === 'assistant' && entry.text.length > 0)
        return reply === undefined ? undefined : { reply, slice }
      }, '带标记玩家消息与其后的 Author 正文落盘')
      // 负向对照在这里失败：WRONG_GOLD 被换进正文，与剧本常量不符。注意转录折叠会把
      // 正文统计两遍（message.content 与 stream 的 block-end 块各一次，生产现状，见票据
      // 04 交付评论），所以逐字节断言落在磁盘事件的 content 块上，条目级只断言包含。
      expect(turn.reply.text, '转录条目必须包含 Author 正文').toContain(AUTHOR_GOLD)

      await waitFor(async () => {
        const values = await projectionsOf()
        const slice = values?.[TRANSCRIPT_KEY] as TranscriptSlice | undefined
        return slice !== undefined && slice.lastFoldSeq >= turn.reply.seq ? slice : undefined
      }, 'Chronicler 结算落盘（lastFoldSeq 推进到正文 seq）')

      // 落盘 checkpoint：持久层缓冲事件，独立读盘前先把会话冲到 $DSH_HOME。
      await fetchJson(`${base}/dsh-rrp-e2e/flush?sessionId=${encodeURIComponent(sessionId)}`)
      const events = await readSessionEvents(resolve(host.root, 'sessions'), sessionId)
      const diskReplyEvent = events.find(
        (event) => event.type === 'assistant/message' && event.seq === turn.reply.seq,
      )
      expect(diskReplyEvent, '正文事件必须已落盘').toBeDefined()
      const diskReplyText = (
        (diskReplyEvent?.data as { message?: { content?: Array<{ text?: string }> } }).message
          ?.content ?? []
      )
        .map((block) => block.text ?? '')
        .join('')
      expect(diskReplyText, 'Author 正文逐字节等于桩剧本 AUTHOR_GOLD').toBe(AUTHOR_GOLD)

      const live = (await projectionsOf()) as Record<string, unknown>
      const liveWorldState = live[WORLD_STATE_KEY] as WorldState
      const liveTimeline = live[WORLD_STATE_TIMELINE_KEY] as WorldStateTimeline
      const liveSlice = live[TRANSCRIPT_KEY] as TranscriptSlice

      // ── 状态断言：世界状态 = 卡包初始 + 剧本变更（单一事实源，两边各自推导）───────────
      const cardInitial = JSON.parse(
        await readFile(resolve(repoRoot, 'cards', CARD_ID, 'state.json'), 'utf8'),
      ) as WorldState
      const expectedState = applyChroniclerChange(cardInitial) as unknown as WorldState
      expect(liveWorldState, '投影世界状态 != 卡包初始 + 剧本变更').toEqual(expectedState)

      // ── 状态断言：时间线 = baseline + chronicler changes（actor/turn/旧值新值）────────
      expect(liveTimeline.batches).toHaveLength(2)
      expect(liveTimeline.batches[0]).toMatchObject({
        kind: 'baseline',
        snapshot: 'initial-state',
        provenance: { actor: 'initial-state' },
        origin: 'local',
      })
      const changeBatch = liveTimeline.batches[1]
      expect(changeBatch?.kind).toBe('changes')
      // storyTurn 是 agent loop 的回合编号：loop 在 create 时挂载（turnBoundary=0），
      // 开局由 start 路由事后追加的 turn 1/2 不计入——首个玩家回合因此是 storyTurn 1
      // 而非日志序号 3（生产现状，见票据 04 交付评论）。
      expect(changeBatch).toMatchObject({
        provenance: { actor: 'chronicler', storyTurn: 1, evidence: expect.any(String) },
        origin: 'local',
      })
      expect(
        (changeBatch as { changes: unknown[] }).changes,
        '时间线变更必须恰好是剧本的一改一加，旧值新值正确',
      ).toEqual([
        {
          type: 'modified',
          objectId: 'inn',
          field: 'trackedObjects.fields.time.value',
          before: '入夜，封关第一晚',
          after: CHRONICLER_GOLD_CHANGE.timeValue,
        },
        {
          type: 'added',
          objectId: CHRONICLER_GOLD_CHANGE.event.id,
          field: 'currentEvents',
          after: CHRONICLER_GOLD_CHANGE.event,
        },
      ])
      expect(liveSlice.lastFoldSeq).toBe(turn.reply.seq)

      // B1 邻接守卫：真实变更必须以全文送达模型（面包屑只准出现在「渲染未变」的元数据车道）。
      const lastFacts = liveSlice.facts?.text ?? ''
      expect(
        lastFacts.includes(CHRONICLER_GOLD_CHANGE.timeValue),
        'Chronicler 提交的事实车道必须携带新状态全文，不得只发面包屑',
      ).toBe(true)

      // ── 独立读盘：从 $DSH_HOME 的 JSONL 本身折叠，与投影对账（界面通过 ≠ 落盘正确）───
      expect(events.length).toBeGreaterThan(0)
      const disk = foldEvents(events)

      expect(
        firstSurfaceEvent(events)?.type,
        'V4 受保护头：首个 surface 事件必须 system/message',
      ).toBe('system/message')
      const openingEvent = events.find(
        (event) =>
          event.type === 'assistant/message' && (event.data as { turn?: number }).turn === 2,
      )
      expect(openingEvent).toBeDefined()
      const openingText = (
        (openingEvent?.data as { message?: { content?: Array<{ text?: string }> } }).message
          ?.content ?? []
      )
        .map((block) => block.text ?? '')
        .join('')
      expect(openingText).toBe(interpolateCardText(openingBody ?? '', card.meta.player))
      const promptEvent = events.find(
        (event) =>
          event.type === 'user/message' &&
          (event.data as { source?: { rpcId?: string } }).source?.rpcId === REQUEST_ID,
      )
      expect(promptEvent, 'requestId 必须持久化在受理的玩家消息上').toBeDefined()

      expect(disk.worldState, '读盘折叠的世界状态 != 投影').toEqual(liveWorldState)
      expect(withStableAt(disk.timeline), '读盘折叠的时间线 != 投影').toEqual(
        withStableAt(liveTimeline),
      )
      expect(disk.lastFoldSeq, '读盘折叠的转录游标 != 投影').toBe(liveSlice.lastFoldSeq)
      const prose = proseEntries(events)
      expect(prose).toEqual(
        expect.arrayContaining([expect.objectContaining({ role: 'user', text: PLAYER_LINE })]),
      )
      const proseReply = prose.find(
        (entry) => entry.role === 'assistant' && entry.seq === turn.reply.seq,
      )
      expect(proseReply?.text, '读盘散文条目必须包含 Author 正文').toContain(AUTHOR_GOLD)

      // ── 审计：每次 stream 进入都有收尾（无重试长尾），调用方计数精确 ────────────────
      const audit = (await readFile(auditFile, 'utf8'))
        .trim()
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as { at: string; caller?: string })
      const enters = audit.filter((entry) => entry.at === 'stream-enter')
      const finishes = audit.filter((entry) => entry.at === 'stream-finish')
      expect(
        finishes.length,
        '每次 stream 进入都必须以 finish 收尾（无 EMPTY_RESPONSE 重试）',
      ).toBe(enters.length)
      const callers = enters.map((entry) => entry.caller)
      expect(callers.filter((caller) => caller === 'author')).toHaveLength(1)
      // 开场回合一次 no-op 折叠 + 标记回合一次提交折叠；头部回合空转录不触发模型。
      expect(callers.filter((caller) => caller === 'chronicler')).toHaveLength(2)

      // ── 重启不丢（数据面）：关闭宿主 → 同一 DSH_HOME 再起 → 读同一 Session 的日志并
      //    独立折叠，世界状态/时间线/转录游标全部与玩局现场一致。
      //    宿主进程内冷读（sessionQuery 重放）被「回合号不连续」拒读——那是 issue 06
      //    的生产级发现（loop 计数器在组合时冻结 vs 开局路由预写回合）；本票据守
      //    数据面：日志在磁盘上、独立于任何宿主进程折叠得出同一状态。────────────
      const keptRoot = host.root
      await host.close({ preserveRoot: true })
      host = await startIsolatedHost({
        repoRoot,
        root: keptRoot,
        profileName: 'play',
        stubPlugin: resolve(supportDir, 'stub-model.mjs'),
        driverPlugin: resolve(supportDir, 'driver-plugin.mjs'),
        stubProvider: STUB_PROVIDER,
        auditFile,
        cardStateFile: resolve(repoRoot, 'cards', CARD_ID, 'state.json'),
      })
      const replayedEvents = await readSessionEvents(resolve(host.root, 'sessions'), sessionId)
      expect(replayedEvents.length, '重启后同一 DSH_HOME 的日志不得丢事件').toBe(events.length)
      const replayed = foldEvents(replayedEvents)
      expect(replayed.worldState, '重启后独立折叠的世界状态 != 玩局现场').toEqual(liveWorldState)
      expect(withStableAt(replayed.timeline), '重启后独立折叠的时间线 != 玩局现场').toEqual(
        withStableAt(liveTimeline),
      )
      expect(replayed.lastFoldSeq, '重启后转录游标 != 玩局现场').toBe(liveSlice.lastFoldSeq)
    },
  )
})
