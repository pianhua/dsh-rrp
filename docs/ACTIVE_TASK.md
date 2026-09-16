# 当前任务（ACTIVE_TASK.md）

> 更新时间：2026-09-16  
> 规格基线：[`DESIGN.md`](DESIGN.md) · 宿主映射：[`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) · 开发流程：[`DEVELOPMENT.md`](DEVELOPMENT.md)

---

## 任务状态

- **阶段**：阶段 8 — 世界线 fork 重放 + synapse 边界（已完成）
- **状态**：两个投影单元经实证天然 fork-correct，零运行时改动、零 fork 特判
- **原则**：先锁定形态与宿主映射，再落实现；每阶段回读本文件

---

## 阶段路线

| 阶段 | 主题 | 状态 |
| :--- | :--- | :--- |
| **0–5** | 骨架 → RP 模式 → 投影看板 → 纪事官 → Skills | ✅ 完成 |
| **5.5** | 闭环补完：Author 消费 + 玩家矫正（D6） | ✅ 完成 |
| 6 | 原生卡包格式重制 + 卡片展厅（D13：待所有者拍板格式） | ⏸️ 待定 |
| **7** | Summarizer Agent（可选大局观，按轮触发） | ✅ 完成 |
| **8** | Session.fork 世界线 + `dsh-synapse` 协同 | ✅ 完成 |
| 9 | 外部记忆扩展接入（EverOS 方向，纯扩展） | ⬜ 下一步 |

---

## 阶段 8 交付物（已完成）

- 实证宿主机制：`SessionStore.fork` 把前缀复制进子会话 seed 且 `inheritedEventCount = seed.length`；投影 registry 的 `buildCell` 对 `session.snapshotEvents()`（**含继承前缀**）全量折叠 → 整值纯折叠天然重放
- `tests/fork-replay.spec.ts`：前缀重放还原父切面、兄弟分支互不泄漏、折叠确定性
- `docs/reference/WORLDLINES.md`：fork 重放机制、反模式、与 `dsh-synapse` 的边界（并登记进 reference 索引）
- **零运行时改动**：不需要任何 fork 特判，也不需要为 synapse 写适配

---

## 下一动作（阶段 9 最小切片）

目标：**外部记忆扩展接入（EverOS 方向，纯扩展；D12：记忆外置，核心不内建）**。

1. 侦察宿主既有检索接缝（`dsh-session-query` / 会话查询 / Skills）是否足以承载外部记忆的**接入点**
2. 若有官方接缝：以可选能力（`ctx.get`）暴露一个只读的「记忆查询」扩展点，供 EverOS 类插件接入；**绝不内建向量库/索引引擎**
3. 若无：明确记录「记忆 = 外置扩展」的边界与建议接入方式，不写核心代码
4. 产出：接入说明 + （如可行）最小只读扩展点 + 测试

> 进入前先回读 D12 与 [`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) 红线（不自建数据库/AI 基建）。

---

## 验收标准

- 阶段 1–8（已达成）：真实 `dsh web` 加载、RP 环路、纪事官、Skills、编年官、fork 重放，均无报错
- 全程：不触犯 [`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) 第 4 节任一红线
- 每阶段：代码保持轻量透明，无并发/分布式/多用户复杂度

---

## 阻塞与风险

- **外部记忆接缝**：阶段 9 前需核实宿主是否已有官方检索/记忆接缝；若无，阶段 9 收敛为「边界文档 + 可选只读点」
- **/summary 开关持久性**：进程内状态（重启复位）；如需持久化可挂 `ctx.settings`
- **面板形态**：仍为 JSON 编辑框；细粒度「就地点击修改」待打磨
- **卡包格式**：按 D13 待所有者拍板；阶段 6 暂缓
- **模型推演 / 浏览器实测**：纪事官与编年官真实推演、Author 真实消费、面板渲染、真实 fork 游玩仍待人工 UI 确认
