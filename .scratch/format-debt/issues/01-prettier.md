Status: resolved

# 清理既有 Prettier 格式债务

## Scope

对 `pnpm run format:check` 当前列出的 9 个 `src/client` / `tests` 文件运行 Prettier，只保留排版差异。

## Acceptance

- 格式检查通过；
- typecheck、lint、全量测试通过；
- 不产生行为变化或额外范围的代码修改。

## Blocked by

无。

## Comments

- 2026-09-21：维护者授权进入代码阶段；该票据作为进入下一项功能前的基线清理。
- 2026-09-21：对 9 个既有文件运行 Prettier；格式检查、类型检查、lint、全量测试和构建均通过。只产生排版差异。
- 2026-09-21：测试 seam 记为 N/A（不新增行为）；沿用全量 Vitest 回归。本票据只覆盖上述 9 个源码/测试文件，不覆盖同一工作区内的 Agent 文档、工作日志、计划状态或 Round-6 brief。
