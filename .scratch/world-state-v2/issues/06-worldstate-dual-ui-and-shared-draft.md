Status: ready-for-human

# WorldState 会话工作区与右侧栏双入口

## Scope

将 WorldState 注册为 `conversation.view` 会话页签；重做主区域工作区和右侧栏完整编辑面。两处共享同一 Session 草稿，支持当前局势概览、对象详情、关系/目标/矛盾/事件、卡包字段、未定义字段、可见性提示、预算、时间线筛选和保存预览。

## Acceptance

- 主区首屏展示场景、在场角色、近期目标、活跃矛盾；其余板块可折叠、搜索、筛选。
- 右侧栏数据能力不缩水，使用适合窄空间的精简折叠控件；时间线只读。
- 同 Session 导航共享草稿；切换 Session 弹出保存/放弃/留在当前会话；刷新不恢复未保存草稿。
- 推演期间可查看但不能编辑；新投影合并未编辑字段并保留玩家编辑字段，显示更新提示。
- 对象详情、字段历史、归档/删除确认、隐藏内容提示和超预算警告均有 UI 测试。

## Blocked by

01-domain-model-and-projection
02-card-schema-and-official-cards
03-persistent-worldstate-timeline
05-player-correction-and-safe-writes

## Phase 6 agent handoff (2026-09-25)

Status remains `claimed`: the v2 dual UI and shared draft slice is implemented and focused tests pass, but the repository still has known pre-existing v1 consumers and the host exposes no navigation-interception seam for a true pre-switch Save/Discard/Stay prompt.

### Implemented

- WorldState now registers as `conversation.view` (`dsh-rrp/world-state`, order 40) alongside the existing Worldline and Stage views; the native `sidebar.right.pane.tab` registration remains under the existing `dsh-rrp-worldstate` tab kind.
- Main and sidebar surfaces mount the same session-keyed in-memory store from `src/client/world-state-draft-store.ts`; drafts are not restored across refresh/restart. Dirty paths merge clean projection fields while preserving dirty paths, and inference disables edits.
- v2 UI consumes `trackedObjects`, `globalFields`, objectives, conflicts, cognition, relations, current events, visibility notices, budget report, and a read-only timeline. The player marker, card-defined/undeclared fields, archive/delete confirmation, and compact sidebar mode are included. No v1 `characters`/`inventory`/`scene`/`flags` access remains in the WorldState client.
- Added `GET /dsh-rrp/world-state-timeline` as a minimal player-safe route because the existing timeline projection has no wire view. Hidden changes and evidence are replaced with the generic protected-information notice.
- Save uses correction preview/save; the UI renders grouped change summaries before confirmation and does not write persistence client-side. The unavailable navigation interception seam is represented by observable Save/Discard/Stay controls rather than an invented global navigation hook.
- Added v2 draft/store, timeline-route, registration, render, hidden-markup, and visibility coverage.

### Verification

- Passing focused command: `pnpm exec vitest run --reporter=dot tests/world-state-draft.spec.ts tests/client-render.spec.ts tests/client.spec.ts tests/world-state-timeline-route.spec.ts tests/route-contract.spec.ts tests/world-state-visibility.spec.ts` — 6 files, 34 tests passed.
- Passing targeted ESLint for changed Phase 6 files.
- Passing `git diff --check`.
- Full `pnpm test`: 53 files / 397 tests passed, 2 files / 5 tests failed in legacy v1 `tests/activity.spec.ts` and `tests/prune.spec.ts` because those tests still expect flat `characters`/`inventory`/`scene`/`flags` and removed pruning/digest limits.
- `pnpm run typecheck` remains blocked by known v1 consumers in `src/client/stage-tab.tsx`, `src/lore-condition.ts`, `src/ui-schema.ts`, and legacy v1 tests; their exact compiler output is in `.scratch/world-state-v2/phase6-typecheck.log`.

### Remaining blockers

- DSH 0.1.6-alpha.2 does not expose a client navigation interception API. The implementation cannot guarantee a modal before the host switches Session; it provides visible controls and keeps the draft session-scoped instead of inventing navigation.
- The full repository must migrate remaining v1 consumers/tests before the typecheck and full suite can be green. This ticket does not modify Chronicler/Correction/Copilot business writers or unrelated v1 consumers.

## Phase 6 gap follow-up (2026-09-25)

- Correction 409 reference conflicts now surface `details.objectId` in the client, show an in-page confirmation, preserve the draft on cancel, and retry preview/save with `confirmDeleteIds` after confirmation. Correction coverage verifies the 409 details and confirmed downgrade path.
- Object detail now renders affinity only when the character already has an affinity value; it does not invent an affinity editor for characters without that field. Client rendering coverage includes the no-affinity case.
- Follow-up focused verification: 7 files, 42 tests passed; targeted ESLint, Prettier check, and `git diff --check` passed.

## Human review note

The implementation is ready for human/browser review, with one host boundary intentionally unresolved: DSH 0.1.6-alpha.2 exposes no navigation-interception seam, so Save/Discard/Stay is an observable in-page control rather than a guaranteed pre-navigation modal. No custom navigation hook was invented.

