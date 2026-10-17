# 票据 03：标记词剧本 + 负向对照

> Status: ready-for-agent · 依赖：票据 02 · 规格真源：[`spec.md`](../spec.md) §4

## 目标

让同一个桩覆盖多轮场景，**不写 fixture 文件**；并让这套测试具备"证明自己会失败"的能力。

## 范围

### 1. 标记词驱动（照抄参照项目的机制）

- 桩读 `options` 里**最新一条用户消息文本**，按其中出现的标记选择剧本：
  - 命中「玩家行动」标记 → 返回一段正文（Author 剧本）；
  - 命中「状态推演」上下文标记 → 返回合法 Chronicler 信封（完整 `state` 或 `patch`，见 `src/agents/chronicler.ts` 的 `chroniclerReplySchema`）；
  - 无标记 → 返回中性文本。
- 参照实现：`dsh-tavern/tests/e2e/model.mjs:110-113`（标记选剧本）、`:107,117`（**按已存在的 `tool-result` id 去重**，避免同一轮重复调用工具时二次提交）、`:107` 起的 `tools.has(...)` 条件产出。
- 剧本必须**确定性**：同一输入永远同一输出（禁 `Date.now()`/`randomUUID()` 进输出文本），否则票据 04 的逐字节断言与"连跑 3 次一致"直接失效。
- 剧本要能触发 Chronicler 的**真实工具调用**（`ctx.tools` 路径），不是只发文本。

### 2. 负向对照（这条是这套测试可信度的来源）

- 环境变量 `DSH_RRP_E2E_WRONG_GOLD=1` 时，桩故意给出**与断言不符**的输出（参照 `gameplay.mjs:90,116` 的"提交 9、断言要 10"）。
- 期望：该命令**非零退出**，且失败信息指名是哪一条断言挂的。
- 参照 `dsh-tavern/tests/e2e/README.md:84-88` 的写法：把"必须失败"本身写成一条可复述的验证步骤。

## 验收

- 无标记 / Author 标记 / Chronicler 标记三种输入各产出正确剧本；
- 同一标记连跑 5 次，输出逐字节一致；
- `DSH_RRP_E2E_WRONG_GOLD=1` 下 E2E 非零退出（人工确认一次并把命令写进 `tests/README.md`）；
- 全量质量门通过。

## out-of-scope

不接浏览器（05）、不改生产代码去"方便取标记"。
