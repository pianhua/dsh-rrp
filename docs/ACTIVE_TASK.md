# 当前任务（ACTIVE_TASK.md）

> 更新时间：2026-09-16  
> 规格基线：[`DESIGN.md`](DESIGN.md) · 宿主映射：[`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) · 开发流程：[`DEVELOPMENT.md`](DEVELOPMENT.md)

---

## 任务状态

- **阶段**：阶段 3 — WorldState 会话投影 + 原生右侧栏看板（已完成）
- **状态**：投影已注册进宿主 registry，右侧栏 Tab 已注册并随 bundle 下发
- **原则**：先锁定形态与宿主映射，再落实现；每阶段回读本文件

---

## 阶段路线

| 阶段 | 主题 | 状态 |
| :--- | :--- | :--- |
| **0** | 文档架构与产品形态对齐 | ✅ 完成 |
| **1** | 最小可挂载插件骨架（能 `dsh web` 加载，无业务） | ✅ 完成 |
| **2** | 自定义 RP 模式 + Author Agent 基础对话 | ✅ 完成 |
| **3** | WorldState 会话投影 + 原生右侧栏看板 | ✅ 完成 |
| 4 | Chronicler Agent（`ctx.jobs` 异步推演记账） | ⬜ 下一步 |
| 5 | Skills 知识体系（替代 Lorebook） | ⬜ |
| 6 | 原生卡包格式重制 + 卡片展厅 | ⬜ |
| 7 | Summarizer Agent（可选大局观，按轮触发） | ⬜ |
| 8 | Session.fork 世界线 + `dsh-synapse` 协同 | ⬜ |
| 9 | 外部记忆扩展接入（EverOS 方向，纯扩展） | ⬜ |

---

## 阶段 3 交付物（已完成）

- `src/world-state.ts`：WorldState 纯词汇（`characters` / `inventory` / `scene` / `flags`）、事件名 `rrp/world-state`、投影键 `rrpWorldState`
- `src/projection/world-state.ts`：zod 4 校验 + 纯折叠；遵守整值事件规则，未命中事件返回**同一引用**；`wire.view` 直接复用状态引用
- `src/index.ts`：`ctx.inject(['sessionProjections'])` 注册投影单元（可逆）
- `src/client/world-state-tab.ts`：原生右侧栏 Tab 类型（`ctx.sidebarRightTabs.register`）+ `sidebar.right.pane.tab` body，经 `useProjection('rrpWorldState')` 读取状态
- `src/client/index.ts`：locale 字典（zh/en）走 `ctx.locale.register`，UI 文案零硬编码（守 HOST_ALIGNMENT 红线）
- 测试：折叠、同引用、逐会话初始化、wire 引用、客户端注册（共 10 用例）
- 实测：`[dsh-rrp] WorldState projection registered (key 'rrpWorldState')`；boot graph 含 `dsh-rrp/client.js`，服务端下发 bundle 含 Tab 注册标记

> 面板渲染与分支重放的浏览器实测仍需人工在 UI 中确认（本机无浏览器自动化）。

---

## 下一动作（阶段 4 最小切片）

目标：**Chronicler Agent 在每轮正文后异步推演世界变化，产出完整 WorldState 并落为会话事件**。

1. 侦察宿主异步接缝：`ctx.jobs`（后台任务）与 `ctx.subagents` / `@deepseek-ai/dsh-subagent`（独立智体派生）
2. 用官方 subagent 机制承载 Chronicler（D4：是正经 Agent，不是提取器），提示词写入 `src/agents/chronicler.ts`
3. 推演结果以**完整状态**追加为 `rrp/world-state` 事件（整值规则），驱动阶段 3 投影与面板刷新
4. 在真实 `dsh web` 跑一轮，验证事件落日志、投影刷新

> 进入阶段 4 前先回读 D3 / D4 / D5 决策与 [`GLOSSARY.md`](reference/GLOSSARY.md) 术语（Chronicler / State Inference）。

---

## 验收标准

- 阶段 1–3（已达成）：真实 `dsh web` 加载、RP 模式组合、投影注册、右侧栏 Tab 下发，均无报错
- 全程：不触犯 [`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) 第 4 节任一红线
- 每阶段：代码保持轻量透明，无并发/分布式/多用户复杂度

---

## 阻塞与风险

- ~~**会话投影契约**~~：已确认 `ctx.sessionProjections.register` 的 `init/apply/wire` 与 zod 4 schema 契约，并实测注册成功
- ~~**右侧栏 Tab**~~：已确认两段式注册（`ctx.sidebarRightTabs.register` + `sidebar.right.pane.tab`）并随 bundle 下发
- **事件追加 API**：需在阶段 4 前核实宿主向会话日志追加自定义事件的确切接缝
- **异步智体接缝**：`ctx.jobs` 与 `ctx.subagents` 的确切用法需在阶段 4 开始前核实
- **Skills 机制**：`@deepseek-ai/dsh-skill` 的具体注册方式需在阶段 5 前确认
- **卡包格式**：按用户决策，**留到项目形态成熟后再制定**
- **浏览器实测**：面板渲染 / 分支重放 / 基础对话均需人工 UI 确认
