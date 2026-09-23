# [P2] 将 cleanup 生命周期测试隔离到临时 DSH_HOME

Status: resolved
Blocked by: None

## 用户可验证结果

执行生命周期测试（`tests/cleanup.spec.ts`）时，不会读取、创建、刷新或删除开发者本机真实的 `$HOME/.dsh` 目录与 presets。

## 范围

- 在 `tests/cleanup.spec.ts` 中通过 `withIsolatedDshHome` 辅助函数将 `process.env.DSH_HOME` 指向独立的临时目录。
- 在 `try/finally` 块中始终还原环境变量并彻底清理临时目录。
- 覆盖 `session/disposed` 和 `agent/disposed` 两个涉及 `rrp.apply(ctx)` 的生命周期测试。
- 新增用例显式断言：在包含用户预先修改过的 preset 的测试 home 中执行 `apply()` 时，保持用户修改不变，不发生强行覆盖。

## Out of scope

- 不改变 `src/preset.ts` 的业务物化与保护机制。
- 不影响生产环境下 DSH 默认目录寻址。

## 验收

- cleanup 生命周期测试不会读取、创建、刷新或删除真实 `$HOME/.dsh` 内容。
- 即使测试失败也恢复原始 `DSH_HOME` 并清理临时目录。
- 所有测试中的插件 apply/preset materializer 调用均使用隔离 home。
- 在包含预先修改 preset 的测试 home 中运行时，不改变该 preset 或 marker。

## Comments

- 2026-09-23：依据 GitHub #43 开展修复。封装 `withIsolatedDshHome` 确保临时环境绝对隔离与清理；新增针对用户已修改 preset 的保护断言。
