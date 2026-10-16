Status: resolved

# 持久 WorldState Timeline 与 provenance

## Scope

在新会话模型中持久记录初始基线和实际 WorldState 变更批次。保存修改者、故事回合、现实时间、可选面向玩家说明、字段旧值/新值、对象/字段、变更类型及父线继承来源。保留现有 activity ledger 作为运行日志，不合并两者。

## Acceptance

- 玩家保存、Chronicler 推演、月停获准动作各能形成原子批次；无变化/失败/取消不形成 WorldState 变化事件。
- 未知 actor/turn/time 诚实显示未知；不伪造事件序号为回合。
- 可按回合、actor、对象/字段、变更类型筛选；对象详情能打开字段时间线。
- fork 只继承实际前缀事件，父线历史与子线本地事件可区分；无旧会话迁移。

## Blocked by

01-domain-model-and-projection

## Agent implementation record

- Added/retained the dependency-free `WorldStateTimeline` vocabulary and host-only `rrpWorldStateTimeline` projection. A batch is folded only when the same known `user/message.source.rrp` carries both a valid complete v2 `worldState` snapshot and a valid atomic `worldStateTimelineBatch`; malformed, timeline-only, empty, or invalid snapshot writes are ignored without mutating the projection. Missing provenance remains explicit (`actor: 'unknown'`) and omitted turn/time/evidence are not inferred from event sequence.
- Extended the existing append-only publisher to carry the complete snapshot and its atomic batch in one source payload, deduplicate by stable batch fingerprint, adopt the latest timeline projection after restart, suppress baseline duplication, and suppress change batches when the posted snapshot is a no-op. Failed appends therefore carry no timeline entry; runtime activity remains separate.
- Updated `/dsh-rrp/start` so a validated new-session initial snapshot writes one local `initial-state` baseline with a wall-clock timestamp. No baseline is written when no initial snapshot is supplied, and failed/invalid starts do not reach the publisher successfully.
- Registered the host-only timeline projection and exported the timeline contract through `src/contracts.ts`. Timeline data remains outside transcript rendering; fork behavior is physical event-prefix replay only.

## Verification

- Passed: `pnpm exec vitest run tests/state-publisher.spec.ts tests/fork-replay.spec.ts tests/start.spec.ts tests/transcript.spec.ts tests/world-state-timeline.spec.ts --reporter=dot` (5 files, 31 tests).
- Passed: targeted ESLint over all item source/test files.
- Passed: targeted Prettier check over all item source/test files.
- Passed: `git diff --check`.
- Blocked: `pnpm run typecheck` remains non-zero because Phase 1 v2 model changes leave later v1 consumers/tests outside this item unresolved (Chronicler prompt/runner, Correction, Copilot, lore-condition, UI/draft/stage, old card/start/route tests, legacy world-state tests, and worldline-digest tests). No remaining type error was reported from `src/world-state-timeline.ts`, `src/projection/world-state-timeline.ts`, `src/state-payload.ts`, `src/state-publisher.ts`, `src/start.ts`, `src/contracts.ts`, `src/index.ts`, `src/route-contract.ts`, or the item timeline tests.

## Remaining risk / deferred work

- Actual `player`/`chronicler`/`copilot` provenance construction at Correction, Chronicler, and Copilot write sites is intentionally deferred to their later tickets; this slice provides the atomic wire/publisher/projection seam and baseline only.
- Timeline filtering/detail presentation and inherited-vs-local labeling need the later WorldState UI/route slice; this host-only projection does not add a parallel history store or rollback path.
- No old-session migration or v1 fallback was added.
