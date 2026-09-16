# 当前任务（ACTIVE_TASK.md）

> 更新时间：2026-09-16  
> 规格基线：[`DESIGN.md`](DESIGN.md) · 宿主映射：[`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) · 开发流程：[`DEVELOPMENT.md`](DEVELOPMENT.md)

---

## 任务状态

- **阶段**：阶段 7 — Summarizer 大局编年（已完成）
- **状态**：每 N 个 RP 回合后台提炼四维大局观，投影可读，Author 消费；`/summary` 可一键开关
- **原则**：先锁定形态与宿主映射，再落实现；每阶段回读本文件

---

## 阶段路线

| 阶段 | 主题 | 状态 |
| :--- | :--- | :--- |
| **0–5** | 骨架 → RP 模式 → 投影看板 → 纪事官 → Skills | ✅ 完成 |
| **5.5** | 闭环补完：Author 消费 + 玩家矫正（D6） | ✅ 完成 |
| 6 | 原生卡包格式重制 + 卡片展厅（D13：待所有者拍板格式） | ⏸️ 待定 |
| **7** | Summarizer Agent（可选大局观，按轮触发） | ✅ 完成 |
| 8 | Session.fork 世界线 + `dsh-synapse` 协同 | ⬜ 下一步 |
| 9 | 外部记忆扩展接入（EverOS 方向，纯扩展） | ⬜ |

---

## 阶段 7 交付物（已完成）

- `src/macro-summary.ts`：四维大局观词汇（`goal` / `conflict` / `turningPoints` / `threads`）、事件名 `rrp/summary`、投影键 `rrpSummary`、渲染函数
- `src/projection/summary.ts`：`rrpSummary` 会话投影（整值采纳、未命中同引用、wire 复用引用）
- `src/agents/summarizer.ts`：编年官人设与四维输出契约 + 容错 JSON 解析（zod 校验）
- `src/summarizer.ts`：每 **8** 个完成回合触发（`turnBoundary.lastTurn` 计数 + 去重）；`ctx.jobs` 后台任务 + `ctx.llm` 单次推演；落 `rrp/summary`；`/summary on|off` 玩家开关
- `src/author-context.ts`：事实基线同时注入 WorldState 与大局编年（D11：宏观罗盘）
- 测试：解析 / 轮次触发 / 预设门控 / 开关（共 28 用例）
- **实测**：`macro-summary projection registered`、`Summarizer armed for preset rp every 8 turns`、`/summary toggle armed`

---

## 下一动作（阶段 8 最小切片）

目标：**世界线分支（Session.fork）状态精确重放 + 与 dsh-synapse 协同**。

1. 核实 `Session.fork` 后 `rrpWorldState` / `rrpSummary` 投影的重放：两个单元都是纯折叠，理论上天然正确；需实测确认 `inheritedEventCount` 与 fork 前缀语义
2. 确认玩家矫正事件在 fork 后不会「穿透」到父/兄弟分支（各分支日志独立）
3. 不自建地图：仅保证状态在任何分支正确；可视化交给 `dsh-synapse`
4. 验证：fork 一个会话 → 状态从历史重放 → 两个分支独立演进

> 进入前先回读 D9 / D10 与 [`GLOSSARY.md`](reference/GLOSSARY.md)（Branch / Worldline）。

---

## 验收标准

- 阶段 1–7（已达成）：真实 `dsh web` 加载、RP 模式组合、投影注册、右侧栏 Tab、纪事官、技能发现、Author 消费、玩家矫正、纪事官+编年官武装，均无报错
- 全程：不触犯 [`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) 第 4 节任一红线
- 每阶段：代码保持轻量透明，无并发/分布式/多用户复杂度

---

## 阻塞与风险

- **fork 重放**：阶段 8 前需在真实会话上验证 fork 前缀与投影重放（纯折叠应正确，但需实证）
- **/summary 开关持久性**：当前为进程内开关（重启复位）；如需要持久化，后续可改挂 `ctx.settings`（另需 schemastery 与设置卡）
- **面板形态**：仍为 JSON 编辑框；DESIGN 期望的细粒度「就地点击修改」待打磨
- **卡包格式**：按 D13，待所有者拍板后再制定；阶段 6 暂缓
- **模型推演 / 浏览器实测**：纪事官与编年官的真实推演、Author 真实消费、面板渲染仍待人工 UI 确认
