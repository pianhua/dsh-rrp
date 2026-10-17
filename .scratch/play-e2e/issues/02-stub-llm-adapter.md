# 票据 02：模型桩（只覆写 `stream()` 的 LlmAdapter）

> Status: ready-for-agent · 依赖：票据 01 · 规格真源：[`spec.md`](../spec.md) §2 §3

## 目标

注册一个 provider 名为 `dsh-rrp-e2e` 的假模型，让宿主与插件**全部真实运行**，只有模型输出是剧本化的。

## seam（已核实）

- 注册：`ctx.llm.registerAdapter(providers: string[], adapter: LlmAdapter): AdapterRegistrationHandle` —— `dsh-llm/lib/types/index.d.ts:253`。
- `LlmAdapter` **只有一个抽象成员** `stream(options): AsyncIterable<StreamChunk>`（`:130-188`）；`resolveModel` 可覆写、`providerInfo` 有默认实现（`lib/index.js:1676-1681`），桩可不覆写。
- 校验：名字非空、`DUPLICATE_ADAPTER`、`providerInfo.id` 必须等于路由名（`lib/index.js:1858-1866`）。
- 桩天然绕开 `MISSING_CREDENTIAL`（该错误在 `dsh-llm-pi-ai/lib/index.js:2565` 逐适配器抛出）。

## 范围

- 新增 `tests/e2e/support/stub-model.ts`：一个 Cordis 插件，`inject` 依赖 `llm`，`start()` 里 `registerAdapter(['dsh-rrp-e2e'], stub)`，**返回 disposer**（可逆注册铁律）。
- 流事件必须严格守契约（`dsh-llm/lib/types.d.ts:410-447`）：`block-start` → `text-delta`… → `block-end` → `usage` → `finish`，**usage 在 finish 前、finish 后不得再有任何事件**。
- **重试陷阱是硬约束**：默认策略 maxRetries 5、`EMPTY_RESPONSE` 属可重试码（`lib/index.js:247-252,316-322`）。桩必须一次发满并以 `finish{kind:'stop'}` 收尾，否则测试被重试拖成长尾。加一条断言：单次调用内 `stream()` 被进入的次数为 1。
- 不得试图改写请求：LOOP 请求 deep-frozen（`types/index.d.ts:37-42`），config 不匹配会 `INVALID_PREPARED_CALL`（`:108-115`）。
- 输出内容先返回**固定占位文本**即可；剧本化在票据 03 接。

## 验收

- 单元层：直接调 `stub.stream()`，断言事件序列合法（顺序、收尾、无后置事件）；
- 集成层：隔离宿主里发一条消息，Agent 真的产出一段正文并落盘；`collectText()`（`src/host-faces.ts:303-319`）不抛错；
- 证明无重试：日志/计数器显示 `stream()` 进入 1 次；
- 全量质量门通过。

## out-of-scope

不做标记词剧本（03）、不做 RP 业务断言（04）。
