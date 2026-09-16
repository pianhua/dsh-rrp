# 当前任务（ACTIVE_TASK.md）

> 更新时间：2026-09-16  
> 规格基线：[`DESIGN.md`](DESIGN.md) · 宿主映射：[`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) · 开发流程：[`DEVELOPMENT.md`](DEVELOPMENT.md)

---

## 任务状态

- **阶段**：阶段 9 — 外部记忆扩展接入（已完成）
- **状态**：全部可自动推进的阶段（0–5、5.5、7、8、9）已实现并验证；**唯一剩余阶段 6 需所有者先拍板卡包格式（D13）**
- **原则**：先锁定形态与宿主映射，再落实现；每阶段回读本文件

---

## 阶段路线

| 阶段 | 主题 | 状态 |
| :--- | :--- | :--- |
| **0–5** | 骨架 → RP 模式 → 投影看板 → 纪事官 → Skills | ✅ 完成 |
| **5.5** | 闭环补完：Author 消费 + 玩家矫正（D6） | ✅ 完成 |
| **7** | Summarizer Agent（可选大局观，按轮触发） | ✅ 完成 |
| **8** | Session.fork 世界线 + `dsh-synapse` 协同 | ✅ 完成 |
| **9** | 外部记忆扩展接入（EverOS 方向，纯扩展） | ✅ 完成 |
| 6 | 原生卡包格式重制 + 卡片展厅 | ⏸️ **仅剩此项：待所有者拍板格式（D13）** |

---

## 阶段 9 交付物（已完成）

- `src/contracts.ts` + `dsh-rrp/contracts` 子路径：对外**稳定只读契约**（投影键 `rrpWorldState`/`rrpSummary`、事件名、WorldState/MacroSummary 类型、渲染函数），依赖为零，host 与 client 均可导入
- `docs/reference/MEMORY.md`：D12 边界、可用宿主接缝（`ctx.sessionQuery` 官方检索 / Skills / `agent/pre-step` / 工具注册）、EverOS 方向接入建议、五条反模式
- 实证：`ctx.sessionQuery`（`dsh-session-query` + sqlite backend）是官方检索接缝；`dsh-recall-plugin` 实为「消息撤回」而非记忆，避免误判
- **零核心记忆基建**：不内建向量库/嵌入/索引引擎（守 D12 与「个人玩具」红线）
- 测试 33 用例（含契约导出的键/事件/渲染）

---

## 下一动作

**阶段 6：原生卡包格式重制 + 卡片展厅。** 该阶段按 D13 明确「**留到项目形态成熟后再制定，现在不定死**」，需要所有者先给出：
1. 卡包承载的资产范围（人设 / 开局 / 世界知识 Skills / 初始 WorldState / 预设模式）；
2. 格式取向（纯目录 + YAML/Markdown，还是单文件打包）；
3. 与现有 RP preset / Skills / 投影的映射方式。

在此之前不擅自制定格式、不写卡包解析代码（避免重演旧项目「先写再返工」）。

---

## 验收标准

- 阶段 1–5、5.5、7、8、9（已达成）：真实 `dsh web` 加载、RP 环路、纪事官、Skills、编年官、fork 重放、外部契约，均无报错；`pnpm run typecheck` / `build` / `test`（33 用例）全绿
- 全程：不触犯 [`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) 第 4 节任一红线
- 每阶段：代码保持轻量透明，无并发/分布式/多用户复杂度

---

## 阻塞与风险

- **阶段 6（唯一阻塞）**：卡包格式待所有者拍板（D13）；这是**所有者决策**，不是技术阻塞
- **人工验证项**：纪事官/编年官真实模型推演、Author 真实消费、面板渲染、真实 fork 游玩——均需人工 UI 确认（本机无浏览器自动化、未自动烧 token）
- **/summary 开关持久性**：进程内状态；如需持久化可挂 `ctx.settings`
- **面板形态**：仍为 JSON 编辑框；细粒度「就地点击修改」待打磨
