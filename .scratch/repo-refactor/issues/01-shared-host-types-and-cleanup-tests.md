Status: resolved

# 收敛共享宿主结构类型并补清理测试

## Scope

让状态发布相关代码复用 `src/host-faces.ts` 中现有 session/projection 类型，必要时以类型别名保持调用兼容；扩展 `tests/cleanup.spec.ts`，明确覆盖尚未断言的清理项及真实 fiber disposer 的清理行为。不得重写清理机制或改变发布时序。

## Acceptance

- 不再重复声明等价 session/projection 结构类型。
- 清理测试在 session/agent dispose 与 all-session unload 路径验证相关模块缓存。
- `tests/state-publisher.spec.ts`、相关生命周期测试与 typecheck 通过。
- append-only、指纹去重、投影游标和清理语义无变化。

## Blocked by

00-exclude-nested-worktrees (resolved)

## Completion (2026-09-23)

- `src/state-publisher.ts` now backs the exported `StateSession` / `StateProjections` compatibility names with shared `SessionLike` / `ProjectionsService` types from `src/host-faces.ts`.
- `src/lore-runtime.ts` derives its Lore session view from `SessionLike` while keeping `append` optional; migration behavior is unchanged.
- Cleanup coverage now checks state-publisher dedup-cache reset, lore pending/drafting state, proposals, summary watermarks, Chronicler in-flight state, Copilot in-flight reset on `session/disposed`, both session/agent disposal, and the real Cordis fiber disposer’s all-session cleanup.
- Verification passed:
  - `pnpm exec vitest run tests/cleanup.spec.ts tests/host-mount.spec.ts tests/state-publisher.spec.ts tests/lore-runtime.spec.ts` — 4 files, 39 tests.
  - `pnpm run typecheck`
  - `pnpm exec eslint src/host-faces.ts src/state-publisher.ts src/lore-runtime.ts tests/cleanup.spec.ts tests/host-mount.spec.ts`
  - `pnpm exec prettier --check src/host-faces.ts src/state-publisher.ts src/lore-runtime.ts tests/cleanup.spec.ts tests/host-mount.spec.ts`
  - `git diff --check -- src/host-faces.ts src/state-publisher.ts src/lore-runtime.ts tests/cleanup.spec.ts tests/host-mount.spec.ts`

## Integration review follow-up (2026-09-23)

- Rechecking the real Cordis fiber-dispose path found the existing all-session test asserted state dedup, activity, lore draft, and proposal cleanup, but did not behaviorally observe the Summarizer watermark or the Chronicler/Copilot in-flight guards. The in-flight guards were only exercised through the per-session disposal path.
- This follow-up is limited to lifecycle tests and this ticket: trigger and retrigger behavior after the actual plugin fiber is disposed, without adding production test exports or changing cleanup behavior. Keep all filesystem-backed coverage under an isolated `DSH_HOME`.
- `tests/host-mount.spec.ts` now leaves Summarizer and Chronicler jobs in flight, verifies repeated triggers are suppressed before unload, disposes a real Cordis plugin fiber, then verifies the same turn/boundary schedules again. It also verifies an active Copilot request returns `409` before unload and a second request enters its stream after unload. The same test observes the state-publisher dedup cache, activity ledger, lore pending/drafting state, and staged proposals cleared after disposal; re-created test state is cleared in `finally`.
- Follow-up verification passed:
  - `pnpm exec vitest run tests/host-mount.spec.ts tests/cleanup.spec.ts` — 2 files, 9 tests.
  - `pnpm run typecheck`
  - `pnpm exec eslint tests/host-mount.spec.ts tests/cleanup.spec.ts`
  - `pnpm exec prettier --check tests/host-mount.spec.ts .scratch/repo-refactor/issues/01-shared-host-types-and-cleanup-tests.md`
  - `git diff --check -- tests/host-mount.spec.ts tests/cleanup.spec.ts .scratch/repo-refactor/issues/01-shared-host-types-and-cleanup-tests.md`
