# 与 dsh-synapse 协同，而非对标

> 状态：部分取代
> 原编号：D10 · 索引见 [`README.md`](./README.md)
> 最后复审：2026-10-16 · 复审周期 180 天

本 ADR 保留为历史记录。「地图职责交给 dsh-synapse」这部分已被本项目自建的世界线页签取代
（见 [ADR 0024](./0024-worldline-v2-dual-column.md)），dsh-synapse 已于 2026-09-20 从 rp-dev
profile 撤装。本篇仍然有效的是它的**初衷**：不把任何单一插件当作开发 DSH 插件的唯一标杆。

**决策**：地图协同交给 `dsh-synapse`；它**只是参考，不是开发 DSH 插件的唯一标杆**。

**含义**：
- 我们不自建 DAG 画布平台
- 我们的责任是保证**在任何分支/任何会话切换下，属于世界线的领域状态不发生穿帮**；当前投影范围与回归证据见 [`HOST_BASELINE.md`](../reference/HOST_BASELINE.md) 与投影清单
- 学习插件开发规范应参考**广泛社区实践**与宿主勘察证据，见 [`HOST_SEAMS.md`](../reference/HOST_SEAMS.md)

**后续演变（2026-09-20）**：#28 起我们自建了「世界线」页签（会话投影折叠 + 宿主 fork 血缘），#29 补齐冷启动骨架节点——**地图职责已由世界线页签接管，dsh-synapse 于当日从 rp-dev profile 撤装**（`dsh plugin --profile rp-dev remove dsh-synapse`）。协同关系终结，但两条历史结论仍有效：分支物理拓扑仍是 DSH 原生 `Session.fork`；synapse 作为插件开发规范的参考地位不变（本决策的"非对标"初衷正是不要被单一插件绑架）。

## 被否决方案

- **自建 DAG 画布平台**：当时判断复杂度不划算，交给外部插件。后来这个判断被现实推翻——世界线图确实是玩家高频需求，最终仍由本插件自建（[ADR 0024](./0024-worldline-v2-dual-column.md)）。本篇的教训是「暂不自建」与「永不自建」是两回事。
