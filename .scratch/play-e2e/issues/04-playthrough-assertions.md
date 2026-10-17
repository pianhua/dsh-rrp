# 票据 04：完整玩局断言链（含独立读盘与重启不丢）

> Status: ready-for-agent · 依赖：票据 03 · 规格真源：[`spec.md`](../spec.md) §4 §5

## 目标

一条测试跑完「开卡 → 玩家消息 → 正文 → Chronicler 结算 → 世界状态/时间线变化 → 重启后仍在」，并且**断言不只看投影**。

## 范围

1. **开局**：走真实 `POST /dsh-rrp/start`（`src/start.ts:164-289`），**禁止**自己 `session.append` 造开局——V4 受保护头不变式（`:70-90`）正是这条链要保护的。
2. **玩一轮**：发一条带 Author 标记的玩家消息 → 等 `assistant/message` 落盘 → 等 `ctx.jobs` 上的 Chronicler 结算完成（等 `turn/end` 类持久事件，不轮询 `agent/status`）。
   - **无头驱动入口（已查明，勿再翻）**：`ctx.sessionController.create(request)`
     （`dsh-api-session-controller/lib/types/index.d.ts:93`）与
     `prompt({ requestId, sessionId, mode: 'queue', content })` → `{ accepted: true }`（`:163`、`types.d.ts:319-331`）。
     `requestId` 是客户端铸造、持久化在实际受理的那条 user 消息上的身份，**必须确定性生成**，
     否则逐字节复跑断言当场失效。
   - 承载方式：在隔离 profile 里再插一个 e2e 驱动插件（测试脚手架，不进生产代码），
     通过它调用上述命令，而不是去逆向宿主的 HTTP/RPC 线格式。
3. **状态断言**：WorldState 出现预期变更；WorldState Timeline 新增一条分组事件，`actor`/`turn`/旧值新值正确。
4. **独立读盘**：除投影外，再从**会话日志本身**读一遍 `source.rrp` 载荷并折叠，断言与投影一致。这是参照项目最值得抄的一条纪律——界面通过 ≠ 落盘正确。
5. **重启不丢（数据面）**：关闭隔离宿主 → 用同一 `DSH_HOME` 再起 → 读同一 Session → 世界状态、时间线、转录游标（`stateFoldSeq`）全部折叠得出。UI 可见性归票据 05。
6. **回归探针**：临时把 `src/state-publisher.ts` 的元数据短路改回旧行为（B1 修复，`82ddf5e`），确认本票据的某条断言会失败；确认后改回，并把这条"哪条断言守住了什么"写进 `tests/README.md`。

## 约束

- 断言里**不写死剧本原文**，用桩导出的常量，避免双处维护；
- 不新增宿主事件类型、不改 `source.rrp` 契约形状（铁律一与持久化契约优先）；
- 每轮新增的模型可见文本必须逐字节稳定 —— 若本票据暴露出前缀被无谓改动，那是发现，不是要顺手改的东西。

## 验收

- `pnpm run test:e2e` 在无 `DEEPSEEK_API_KEY` 环境下通过；连跑 3 次结果一致；
- 第 6 条回归探针实际做过一次并在 `tests/README.md` 留下结论；
- 全量质量门 + `pnpm run build` 通过。

**2026-10-17 交付**：`tests/e2e/playthrough.spec.ts` 一条链跑通「开卡 → 带标记玩家消息 →
Author 正文 → Chronicler 结算 → 世界状态/时间线断言 → 独立读盘对账 → 重启后独立折叠仍
一致」。Chronicler 真信封替换占位常量：对着 `chroniclerReplySchema` 造，单测用生产
`parseChroniclerReply` 断言接受；剧本变更（`CHRONICLER_GOLD_CHANGE`）是桩侧与断言侧的
单一事实源，expected state 由两边各自「卡包 state.json + 同一变更字面量」推导。
负向对照端到端证明随本票落地（票据 03 转 resolved），命令写进 `tests/README.md`。

交付时推翻/发现（按本票「暴露即发现」约束，只记录不顺手改）：

1. **回合号结构性碰撞（生产级，已立 issue 06）**：开局路由预写 turn 1/2，而宿主
   loop 的回合计数器在 preset 组合时冻结于 0——首个玩家回合被编号 turn 1，宿主
   v4 准入（`turn/start` 必须开 `nextTurn`）在冷读时拒读整个日志。热进程不跑准入
   折叠器所以一直没炸。preset 选择被 `agent-preset/locked` 焊死在首个回合之前，
   碰撞无解于现有宿主接缝。→ 本票重启验收按数据面收口：关闭宿主、同一 DSH_HOME
   再起、**磁盘日志独立折叠**与玩局现场逐字节一致；宿主进程内冷读断言移交 issue 06。
2. **转录折叠把正文统计两遍**：`collectTextBlocks` 递归整条事件，loop 落的事件同时
   带 `message.content` 与 `stream[].chunk.block-end.block`（各含全文）→ 散文条目
   文本 = 正文\n正文。Chronicler 一直在读双份散文（无语义害、纯浪费）。逐字节断言
   因此落在磁盘事件的 content 块上，条目级只断言包含。
3. **loop 在玩家回合后追加 `<system-reminder>` 用户消息**：标记词检测必须用
   「最新非提醒用户文本」（`latestPlayerText`），否则 Author 场景选不中剧本。
4. **首个 prompt 伴随一次标题 LLM 调用**（unknown caller，剧本回中性文本当标题），
   审计断言按调用方多重集精确计数（author=1、chronicler=2），顺带钉死无重试长尾。
5. **持久层缓冲事件**：「落盘」断言前必须经 `sessions.flush`（驱动 /flush 路由），
   否则磁盘读不到最新事件。
6. **storyTurn=1 而非日志序号 3**：时间线批次的故事回合取 loop 计数（组合时冻结），
   与日志序号是两套数——断言按真相钉为 1。
7. **B1 回归探针不可达（仪式已做，结论在 tests/README.md）**：自然玩局里
   fold/timeline-only 元数据分支无生产触发源（Chronicler 空 diff 直接跳过发布 +
   模型侧渲染无损），回退 `82ddf5e` 重跑本链**依旧全绿**——该分支由
   `tests/unit/state-publisher.spec.ts` 守护；本链另加邻接守卫（真实变更必须全文
   送达模型）。重开条件：未来出现「渲染未变却推进游标/批次」的生产调用方。

Status: resolved（重启的宿主冷读项移交 issue 06，理由与 reopen 条件见该票）
