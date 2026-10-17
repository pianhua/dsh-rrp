Status: resolved

# 领域目录：world-state / worldline / lore / cards

## Scope

按领域把根目录文件 `git mv` 入域目录（纯移动 + import 改写）：

- `src/world-state/`：world-state.ts, world-state-references.ts, world-state-visibility.ts, world-state-timeline.ts
- `src/worldline/`：worldline-tree.ts, worldline-store.ts, worldline-digest.ts, worldline-fork-marker.ts
- `src/lore/`：lore.ts, lore-state.ts, lore-runtime.ts, lore-condition.ts, lore-application.ts, lore-drafts.ts, lore-provider.ts
- `src/cards/`：cards.ts, card-types.ts, card-import.ts, card-import-parse.ts, card-state-schema.ts

不改任何导出形状、函数体或数据语义；`projection/` 内同名折叠器原地不动（它们是纯函数层，与运行时同名文件并存是既有设计）。

## Acceptance

- 上述 20 个文件全部位于对应域目录；src 根仅剩规格列出的保留文件。
- `typecheck && lint && pnpm test` 全绿；543 用例数不变。
- 域内相对 import 用 `./`、跨域用 `../<dir>/`；无循环依赖新增（typecheck 通过即证）。

## Blocked by

01 (routes/)

## Completion (2026-10-17)

- 20 文件 git mv 入四域目录；93 个消费方 import 由解析式改写器更新；被移文件跨域内部 import 用「旧位置解析」脚本二次修正（初版脚本只解析磁盘位置，漏改 moved-file internals——教训：改写器必须对 moved 文件按旧目录解析）。
- cards.ts 随包卡目录 import.meta.url 加深一级。typecheck/lint/543 全绿，提交 `2d28a29`。

## Integration review follow-up (2026-10-17)

- 同 01 号 follow-up：cards.ts 的随包卡目录 `../cards/`  deepening 在 bundle 形态下错一级，已改接 `repoDirOf(import.meta.url, 'cards')`。
