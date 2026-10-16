# 统一 AgentPromptContract：结构统一，内容分流（issue #32）

> 状态：接受
> 原编号：D18 · 索引见 [README.md](./README.md)


**决策**：全仓五个 Agent（Author / Chronicler / Summarizer / Scribe / Copilot）统一接入 `src/agents/contract.ts` 的 `AgentPromptContract` 接口（`id` / `name` / `systemPrompt` / `buildUserPrompt` / `parseReply` / `outputSchema`），系统提示词统一六层结构（身份 → 职责 → 输入契约 → 铁律红线 → 输出契约 → 质量自检）。**只统一工程结构，绝不照搬业务内容**：Author 的 Creative License 与反 AI 腔词库永不进入后台数据管道，后台 Agent 的 JSON 纪律也永不约束 Author 的正文。

**理由**：
- 审计（issue #32）证实 Author 提示词工业级、后台四智体结构断层（Summarizer 仅 15 行、Scribe 手写 indexOf 解析、软约束与 Zod 硬校验漂移）；
- 六层骨架来自 Claude Code / Devin / Manus 等一线 Agent 系统提示词的共性提炼（负向约束编号化、字面反例、输出前自检、失败语义显式化、示例紧贴规则）。

**含义**：
- Author 提示词单一来源为 `src/agents/author.ts` 的 `AUTHOR_SYSTEM_PROMPT`；`presets/rp/agent.cordis.yml` 只留 `__DSH_RRP_AUTHOR_PROMPT__` token，物化时 `src/preset.ts` 以 6 空格块标量缩进注入（单测断言与常量逐字节一致）；
- 结构化 Agent 必须绑定 Zod schema（Scribe 新补 `scribeDraftSchema`，Copilot 新补 `copilotActionBlockSchema`）；软提示上限必须与 schema 硬上限逐字对齐（Summarizer 转折/伏笔 max 5）；
- 契约不变式由 `tests/agents-contract.spec.ts` 守护（接口齐全、schema 绑定、token 不泄漏、Creative License 不串味、上下限对齐）；
- `/lore` `/summary` 纯文本兜底拦截段留守卫在 Author 提示词内：宿主 seam 清单（HOST_SEAMS.md :337-348）只有命令注册与 UI 目录，没有「plain text 命令在到达 agent 前拦截」的公开钩子，下沉属发明宿主能力，红线禁止。
