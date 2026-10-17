Status: resolved

# 发布写通道与 UI 契约：publish/ + ui-contract/，删除空 skills/

## Scope

- `git mv` 追加式发布写通道到 `src/publish/`：state-publisher.ts、state-payload.ts、correction.ts、activity.ts、macro-summary.ts、steward-proposals.ts。
- `git mv` 前后端 UI 契约到 `src/ui-contract/`：ui-schema.ts、ui-bridge.ts、card-ui.ts。
- 删除空目录 `src/skills/`（git 不跟踪空目录，确认无 .gitkeep 后 rmdir）。
- 根目录最终只保留：index.ts、contracts.ts、route-contract.ts、json-extract.ts。

## Acceptance

- 9 个文件位于对应目录；src 根文件数 = 4 + 13 个目录。
- `typecheck && lint && pnpm test` 全绿；543 用例数不变。
- `git mv` 后 `git status` 无意外未跟踪文件；`src/skills/` 不存在。

## Blocked by

03 (runtime/ + host/)

## Completion (2026-10-17)

- publish/（6）与 ui-contract/（3）归位；src/skills/（仅 .gitkeep）移除。根目录定型 4 文件 + 12 目录。543 全绿，提交 `4bc25c0`。
