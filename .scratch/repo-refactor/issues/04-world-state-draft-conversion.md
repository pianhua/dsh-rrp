Status: resolved

# 隔离世界状态编辑草稿转换

## Scope

将 `src/client/world-state-tab.tsx` 中不依赖 React 的草稿类型与投影↔草稿转换提取为小型纯模块；组件仅调用转换接口，保存/渲染行为不变。

## Acceptance

- 新模块不依赖 React/DOM；对 `draftOf`、`stateOfDraft` 与 flag 解析等核心分支有直接测试。
- 保留空值处理、非法数值行为、动态字段 ID/min/max 约束、flag 类型解析及名称冲突的既有语义。
- 页面渲染与 correction 写路径测试通过。

## Blocked by

00-exclude-nested-worktrees

## Comments

- 2026-09-23：将草稿行类型、投影到草稿的 `draftOf`、草稿空态判断、flag 字面值解析及草稿到 `WorldState` 的 `stateOfDraft` 提取到 React/DOM 无关的 `src/client/world-state-draft.ts`；面板继续调用同一转换逻辑，未更改 correction 路由或持久化契约。新增 `tests/world-state-draft.spec.ts` 覆盖投影转换、空值与非法数值、动态字段 ID/min/max、flag 解析及名称重复覆盖。
- 验证通过：`pnpm exec vitest run tests/world-state-draft.spec.ts tests/world-state.spec.ts tests/client-render.spec.ts tests/correction.spec.ts`（4 文件、35 用例）；`pnpm exec tsc -p tsconfig.build.json --noEmit`；范围内 `pnpm exec eslint src/client/world-state-tab.tsx src/client/world-state-draft.ts tests/world-state-draft.spec.ts`；`pnpm exec prettier --check src/client/world-state-tab.tsx src/client/world-state-draft.ts tests/world-state-draft.spec.ts`；`git diff --check`。
- 并行实现期间的根级检查曾读到 `tests/lore-route.spec.ts` 的中间编辑状态；集成后 `pnpm run typecheck`、`pnpm run lint` 与全量质量检查均已通过。
