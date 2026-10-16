Status: resolved

# 卡包 WorldState schema 与官方卡迁移

## Scope

新增卡包级 `state.schema.json` 契约，与 `state.json` 初始状态分离；支持对象适用范围、字段 ID/显示名/类型/默认值/范围/排序/组件/visibility/schema version/迁移别名。迁移 `maid-heiress` 与 `yanmen-inn` 作为首批样本。

## Acceptance

- 女仆大小姐可声明并使用好感等字段，但框架不把它变成所有卡包角色的必需字段。
- 两张官方卡可读取初始状态和 schema；卡包缺少某通用字段时不自动填默认值。
- 未声明运行时字段有明确未定义标记；schema 变化无迁移声明时保留旧字段并标记不匹配。
- schema 校验、迁移/别名、可见性和有限显示组件有单测。

## Blocked by

01-domain-model-and-projection

## Comments

- 2026-09-24: 实现独立 `state.schema.json` 解析与 Zod 校验，支持适用对象、标量类型/default、min/max、order、有限声明式 component、visibility、schema version、migration/alias；schema 只挂在 `CardPack.stateSchema`，不进入 `CardContext` 或会话 payload。
- 2026-09-24: `maid-heiress` 与 `yanmen-inn` 的 `state.json` 已迁移到 WorldState v2；`affinity` 仅在女仆卡 schema/初始状态中出现，未对所有卡包默认补齐；无 schema 的普通卡仍按原路径加载，schema default 不会写入初始状态。
- 2026-09-24: 验证通过：`tests/card-state-schema.spec.ts`、`tests/cards.spec.ts`（20/20），以及 `tests/start.spec.ts`、`tests/preset.spec.ts`、`tests/card-ui.spec.ts`（31/31）；目标文件定向 ESLint、Prettier check、`git diff --check` 通过。全局 `pnpm test` 当前为 37/48 文件通过、331/343 用例通过，失败来自 Phase 1 v2 类型切换后的旧 Chronicler/Correction/WorldState draft/activity/client-render 测试，未越界修复；`pnpm run typecheck` 同样被 Phase 1 后续旧消费者阻塞。
- 2026-09-24: 余留风险：现有 `lore-condition.ts` 仍按 v1 WorldState 路径求值，官方卡加载时会对 `when` 路径输出“角色不在初始状态”警告；本票据未越界修改该模块。
