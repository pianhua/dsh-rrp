# WorldState v2：近期世界状态、双入口工作区与持久时间线

Status: ready-for-agent

## Goal

对 `dsh-rrp` 的 WorldState 板块做一次完整的领域、状态流、卡包契约、会话投影和玩家界面重构。交付结果不是单纯把现有右侧栏搬到新位置，而是让玩家能在 DSH 会话视图页签的主区域和右侧栏中，以同一份会话草稿查看、编辑、确认当前世界状态，并通过持久只读时间线理解状态如何变化。

WorldState 的核心语义是：**世界近期、当前且可行动的状态**。它维护具体事实、角色认知、近期目标、活跃矛盾和仍有用的当前事件；剧情脉络只提供更高维、更长线的剧情视角，硬设定以卡包/Skills 为准。

## Confirmed domain model

### Scope and authority

- 保留 D6：玩家矫正是自然时序、无锁、最后写入生效。
- 修订 D22：WorldState 管近期事实/目标/矛盾；Summarizer 管宏观目标、跨阶段矛盾、重大转折和长期伏笔；卡包/Skills 管硬设定和世界规则。
- Author 消费三者但按领域分工，不建立一个全局优先级。
- 新设计不负责旧会话的 WorldState 时间线或 schema 兼容迁移；新建会话直接使用 v2 模型。

### Objects and sections

- Tracked Object：角色、群体/势力、物品、场景/地点。只有成为追踪对象后才拥有独立详情字段。
- Object External Reference：目标、矛盾、事件对尚未追踪对象的名称引用；之后可升级为追踪对象，不复制历史。
- Character common fields：名字（身份键）、在场、穿搭、当前情感状态、好感、外貌；名字之外均可缺省，不自动填默认值。好感为可选 number，不默认 0–100。
- Card-defined State Field：卡包可定义适用对象、ID、显示名、类型、默认值、范围、排序、显示组件、可见性和迁移/别名。底层类型首版只允许 number/string/boolean；所有卡包字段默认可编辑，卡包不能限制玩家矫正。
- Runtime undeclared fields：允许创建，但标记为未定义，使用框架通用显示/编辑；Chronicler 提示词抑制无必要新建。
- No hard quantity caps in v2 for characters, items, flags, relations or dynamic fields; no silent deletion. Show state size/budget estimates and let the player simplify. Existing v1 caps remain until implementation changes them.
- Current Objective：负责人（可多人）、预期结果、进度/状态、下一步；支持多个目标、主目标和排序；状态：待行动/进行中/受阻/已完成/已放弃。
- Active Conflict：相关方、利害关系、压力短文本、状态；状态：进行中/受控/已解决/已放弃；暂未提及不自动关闭。
- Character Cognition Entry：角色 + 简短命题作为 identity；可同时有多个状态标记（听闻传言、怀疑等），但明确知道与明确误解不能共存；新证据更新原条目；不改写客观事实。
- Relationship Entry：一对角色、共同标签、A→B 态度、B→A 态度，可选有明确含义的数值；关系编辑不自动同步角色字段或认知。
- Current World Event Entry：类型、简短事实、相关角色、当前状态；基础类型包含承诺/秘密/发现/持续事项，卡包可扩展；不是完整叙事日志。
- Archive/delete：归档从默认列表移出但可恢复，历史和引用保留；有引用时默认阻止删除并列出关联；确认删除后关联降级为带原名称的外部引用，不级联删除剧情结构。

### Timeline and writes

- New sessions establish an initial-state timeline baseline.
- One player save, one Chronicler inference, or one confirmed Copilot action creates one atomic WorldState timeline batch when actual state changes exist.
- Each batch records actor, story turn, wall-clock time, optional player-facing evidence/description, and field-level old/new values. Unknown metadata is displayed as unknown, never guessed.
- No-op saves, no-change inference, failed/invalid/cancelled inference create no WorldState change event; runtime activity remains in the existing in-memory activity ledger.
- Timeline is read-only. It supports filtering by turn, actor, object/field and change type, and opens from object/field details. It never rolls back state and does not read a same-Session historical point.
- Fork inherits only timeline events physically present in the fork prefix; late asynchronous parent inference is not fabricated into the child. Timeline distinguishes inherited parent history from branch-local events.
- State writes compare the current projection with the edited/current result; when changed, the durable write is a full new snapshot with provenance rather than a silent field drop.

### Visibility and permissions

- Fields, events and cognition entries support `player`, `model`, `hidden` visibility.
- Author may consume model-visible state while obeying card secret-disclosure rules. Player UI shows only a non-revealing notice for protected content.
- Player cannot directly edit invisible content. Copilot may only stage a player-requested proposal; Chronicler may update from narrative evidence with provenance.
- Player is a special tracked object with the same model and a distinct UI marker; Author never invents player action, dialogue or inner life.
- Player may edit cognition text/status, but cognition correction does not change objective facts.

## Confirmed UI behavior

- Register WorldState as a `conversation.view` session tab alongside host Trajectory and plugin Worldline/Stage tabs.
- Keep a full-data WorldState editor in the native right sidebar. Both surfaces use one session-scoped in-memory draft.
- Main workspace: current-situation overview first (scene, present characters, current objectives, active conflicts), followed by collapsible/searchable/filterable sections for tracked objects, relations, events, goals, conflicts, custom fields and timeline.
- Right sidebar: same editing capability through compact accordions/object selection; timeline remains read-only.
- Draft remains while navigating within the same session. Switching Session requires Save / Discard / Stay. Refresh/restart does not restore an unsaved draft.
- During inference, state and timeline remain viewable, edit controls are disabled, and the draft merges unedited fields from the new projection while preserving player-edited fields with a visible update notice.
- Save confirmation groups changes into added/modified/closed/archived/deleted and lists object/field old/new values.
- Over-budget state may still be saved, but the UI warns about likely context omission and shows major contributors.
- Object detail opens object and field timeline. Archive is visibly distinct from delete. Protected information gets a non-revealing notice only.

## Card package contract

- `state.schema.json` is separate from `state.json` initial state.
- Schema has its own version. Field rename/type/range/meaning changes require card-provided migration or alias declarations; without one, preserve the old field and mark definition mismatch.
- Schema declares field applicability, ID, label, type, default, optional range, order, display component and visibility. Framework components are finite and declarative; cards cannot inject arbitrary frontend runtime.
- Official `maid-heiress` and `yanmen-inn` cards are the first migration and acceptance samples.

## Pre-code conflict check

- **D22 wording vs confirmed model**: resolved in `docs/reference/DECISIONS.md`; WorldState now owns current active objectives/conflicts, while Summarizer owns high-dimensional long-range direction.
- **D5 current implementation vs v2 target**: the current flat model and hard pruning limits remain until the v2 tickets implement the new model; this is an intentional staged migration, not permission to claim current behavior already matches the target.
- **Host UI seams**: no invented global topbar; WorldState uses the existing `conversation.view` session seam and the existing native right sidebar, preserving D21 and Host-First.
- **Session/fork authority**: native `Session.fork` remains the branch source of truth; the timeline is a projection of persisted WorldState batches, not a parallel branch store.
- **Old-session compatibility**: explicitly out of scope by owner decision; no silent migration or fallback contract may be introduced during implementation.
- **Card schema vs Card UI**: `state.schema.json` is a data contract separate from `ui/manifest.json`; neither may become an arbitrary frontend runtime.

## Out of scope

- No old-session schema/timeline migration.
- No same-Session historical point loading or WorldState rollback UI.
- No silent truncation, silent deletion, or automatic object deletion.
- No custom chat HUD or global topbar invented outside existing DSH seams.
- No arbitrary nested field types, formula/derived fields, or a second card UI runtime.
- No replacement of DSH Sessions, projections, jobs, storage, or persistence with plugin infrastructure.

## Acceptance

- New-session start creates and exposes the initial WorldState baseline and timeline.
- Both official cards load the new schema and card-specific fields without treating `affinity` as a universal required field.
- Both WorldState entry points share one draft; save/discard/session-switch behavior is observable.
- Player can create/edit/archive/delete tracked objects with reference safety; edit relations, goals, conflicts, cognition, events and card-defined fields.
- Chronicler updates full state from explicit evidence, suppresses unnecessary new objects/fields, creates a timeline batch only for actual changes, and never writes player action/dialogue/inner life.
- Timeline displays actor, turn/time, old/new values, inherited-vs-local branch origin, unknown metadata honestly, and supports the agreed filters.
- Protected visibility does not leak to player UI; Author can consume model-visible state without violating card secret rules.
- Real fork, inference race, shared draft merge, right-sidebar and conversation-view flows are covered by tests and current DSH browser validation before declaring the slice complete.
- Project quality gates pass: environment, format, typecheck, lint, full tests, build and `git diff --check`.
