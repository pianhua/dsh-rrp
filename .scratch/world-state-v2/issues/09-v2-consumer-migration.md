Status: resolved

# 迁移剩余 v1 WorldState 消费者与官方卡 UI 绑定

## Scope

将条件注入、Stage 声明式 UI、活动差异摘要、UI schema 和官方卡资源从 v1 flat WorldState 路径迁移到 v2 对象/字段路径；清理与新语义冲突的旧测试。不得恢复 v1 fallback。

## V2 path contract

- 角色通用字段：`trackedObjects.<objectId>.character.<field>`。
- 对象级字段：`trackedObjects.<objectId>.fields.<fieldId>.value`。
- 全局字段：`globalFields.<fieldId>.value`。
- 场景字段使用场景追踪对象的 `fields`，不恢复 `scene.*` 顶层路径。
- 官方卡的 `when:` 和 `ui/manifest.json` bind 必须迁移到 v2 路径；`affinity` 只在声明该字段的对象上有效。

## Acceptance

- `lore-condition.ts` 解析/求值/路径诊断支持 v2 路径；条件注入的 number/boolean 语义、预算和去重不变。
- `ui-schema.ts`、`stage-tab.tsx` 和 Stage 条件/bind 读取 v2 状态；不再访问 `characters/inventory/scene/flags`。
- 官方卡 Skills/UI 绑定迁移后，女仆好感阈值和雁门卡 UI 不再产生旧路径警告；条件注入测试覆盖 v2 路径。
- 活动账本使用结构化 `WorldStateDiff` 的可读摘要；不把 activity 变成持久 timeline。
- 旧 pruning/flat worldline fixtures 改为 v2 语义；不恢复数量硬上限或 flat fallback。
- `pnpm run typecheck`、全量 tests、lint、format 和 build 至少清除本票据覆盖范围内的错误。

## Out of scope

- 不实现 WorldState 双入口 UI（票据 06 已覆盖）。
- 不实现 hidden/player/model 过滤新策略（票据 07 已覆盖）；只保证 Stage/lore 消费 player-safe/v2 state。
- 不改变宿主 Stage/Worldline seam 或聊天正文行为。

## Blocked by

01-domain-model-and-projection (resolved)
02-card-schema-and-official-cards (resolved)
04-chronicler-and-author-contract (resolved)
06-worldstate-dual-ui-and-shared-draft (claimed; current Stage/Worldline adapters can be migrated independently)

## Resolution

- Migrated conditional injection parsing, resolution, diagnostics, official card `when` clauses, and UI bindings to the v2 tracked-object/object-field/global-field paths. Legacy flat paths are rejected rather than treated as fallbacks.
- Stage now consumes player-safe v2 state, resolves ObjectReference names safely, reads scene timelines from scene tracked-object fields, and keeps the closed component/two-action/sandbox seams.
- Activity summaries consume structured `WorldStateDiff` without becoming persistent timeline events. Pruning fixtures now verify v2 normalization and preservation rather than v1 count limits; WorldlineDigest reads v2 scene and character fields.
- Verified: `pnpm run typecheck`, `pnpm test --silent` (55 files / 406 tests), `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check` all pass.
- No ticket 06/07/08 blocker remains for this slice; hidden/model-only values are filtered before Stage and lore trigger UI consumption, and activity summaries contain paths/types only rather than state values.
