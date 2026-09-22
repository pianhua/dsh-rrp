# 外部记忆扩展（MEMORY.md）

> **回答的问题**：记忆能力放在哪里？外部记忆插件（EverOS 方向）如何与本插件协作？我们**绝不**做什么？
> 契约层：[`DECISIONS.md`](DECISIONS.md) D12 · [`HOST_ALIGNMENT.md`](../HOST_ALIGNMENT.md) 红线。

---

## 1. 决策（D12）

**记忆是「本插件之上」的可扩展内容，不是核心内建能力。** 核心引擎保持轻量：不内建向量库、嵌入模型、索引引擎、跨会话数据库。EverOS 等外部记忆插件作为独立 DSH 插件挂载，通过宿主接缝与本插件协作。

---

## 2. 宿主已提供的接缝（必须复用）

| 需求 | 宿主能力 | 用法 |
| :--- | :--- | :--- |
| 会话历史检索 | `ctx.sessionQuery`（`@deepseek-ai/dsh-session-query` + sqlite backend） | `listSessions` / `readSession` / `filterEvents` / `searchEvents`（后端提供排名全文检索）；**不要**自己解析落盘文件或建索引 |
| 长期设定知识 | Skills（`@deepseek-ai/dsh-skill`） | 稳定世界观写成 `SKILL.md`，按需调取（见 [`SKILLS.md`](SKILLS.md)） |
| 把召回内容注入执笔 | `agent/pre-step` waterfall | 与 Author 事实基线同一接缝：往 `decision.messages` 插入 user-role 上下文 |
| 给 Author 一个记忆工具 | 官方 `ctx.tools.register` / `@deepseek-ai/dsh-tool-*` | 记忆插件提供自己的工具行，挂进 RP 模式 |

> 关键约束：preset 行的包名从 **harness base** 解析。profile 本地安装的记忆插件不能直接写进 RP preset 的 `name`；它应作为**宿主平面插件**挂载，并在运行时按 `agentPreset` 门控（与 Chronicler / Summarizer 同法）。

---

## 3. 我们对外的只读契约

外部插件**不要**去读会话内部结构或我们的私有字段。唯一受支持的读入口子路径是：

```ts
import {
  WORLD_STATE_KEY, SUMMARY_KEY, rrpPayloadOf,
  type WorldState, type MacroSummary, type RrpStatePayload,
} from 'dsh-rrp/contracts'

// 读取某个会话当前的世界状态 / 大局编年（宿主投影 registry 的同步切面）：
const worldState = ctx.sessionProjections.stateOf(session, WORLD_STATE_KEY) as WorldState | undefined
const summary = ctx.sessionProjections.stateOf(session, SUMMARY_KEY) as MacroSummary | null | undefined

// 直接读日志时：我们的结构面寄存在普通 user/message 的 source.rrp
const payload = rrpPayloadOf(event) as RrpStatePayload | undefined
```

- `lib/contracts.js` / `lib/types/contracts.d.ts` 由构建产出，是稳定面；
- **投影键**是契约，变更视为破坏性变更；我们**不自造会话事件类型**（宿主词表封闭，见 [HOST_SEAMS.md](HOST_SEAMS.md) §A5），状态一律寄存在 `user/message` 的 `source.rrp`，`rrpPayloadOf` 是唯一受支持的读法；
- 状态本身由整值事件 + 纯折叠得出，fork 后天然可重放（见 [`WORLDLINES.md`](WORLDLINES.md)）。

---

## 4. EverOS 方向接入建议

1. 把 EverOS（或同类）作为**独立 DSH 插件**挂载到 RP profile；
2. 它用自己的存储/索引承载长期记忆，用 `ctx.sessionQuery` 读取会话历史做增量摄取；
3. 它按 `agentPreset === 'rp'` 门控，在 `agent/pre-step` 注入召回片段，或提供一个只读记忆工具；
4. 需要「当前世界状态 / 大局观」时，走 §3 的契约读取，而不是复制我们的内部实现；
5. 本插件**不需要**为它写任何核心代码，也不需要它为我们写适配。

---

## 5. 反模式（不要做）

| ❌ 反模式 | 为什么 |
| :--- | :--- |
| 在核心内建向量库 / 嵌入 / 索引引擎 | 违反 D12 与「个人玩具」定位；维护成本高、收益可由外置替代 |
| 自建跨会话数据库管理 | 宿主已有 session-query / storage / persistence |
| 让记忆插件直接读我们的私有字段 | 只走 `dsh-rrp/contracts` 契约 |
| 把每轮变化都写进长期记忆/技能 | 每轮变化的家是 WorldState；记忆是「跨会话」的，不是「每轮」的 |
| 为某个具体记忆实现写死适配 | 保持外置、可选、可替换 |
