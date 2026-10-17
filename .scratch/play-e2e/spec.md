# 可重复玩局 E2E 规格（play-e2e）

> Status: ready-for-agent · 无待决项（浏览器层已裁决不做，见 §6）
> 借鉴来源：dsh-tavern `tests/e2e/model.mjs` + `gameplay.mjs`（只读参照，不改其仓库）
> 对应移植清单：`docs/reference/TAVERN_DETAIL_COMPARISON.md` P0 #4

## 1. 一句话目标

**不开浏览器、不配 API key、不靠人手工点**，就能把「开卡 → 发一条玩家消息 → Author 出正文 → Chronicler 结算 → 世界状态与时间线更新 → 刷新不丢」整条链路跑一遍并断言结果；且这套测试**必须能证明它会失败**。

替代的是当前的真机人工验收：`tests/e2e/e2e-simulation.spec.ts` 完全不碰宿主（`tests/e2e/e2e-simulation.spec.ts:23-67` 折叠合成事件），`tests/integration/host-mount.spec.ts` 虽真挂载插件但用的是假 `llm.stream`、没有 Session、没有 agent loop、没有端口（`:52-53`、`:128-131`）。真实游玩至今只能靠人。

## 2. 为什么可行（已核实的宿主 seam）

| 事实 | 证据 |
| :--- | :--- |
| 注册假模型只需 `ctx.llm.registerAdapter(providers, adapter)` | `dsh-llm/lib/types/index.d.ts:253` |
| `LlmAdapter` **只有一个抽象成员** `stream()`；`resolveModel` 可覆写、`providerInfo` 有默认实现 | `dsh-llm/lib/types/index.d.ts:130-188`、`lib/index.js:1676-1681` |
| 桩能绕开 `MISSING_CREDENTIAL`（该错误在 dsh-llm-pi-ai 适配器内部抛，属逐适配器行为） | `dsh-llm-pi-ai/lib/index.js:2565`，已核实 |
| 模型选择走 `agent-default-model` 配置 `{provider, model, reasoningEffort}` | `dsh-agent-default-model/lib/types/index.d.ts:13-19` |
| 隔离 profile 可行：软链 `node_modules/@deepseek-ai` + 临时 `package.json` + `cordis.patch.yml`，用 `DSH_HOME`/`DSH_CWD` 与 `--port 0` 起 | 参照 `dsh-tavern/tests/e2e/gameplay.mjs:132-153,178-180` |
| 流事件契约：`block-start` / `text-delta` / `block-end` / `usage` / `finish`，且 **usage 必须在 finish 前、finish 后不得再有事件** | `dsh-llm/lib/types.d.ts:410-447` |
| 我方 `collectText()` 只拼 `text-delta`，遇 `finish.kind` 为 `error`/`aborted` 抛错并读 `reason.failure.code/message` | `src/host-faces.ts:303-319`、`:197-202` |

## 3. 三条硬约束（设计必须满足，否则真机爆炸）

1. **重试陷阱**：宿主默认重试策略 `mode:'normal'`、maxRetries 5、触发码含 `EMPTY_RESPONSE`（`dsh-llm/lib/index.js:247-252,316-322`）。桩若静默或只发空 delta，会被**重试 5 次**把测试拖成长尾。桩必须一次发满 `usage` + `finish{kind:'stop'}`。
2. **配置一致性**：`PreparedLlmCall.stream()` 在 call config 不匹配时抛 `INVALID_PREPARED_CALL`（`dsh-llm/lib/types/index.d.ts:108-115`）；LOOP 构造的请求是 deep-frozen，只读不可改（`:37-42`）。桩不得试图改写请求。
3. **V4 受保护头不变式**：开局首个 surface 事件必须是 `system/message`（`src/start.ts:70-90`），开场白在 turn2（`:98-120`）。E2E 走真实开局路径即自然满足；**禁止**为了省事直接 `session.append` 造开局。

## 4. 目标 / 非目标

**目标**
- 隔离宿主现场：一次性 profile 目录 + `DSH_HOME` 隔离 + 端口 0，跑完即焚，绝不碰开发用的 `rp-dev`/3099；
- 桩模型 `dsh-rrp-e2e` provider：只覆写 `stream()`，工具、存储、HTTP、Session、agent loop 全真；
- **标记词驱动**：桩按「最新一条用户消息里出现的标记」选剧本化输出（复用 `collectText` 读到的文本），零 fixture 文件；同一轮重复调用按已存在的 `tool-result` id 去重；
- 一条完整玩局断言链：开局 → 发消息 → 正文落盘 → Chronicler 结算 → WorldState/时间线变化，**且断言独立读盘**（不只看 UI 投影）；
- 一条**负向对照**：环境变量把桩切到"故意给错的输出"，断言必须非零退出——证明这套测试真的会失败；
- 刷新不丢：重启宿主后同一 Session 的世界状态与时间线仍折叠得出。

**非目标（明确不做）**
- 不做多 OS/多 Node CI 矩阵、不做付费真模型 harness（ADR 0015 个人玩具定位）；
- 不改任何生产代码路径来"方便测试"（桩只能挂在宿主既有 seam 上）；
- 不替代真机抽查：视觉与手感仍归人工 brief，E2E 只接管**可断言的事实链**；
- 不引入 HTTP 层 mock（`nock`/`msw` 一类）——桩打在 adapter 边界，比 HTTP 层更真。

## 5. 验收条件

- `pnpm run test:e2e` 在**无 `DEEPSEEK_API_KEY`** 的干净环境下通过；
- 同一命令连跑 3 次结果逐字节一致（无 flaky、无端口/目录残留）；
- 负向对照：`DSH_RRP_E2E_WRONG_GOLD=1 pnpm run test:e2e` **必须非零退出**，且失败信息指名是哪条断言；
- 故意破坏 `src/state-publisher.ts` 的元数据短路（B1 那个修复）后，E2E 能失败——证明它真的覆盖了这条链；
- 全量质量门（`check:hygiene` / `format:check` / `typecheck` / `lint` / `test` / `build`）全绿；
- 测试落在 `tests/e2e/`，符合 `tests/README.md:8-10` 的分层定义与 hygiene 的分层校验。

## 6. 浏览器层：**已裁决不做**（2026-10-17）

前四张票据（隔离现场、桩、标记词、事实链断言）**全程无头**，不需要浏览器。「刷新不丢」由
票据 04 在**数据面**守住：关闭隔离宿主 → 用同一 `DSH_HOME` 再起 → 同一 Session 的世界状态、
时间线、转录游标全部折叠得出。

裁决：**不引入 Playwright**。为一条只有本地会跑、永远不进 CI 的作业引入浏览器内核，
属 ADR 0015 拒绝的过度工程；UI 观感与手感仍归人工 brief。重开条件与将来配方见
[`issues/05-browser-surface.md`](issues/05-browser-surface.md)。

## 7. 术语（先在 `CONTEXT.md` 落词条，再进实现）

新增三条进 `CONTEXT.md` 第六节「验证与真机」：**Model Stub（模型桩）**、**Reproducible Play-through（可重复玩局）**、**Negative Control（负向对照）**。定义与边界见 `CONTEXT.md` 本体，本规格不复制。
