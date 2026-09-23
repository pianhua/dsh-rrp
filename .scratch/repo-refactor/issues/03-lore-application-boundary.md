Status: resolved

# 解耦 Lore 共用能力与 HTTP 路由

## Scope

将 `src/lore-route.ts` 和 Copilot 共用的 Scribe 调度/草稿能力放到窄应用层；HTTP 路由与 `/lore` 命令仍调用同一能力层，Copilot 不再依赖路由实现。保留现有宿主 jobs、投影和 provider 架构。

## Acceptance

- Copilot 可调用草稿/Scribe 能力但不从 `lore-route.ts` 导入实现。
- `tests/lore-route.spec.ts`、`tests/copilot.spec.ts`、`tests/lore-runtime.spec.ts` 与相关清理测试通过。
- 保留 job cancel/cleanup、activity 归因、RP 会话校验、草稿暂存及仅玩家确认后发布的语义。
- 不新增任务队列，不改 D8 持久化契约或 HTTP/SSE 形状。

## Blocked by

00-exclude-nested-worktrees

## Resolution

- Changed `src/lore-route.ts`, `src/copilot.ts`, and `src/lore-application.ts`; added semantic coverage in `tests/lore-route.spec.ts` and `tests/copilot.spec.ts`.
- Copilot now uses the shared Lore application layer instead of importing the route. Scribe job scheduling, cancellation, attribution, draft staging, explicit confirmation, and cleanup interfaces remain unchanged.
- Verification passed:
  - `pnpm exec vitest run tests/lore-route.spec.ts tests/copilot.spec.ts tests/lore-runtime.spec.ts tests/cleanup.spec.ts` — 4 files, 49 tests.
  - `pnpm run typecheck`
  - `pnpm run lint`
  - `pnpm exec prettier --check src/lore-route.ts src/lore-application.ts src/copilot.ts tests/lore-route.spec.ts tests/copilot.spec.ts .scratch/repo-refactor/issues/03-lore-application-boundary.md`
