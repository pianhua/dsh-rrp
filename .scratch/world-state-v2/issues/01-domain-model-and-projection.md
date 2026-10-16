Status: resolved

# 建立 WorldState v2 领域模型与投影词汇

## Scope

替换旧的扁平四/五域状态词汇，建立追踪对象、外部引用、角色通用字段、卡包字段、近期目标、活跃矛盾、角色认知、双向关系、当前事件、可见性和原子时间线批次的依赖为零领域模型。更新 WorldState 投影/校验/折叠所需的纯函数，但不接入 UI。

## Acceptance

- 领域类型与 glossary/D23 一致；旧 `affinity` 不再被当成所有角色的必填通用语义。
- 无硬数量上限、无静默剪裁；文本与上下文预算只产生可展示诊断。
- 目标/矛盾/认知/关系/事件生命周期和归档/删除引用规则有纯函数测试。
- 新会话模型可通过 projection 折叠完整快照和时间线批次；旧会话迁移明确不支持。

## Out of scope

- 不改客户端页面、不接入卡包 schema 文件、不改 Chronicler prompt。

## Blocked by

无；这是其他实现票据的领域前置。

## Agent implementation record

### Actual changes

- Replaced `src/world-state.ts` with dependency-free v2 vocabulary: tracked objects (`character`/`group`/`item`/`scene`), optional character common fields, card-defined/undeclared scalar fields, object external references, objectives, conflicts, cognition, directional relationships, current events, visibility, archive/restore/delete safety, structured field changes, numeric constraint normalization, and non-mutating text/serialized-budget diagnostics. No quantity caps, flat dynamic fallback, relation backfill, or silent pruning remain.
- Added `src/world-state-timeline.ts` and `src/projection/world-state-timeline.ts`. Timeline entries are `baseline` or `changes`; provenance carries actor/story turn/wall-clock/evidence when known, and origin is `inherited`/`local`. The host-only projection folds a batch only when the same `user/message.source.rrp` also carries a valid complete v2 snapshot, and uses explicit `safeParse` validation.
- Added `source.rrp.worldStateTimelineBatch` to `src/state-payload.ts`; `src/state-publisher.ts` carries the optional atomic batch beside the complete snapshot through the existing append-only `user/message` facts lane.
- `rrpWorldState` projection now has `stateVersion: 2`, validates complete v2 snapshots with `safeParse`, rejects invalid/v1-shaped payloads without changing the existing state, and performs no migration. `rrpWorldStateTimeline` is registered as a host-only projection (no `wire` view) with `stateVersion: 1`; `src/contracts.ts` exports the v2 contract vocabulary and timeline key/types.
- Rewrote the direct Phase 1 tests in `tests/world-state.spec.ts`, `tests/dynamic-fields.spec.ts`, `tests/fork-replay.spec.ts`, and `tests/state-publisher.spec.ts`; updated the timeline-isolation fixture in `tests/transcript.spec.ts` and stable-key coverage in `tests/contracts.spec.ts`. Added assertions for all v2 collections/visibility/reference forms, archive/restore diff types, atomic timeline pairing, timeline deduplication, fork-prefix replay, transcript isolation, and no silent deletion.

### Wire/projection contract

- Snapshot: `source.rrp.worldState` is the complete v2 `WorldState` (`version: 2`).
- Timeline: `source.rrp.worldStateTimelineBatch` is one optional atomic `baseline`/`changes` entry paired with the complete snapshot write; duplicate batches are suppressed by the append-only publisher.
- Projection keys: `rrpWorldState` (`stateVersion: 2`) and host-only `rrpWorldStateTimeline` (`stateVersion: 1`, no client wire view).
- Timeline history is not rendered into transcript prose; fork replay is physical event-prefix replay.

### Verification

- Passed: `pnpm exec vitest run tests/world-state.spec.ts tests/dynamic-fields.spec.ts tests/fork-replay.spec.ts tests/state-publisher.spec.ts tests/transcript.spec.ts tests/contracts.spec.ts --reporter=dot` (6 files, 35 tests).
- Passed: targeted ESLint over all touched source/test files.
- Passed: targeted Prettier check after formatting the touched source/test files.
- `pnpm run typecheck` remains non-zero with 145 output lines, all in out-of-scope v1 consumers/tests (Chronicler, Correction/Copilot, lore-condition, client/UI schema, old card/start/route tests, and legacy WorldState tests); no error originates in the Phase 1 domain/projection/payload/timeline modules or direct Phase 1 tests. The full error list was inspected during handoff.
- Passed: `pnpm test -- --reporter=dot` was run for the repository gate; 33 files passed and 13 files failed (17 failures), all in the same out-of-scope v1 consumers/fixtures and legacy tests. These failures were not changed to restore v1 fallback.
- Passed: `git diff --check`.

### Post-review correction record

- Updated `CharacterCommonFields.present?: boolean` to explicit tri-state `presence?: 'present' | 'absent' | 'unknown'`; removed the boolean field from the v2 runtime schema and added direct rejection coverage for the old shape.
- Expanded `CurrentWorldEventStatus` to `pending | active | blocked | completed | invalid | abandoned`; updated the projection schema and diff close classification so `completed`, `invalid`, and `abandoned` are closed statuses while `pending`, `active`, and `blocked` remain open.
- Synchronized `tests/world-state.spec.ts` and `tests/fork-replay.spec.ts`; no downstream consumers were migrated and no v1 fallback was restored.
