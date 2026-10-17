# 票据 03：调用方识别 + 负向对照

> Status: claimed（调用方识别已交付；负向对照的端到端证明待票据 04）· 依赖：票据 02 · 规格真源：[`spec.md`](../spec.md) §4

## 开工前的两处自我纠正（2026-10-17，写本票时还不知道）

1. **删掉「触发 Chronicler 真实工具调用」这条**。它是从参照项目的 MVU 工具形状照搬来的臆想：
   我方 Chronicler 走 `collectText(stream)` → `parseChroniclerReply(text)`（`src/chronicler.ts:253,331`），
   **是纯文本 JSON，不使用工具调用**。按臆想的需求去实现会凭空造一条生产侧不存在的通路。
2. **标记词不能只靠玩家消息**。后台智体的 user prompt 由我方代码从转录拼装，往里面塞标记
   等于为测试改生产提示词，规格 §4 非目标明令禁止。

## 目标

让桩**认得出是谁在调用**，并让这套测试具备「证明自己会失败」的能力。

## 范围

### 1. 按调用方身份选剧本（零生产改动）

`GenerateOptions` 提供了稳定信号：loop 构造的请求，其**首条 system 角色消息即系统提示词**；
one-shot 调用则走 `input.system`（`dsh-llm/lib/types/types.d.ts:495-506`）。
三个智体的身份行本身受 `tests/unit/agents-contract.spec.ts` 守护，可直接作为签名：

| 调用方 | 稳定签名 |
| :--- | :--- |
| Author | `You are the Author Agent of DSH-Chronicle`（`src/agents/author.ts:24`） |
| Chronicler | `状态推演（Chronicler Agent）`（`src/agents/chronicler.ts:32`） |
| Copilot（月停） | `你是「月停」——`（`src/agents/copilot.ts:53`） |

剧本选择顺序：先认调用方，再在 Author 请求里用玩家消息中的标记词细分场景
（参照 `dsh-tavern/tests/e2e/model.mjs:110-113`）。输出必须确定性：禁时钟、禁 uuid、禁随机。

### 2. 负向对照（这套测试可信度的来源）

- 环境变量 `DSH_RRP_E2E_WRONG_GOLD=1` 时，桩给出与断言不符的输出（参照 `gameplay.mjs:90,116` 的
  「提交 9、断言要 10」）。
- 期望：该命令**非零退出**，且失败信息指名是哪条断言挂的。
- 参照 `dsh-tavern/tests/e2e/README.md:84-88`：把「必须失败」写成一条可复述的验证步骤。

## 验收

- 三种调用方签名各返回正确剧本；无签名请求返回中性文本；
- 同一请求连跑 5 次输出逐字节一致；
- `DSH_RRP_E2E_WRONG_GOLD=1` 下 E2E 非零退出（人工确认一次并把命令写进 `tests/README.md`）；
- 全量质量门通过。

## out-of-scope / 移交

**Chronicler 真信封剧本移交票据 04**：它要对着 `chroniclerReplySchema` 造，而只有在真实回合里
跑一遍才知道能否被 `parseChroniclerReply` 接受并折叠成状态变更。在没有驱动面的情况下写它，
等于写一个"看起来像 schema"的猜测对象——票据 02 交付时已把占位常量明确标为待替换。

## Comments

**2026-10-17 部分交付**：调用方识别已落地——`systemTextOf()` 兼容 loop（首条 system 消息）与
one-shot（`input.system`）两种请求形状，`callerOf()` 按三个智体受契约守护的身份行判定，
`planBlocks(input, {wrongGold})` 先认调用方再分场景。`DSH_RRP_E2E_WRONG_GOLD` 由插件在边界读取，
剧本层保持纯函数。单测 6 例 + 集成 3 例，全量 66 文件 / 530 用例通过。

**仍欠一项，且现在无法证明**：`DSH_RRP_E2E_WRONG_GOLD=1` 必须让 E2E 非零退出。这条要等票据 04
出现"会被错误输出违反的断言"才谈得上验证——在那之前任何"已验证"的声明都是假的，所以本票保持
`claimed`，把这一项与驱动面一起收口。

**2026-10-17 收口（票据 04 交付时）**：负向对照的端到端证明已落地——
`DSH_RRP_E2E_WRONG_GOLD=1 pnpm run test:e2e` 非零退出（vitest exit=1），失败即
`转录条目必须包含 Author 正文` 一项，收到的正是 `E2E_WRONG_GOLD_OUTPUT`。命令与
结论复述在 `tests/README.md`。本票转 **resolved**。
