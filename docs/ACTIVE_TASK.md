# 当前任务（ACTIVE_TASK.md）

> 更新时间：2026-09-16  
> 规格基线：[`DESIGN.md`](DESIGN.md) · 宿主映射：[`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md)

---

## 任务状态

- **阶段**：阶段 0 — 文档与产品形态对齐
- **状态**：文档架构已补齐；**尚无生产代码**（刻意如此）
- **原则**：先锁定形态与宿主映射，再落第一行实现

---

## 阶段路线

| 阶段 | 主题 | 状态 |
| :--- | :--- | :--- |
| **0** | 文档架构与产品形态对齐 | ✅ 完成 |
| 1 | 最小可挂载插件骨架（能 `dsh web` 加载，无业务） | ⬜ 下一步 |
| 2 | 自定义 RP 模式 + Author Agent 基础对话 | ⬜ |
| 3 | WorldState 会话投影 + 原生右侧栏看板 | ⬜ |
| 4 | Chronicler Agent（`ctx.jobs` 异步推演记账） | ⬜ |
| 5 | Skills 知识体系（替代 Lorebook） | ⬜ |
| 6 | 原生卡包格式重制 + 卡片展厅 | ⬜ |
| 7 | Summarizer Agent（可选大局观，按轮触发） | ⬜ |
| 8 | Session.fork 世界线 + `dsh-synapse` 协同 | ⬜ |
| 9 | 外部记忆扩展接入（EverOS 方向，纯扩展） | ⬜ |

---

## 下一动作（阶段 1 最小切片）

目标：**一个能被 DSH 加载、但什么都不做的空插件**。

1. 建立工程骨架：`package.json` / `tsconfig.json` / `tsdown` 配置（对标 HOST_ALIGNMENT 第 5 节）
2. 编写 `cordis.patch.yml`（仅 `insert` 本插件）
3. 后端入口 `src/index.ts`：function 插件形态，具名导出 `name` / `inject` / `apply`，预留一行安全日志
4. 客户端入口 `src/client/index.ts`：预留空 Slot 注册（可逆 effect）
5. 在真实 `dsh web` 下验证：插件加载成功、无报错、卸载干净

> 阶段 1 完成后才进入 RP 领域代码；在此之前不写任何 Agent / 状态 / UI 逻辑。

---

## 验收标准

- 阶段 1：`dsh web` 能加载插件，`apply` 与 disposer 均无报错，HMR 可干净重载
- 全程：不触犯 [`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) 第 4 节任一红线
- 每阶段：代码保持轻量透明，无并发/分布式/多用户复杂度

---

## 阻塞与风险

- **真实宿主版本**：需确认本机 `dsh` 版本与目标基线（`>= 0.1.5-rc.1`）一致
- **右侧栏 API**：`ctx.sidebarRightTabs` / `ctx.sidebarRight` 的确切签名需在阶段 3 前对照最新宿主源码核实
- **Skills 机制**：`@deepseek-ai/dsh-skill` 的具体注册方式需在阶段 5 前确认
- **卡包格式**：按用户决策，**留到项目形态成熟后再制定**，当前不锁定
- **模型切换风险**：文档先行正是为了避免多代实现漂移；后续每个阶段须回读本文件对齐
