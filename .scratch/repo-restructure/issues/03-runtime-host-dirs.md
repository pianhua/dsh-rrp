Status: resolved

# 运行时应贯层与宿主接缝层：runtime/ + host/

## Scope

- `git mv` 智体运行时编排文件到 `src/runtime/`：chronicler.ts（Chronicler runner）、summarizer.ts、copilot.ts、copilot-store.ts、recall.ts、transcript.ts、transcript-reader.ts、prompt-budget.ts。
- `git mv` 宿主接缝文件到 `src/host/`：host-faces.ts、preset.ts、preset-id.ts、start.ts、settings.ts、save-naming.ts、home.ts。

runner 文件在域内保持原文件名（`runtime/chronicler.ts` 与 `agents/chronicler.ts` 契约并存，与现状同构）；不改任何逻辑。

## Acceptance

- 15 个文件位于对应目录；`agents/` 仍只有 6 个纯契约文件。
- `typecheck && lint && pnpm test` 全绿；543 用例数不变。
- `runtime/` 内文件不反向 import `routes/`（路由是宿主接缝的消费方，方向保持 routes→runtime）。

## Blocked by

02 (domain dirs)

## Completion (2026-10-17)

- 15 文件归位 runtime/（8）与 host/（7）；51 个消费方改写；preset.ts presets/rp 资产 URL 加深。
- fetchSessionRounds + PersistenceService 从 recall-route 迁入 runtime/recall.ts，copilot 改从 './recall.ts' 引入——routes→runtime 单向化达成。543 全绿，提交 `b18a202`。

## Integration review follow-up (2026-10-17)

- 同 01 号 follow-up：preset.ts 的 presets/rp 源目录 deepening 在 bundle 形态下错一级（e2e 表现为 ENOENT D:\projects\presets\rp\agent.cordis.yml），已改接 `repoDirOf(import.meta.url, 'presets/rp')`。
