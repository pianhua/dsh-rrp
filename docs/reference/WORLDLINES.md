# 世界线与 fork 重放（WORLDLINES.md）

> **回答的问题**：为什么 `dsh-rrp` 的状态在任何分支/任何切点上都不会穿帮？以及我们与 `dsh-synapse` 的边界。
> 契约层：[`DECISIONS.md`](DECISIONS.md) D9 / D10 · [`HOST_ALIGNMENT.md`](../HOST_ALIGNMENT.md)。

---

## 1. 结论（一句话）

状态由**整值事件 + 纯折叠**得出，而宿主的投影 registry 对**整条会话日志（含 fork 继承前缀）**全量折叠，因此 fork 后必然重放出与父会话一致的切面；分支各自追加的事件只进各自日志，互不穿透。

---

## 2. 机制（宿主侧实证）

1. **fork 复制前缀**：`SessionStore.fork(source, boundary, childId)` 把源会话截至 `boundary` 的事件复制进子会话 seed，并令 `inheritedEventCount = seed.length`（`dsh-session`）。子会话的 `snapshotEvents()` 返回「继承前缀 + 自己的新事件」。
2. **投影全量折叠**：`SessionProjectionRegistry.buildCell(def, header, inheritedEventCount, session.snapshotEvents())` 从 `init` 开始，对**整条日志**（含继承前缀）应用 `apply`。`init(header, inheritedEventCount)` 只提供元数据与切口，**不替代重放**（`dsh-session-projection`）。
3. **本插件两个单元都是整值折叠**：
   - `rrp/world-state` → `rrpWorldState`（`characters` / `inventory` / `scene` / `flags`）；
   - `rrp/summary` → `rrpSummary`（四维大局观）。
   事件携带**变化后的完整状态**，`apply` 只做采纳；无关事件返回**同一引用**（Object.is 闸门零下游工作）。
4. **分支独立**：每个会话是独立 append-only 日志，玩家矫正（`/dsh-rrp/world-state` 路由）与纪事官/编年官落账都写到**当前会话**。fork 出的子会话从共享前缀起，后续写入互不可见。

> 回归：[`tests/fork-replay.spec.ts`](../../tests/fork-replay.spec.ts) 断言前缀重放还原父切面、兄弟分支互不泄漏、折叠确定性。

---

## 3. 反模式（不要做）

| ❌ 反模式 | 为什么 |
| :--- | :--- |
| 在 `init` 里根据 `inheritedEventCount` 重置/裁剪状态 | 状态应由事件重放得出；init 不替代重放 |
| 为「fork 后」写特判或分支感知逻辑 | 纯折叠天然正确，特判只会引入漂移 |
| 自建分支结构 / DAG / 画布 | 分支就是原生 `Session.fork`；可视化交给 `dsh-synapse` |
| 让状态事件只写增量 | 违反整值事件规则，破坏重放与自描述 |

---

## 4. 与 dsh-synapse 的边界（D10）

- `dsh-synapse` 负责**地图与拓扑可视化**，是参考实现而非开发标杆；
- 我们的唯一责任：**任何分支、任何切点下状态不穿帮**；
- 我们不自建 DAG 平台、不需要为 synapse 做任何适配代码——它读会话拓扑，我们的状态挂在原生会话上。
