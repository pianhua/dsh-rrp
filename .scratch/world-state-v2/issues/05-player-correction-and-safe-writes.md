Status: resolved

# 玩家矫正、对象引用安全与共享写入

## Scope

重做玩家/副驾写路径：整份共享草稿按差异提交，变化时追加完整快照和 provenance；支持对象、关系、目标、矛盾、认知、事件、卡包字段编辑；归档、删除引用保护和外部引用降级；保留 D6 无锁最后写入。

## Acceptance

- 有变化才写入；无变化返回 unchanged；保存前差异可被客户端预览。
- 归档可恢复；有引用时删除默认阻止；确认删除后关联降级为外部引用，不级联删除。
- 关系独立编辑，不自动修改角色字段/认知；玩家认知矫正不改变客观事实。
- 月停只能按玩家明确指令暂存建议，确认后归因 copilot；玩家可选填写说明。
- 过长文本和超预算不静默截断；保存返回可展示诊断。

## Blocked by

01-domain-model-and-projection
03-persistent-worldstate-timeline

## Implementation

- `src/world-state-references.ts` now provides pure v2 patching, hidden-content protection, diff/diagnostics, archive/restore, reference-safe delete confirmation and external-reference downgrade without cascade.
- `/dsh-rrp/world-state` supports preview-only diff responses, no-op short-circuiting, complete v2 snapshots, player provenance and one atomic timeline batch per changed save.
- Copilot WorldState actions are staged in memory and only write after explicit proposal confirmation; confirmed writes and append-only undo restores use actor `copilot` timeline batches.
- Route DTOs expose correction preview/diagnostic fields and pending WorldState proposals. Prompt vocabulary now describes v2 fields and confirmation semantics.

## Verification

- Review fixes: hidden object/field/global-field/objective/conflict/cognition/relation/current-event deletion now rejects as `hidden-content`; player batches always carry `origin: 'local'`, including after inherited fork history.
- Passed: Phase 5 tests (`tests/world-state-references.spec.ts`, `tests/player-correction-v2.spec.ts`, `tests/copilot-v2-safe-writes.spec.ts`), migrated `tests/correction.spec.ts`/`tests/copilot.spec.ts`, timeline projection tests and route-contract tests: 50 tests.
- Passed: changed-file ESLint, repository `pnpm run lint`, repository `pnpm run format:check`, and `git diff --check`.
- Expected migration blockers remain outside this slice: `pnpm run typecheck` is red in client/lore-condition/legacy v1 consumers; full `pnpm test -- --run` now reports 47 files / 381 passing tests and 8 failures in `tests/activity.spec.ts`, `tests/world-state-draft.spec.ts`, and `tests/prune.spec.ts` (v1 consumers). No out-of-scope files were changed to mask them.

