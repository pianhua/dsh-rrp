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
