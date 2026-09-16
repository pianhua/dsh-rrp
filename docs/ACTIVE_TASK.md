# 当前任务（ACTIVE_TASK.md）

> 更新时间：2026-09-16  
> 规格基线：[`DESIGN.md`](DESIGN.md) · 宿主映射：[`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) · 开发流程：[`DEVELOPMENT.md`](DEVELOPMENT.md)

---

## 任务状态

- **阶段**：阶段 5.5 — 核心 RP 环路闭环（已完成）
- **状态**：Author 只读消费最新 WorldState；玩家可在右侧栏就地矫正（D6，无锁 Last-Write-Wins）
- **原则**：先锁定形态与宿主映射，再落实现；每阶段回读本文件

---

## 阶段路线

| 阶段 | 主题 | 状态 |
| :--- | :--- | :--- |
| **0–5** | 骨架 → RP 模式 → 投影看板 → 纪事官 → Skills | ✅ 完成 |
| **5.5** | 闭环补完：Author 消费 WorldState + 玩家矫正（D6） | ✅ 完成 |
| 6 | 原生卡包格式重制 + 卡片展厅（D13：待所有者拍板格式） | ⏸️ 待定 |
| 7 | Summarizer Agent（可选大局观，按轮触发） | ⬜ 下一步 |
| 8 | Session.fork 世界线 + `dsh-synapse` 协同 | ⬜ |
| 9 | 外部记忆扩展接入（EverOS 方向，纯扩展） | ⬜ |

> **路线说明**：核心 RP 环路已闭环。阶段 6 卡包格式按 D13 留待所有者拍板，不阻塞主线；先行推进阶段 7。

---

## 阶段 5.5 交付物（已完成）

- `src/author-context.ts`：宿主 `agent/pre-step` waterfall；对 RP 会话把 `renderWorldState` 作为 user-role 事实基准插入当前步；状态未变则不重复注入（保持上下文精简）
- `src/correction.ts`：宿主 `ctx.webServer.register` 精确路由 `POST /dsh-rrp/world-state`；zod 校验 → `ctx.sessions.get` 定位 → `session.append('rrp/world-state', 完整状态)`（自然时序、无锁、Last-Write-Wins）
- `src/client/world-state-tab.ts`：面板可编辑当前状态并保存；保存后由权威日志驱动投影刷新
- `src/world-state.ts`：新增共享纯函数 `renderWorldState`
- 测试：pre-step 注入 / 去重 / 预设门控；路由校验 / 404 / 落账（共 21 用例）
- **实测**：`Author WorldState context armed for preset rp`、`player correction route armed at /dsh-rrp/world-state`；HTTP 探针 400（缺 sessionId）/ 404（未知会话）响应正确

---

## 下一动作（阶段 7 最小切片）

目标：**Summarizer Agent——按轮次提炼四维大局观，防止长篇剧情偏航，玩家可关（D11）**。

1. 侦察宿主接缝：复用阶段 4 的 `ctx.jobs` + `ctx.llm` 形态；确定对话轮次计数来源（`turnBoundary` 投影或 `turn/end` 计数）
2. `src/agents/summarizer.ts`：摘要人设 + 四维大局观输出契约（主线总目标 / 当前核心矛盾 / 重大转折 / 伏笔危机）
3. 每 N 轮后台触发一次；摘要落为独立会话事件并投影；提供开关（默认开或按宿主 settings）
4. 真实 `dsh web` 验证：达到轮次阈值时摘要任务触发、正文消费大局观

> 进入前先回读 D11 与 [`DESIGN.md`](DESIGN.md) 第 1.4 / 3 节。

---

## 验收标准

- 阶段 1–5.5（已达成）：真实 `dsh web` 加载、RP 模式组合、投影注册、右侧栏 Tab 下发、纪事官武装、技能发现、Author 消费、玩家矫正路由，均无报错
- 全程：不触犯 [`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) 第 4 节任一红线
- 每阶段：代码保持轻量透明，无并发/分布式/多用户复杂度

---

## 阻塞与风险

- ~~**Author 消费接缝**~~：已确认并实测 `agent/pre-step` waterfall
- ~~**玩家矫正写路径**~~：已确认 `ctx.webServer.register` + `Session.append`，实测路由响应
- **面板形态**：当前为 JSON 编辑框（功能可用）；DESIGN 期望的「点击数值就地修改」的细粒度编辑器待后续打磨
- **轮次计数 / 开关**：阶段 7 前需核实 `turnBoundary` 投影与 settings 开关接缝
- **卡包格式**：按 D13，待所有者拍板后再制定；阶段 6 暂缓
- **模型推演 / 浏览器实测**：纪事官真实推演、Author 真实消费、面板渲染与分支重放仍待人工 UI 确认
