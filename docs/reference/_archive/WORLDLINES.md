# 世界线与 fork 重放（WORLDLINES.md）

> **回答的问题**：为什么 `dsh-rrp` 的**事件派生状态**在任何分支/任何切点上不会穿帮？以及我们与 `dsh-synapse` 的边界。
> 契约层：[`DECISIONS.md`](DECISIONS.md) D9 / D10 · [`HOST_ALIGNMENT.md`](../HOST_ALIGNMENT.md)。

---

## 1. 结论（一句话）

Card、WorldState、Summary 与 Settings 由**整值事件 + 纯折叠**得出，Sediment 由有界操作事件纯折叠得出。宿主的投影 registry 对**整条会话日志（含 fork 继承前缀）**全量折叠，因此 fork 后会重放出分叉点对应切面；分支各自追加的事件只进各自日志，互不穿透。

---

## 2. 机制（宿主侧实证）

1. **fork 复制前缀**：`SessionStore.fork(source, boundary, childId)` 把源会话截至 `boundary` 的事件复制进子会话 seed，并令 `inheritedEventCount = seed.length`（`dsh-session`）。子会话的 `snapshotEvents()` 返回「继承前缀 + 自己的新事件」。
2. **投影全量折叠**：`SessionProjectionRegistry.buildCell(def, header, inheritedEventCount, session.snapshotEvents())` 从 `init` 开始，对**整条日志**（含继承前缀）应用 `apply`。`init(header, inheritedEventCount)` 只提供元数据与切口，**不替代重放**（`dsh-session-projection`）。
3. **本插件五个投影都只依赖会话事件**：
   - `user/message.source.rrp.card` → `rrpCard`（当前卡包上下文）；
   - `user/message.source.rrp.worldState` → `rrpWorldState`（`characters` / `inventory` / `scene` / `flags`）；
   - `user/message.source.rrp.summary` → `rrpSummary`（四维大局观）；
   - `user/message.source.rrp.settings` → `rrpSettings`（当前存档的摘要开关）；
   - `user/message.source.rrp.sediment` → `rrpSediment`（动态知识的 `snapshot/add/remove` 操作）。
   前四类事件携带**变化后的完整状态**；Sediment 使用按序操作以保持确认/删除语义。所有 `apply` 都是确定性纯函数，无关或无效事件返回同一引用。
4. **分支独立**：每个会话是独立 append-only 日志，玩家矫正（`/dsh-rrp/world-state` 路由）与纪事官/编年官落账都写到**当前会话**。fork 出的子会话从共享前缀起，后续写入互不可见。

> 回归：[`tests/fork-replay.spec.ts`](../../tests/fork-replay.spec.ts) 对 Card / WorldState / Summary / Settings / Sediment 断言前缀重放、兄弟分支隔离与折叠确定性。

---

## 3. D8 沉淀的世界线语义

D8 属于会话时间线。确认写入 `add`，删除写入 `remove`，迁移旧数据时写入一次 `snapshot`；`rrpSediment` 按日志顺序折叠为当前技能列表。当前 agent 的 provider 只读取所属 Session 的投影，因此：

- 不同卡、不同存档天然隔离；
- 子会话继承分叉点前已确认的沉淀；
- 父、子或兄弟分支在分叉后新增/删除的沉淀互不可见；
- 无需复制目录、感知 fork，或自建 DAG。

旧路径 `<dshHome>/.dsh-rrp/sediment/sessions/<sessionId>/` 不再是运行时真源。首次为旧会话创建 RP agent 时，若投影尚无沉淀事件，插件读取其中合法条目并追加一个 `snapshot`；只有 append 成功后才把原目录重命名为 `.legacy.bak`。失败会保留源目录，避免假迁移。

---

## 4. 反模式（不要做）

| ❌ 反模式 | 为什么 |
| :--- | :--- |
| 在 `init` 里根据 `inheritedEventCount` 重置/裁剪状态 | 状态应由事件重放得出；init 不替代重放 |
| 为事件投影写「fork 后」特判或分支感知逻辑 | 纯折叠天然正确，特判只会引入漂移 |
| 自建分支结构 / DAG / 画布 | 分支就是原生 `Session.fork`；可视化交给 `dsh-synapse` |
| 让 WorldState / Summary / Settings 只写局部 diff | 这些状态采用整值规则；局部 diff 会降低自描述性并放大迁移复杂度 |
| 用目录复制补 D8 fork | 无法自然表达任意切点，且重新发明分支持久化 |

---

## 5. 与 dsh-synapse 的边界（D10）

- `dsh-synapse` 负责**地图与拓扑可视化**，是参考实现而非开发标杆；
- 我们的责任：**任何分支、任何切点下，属于世界线的领域状态都不穿帮**；五个投影都以原生 Session 前缀重放为准；
- 我们不自建 DAG 平台、不需要为 synapse 做任何适配代码——它读会话拓扑，我们的状态挂在原生会话上。
