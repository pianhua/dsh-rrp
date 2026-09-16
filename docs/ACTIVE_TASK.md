# 当前任务（ACTIVE_TASK.md）

> 更新时间：2026-09-16  
> 规格基线：[`DESIGN.md`](DESIGN.md) · 宿主映射：[`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) · 开发流程：[`DEVELOPMENT.md`](DEVELOPMENT.md)

---

## 任务状态

- **阶段**：阶段 1 — 最小可挂载插件骨架（已完成）
- **状态**：仓库已有生产代码骨架；可在真实 `dsh web` 下加载、组合、干净卸载
- **原则**：先锁定形态与宿主映射，再落实现；每阶段回读本文件

---

## 阶段路线

| 阶段 | 主题 | 状态 |
| :--- | :--- | :--- |
| **0** | 文档架构与产品形态对齐 | ✅ 完成 |
| **1** | 最小可挂载插件骨架（能 `dsh web` 加载，无业务） | ✅ 完成 |
| 2 | 自定义 RP 模式 + Author Agent 基础对话 | ⬜ 下一步 |
| 3 | WorldState 会话投影 + 原生右侧栏看板 | ⬜ |
| 4 | Chronicler Agent（`ctx.jobs` 异步推演记账） | ⬜ |
| 5 | Skills 知识体系（替代 Lorebook） | ⬜ |
| 6 | 原生卡包格式重制 + 卡片展厅 | ⬜ |
| 7 | Summarizer Agent（可选大局观，按轮触发） | ⬜ |
| 8 | Session.fork 世界线 + `dsh-synapse` 协同 | ⬜ |
| 9 | 外部记忆扩展接入（EverOS 方向，纯扩展） | ⬜ |

---

## 阶段 1 交付物（已完成）

- 工程骨架：`package.json`（`dsh.bundle.patch` + `dsh.client`，DSH 包仅 `peerDependencies`）、`tsconfig.json`、`tsconfig.build.json`、`tsdown.config.ts`
- `cordis.patch.yml`：仅 `insert` 本插件行
- 后端入口 `src/index.ts`：function 插件（`name` / `inject` / `apply`），可逆生命周期 effect
- 客户端入口 `src/client/index.ts`：`window.__ModuleLoader__` 闭包工厂，预留 `sidebar.footer` 空 Seat（可逆）
- `tests/host-mount.spec.ts`：HMR 安全（挂载/卸载无残留）
- 开发环境：`rp-dev` profile + `pnpm run link:dev`（跨盘 junction），见 [`DEVELOPMENT.md`](DEVELOPMENT.md)

---

## 下一动作（阶段 2 最小切片）

目标：**把插件组合出一个自定义 RP 模式，并让 Author Agent 能就基础对话产出正文**。

1. 侦察宿主 Agent 接线：`ctx.agents` / `@deepseek-ai/dsh-agent-presets` 的注册与挂载方式（对照本机 0.1.5-rc.2）
2. 定义 Author Agent 的系统提示词与权能边界（只写正文、严禁代打、不写状态）
3. 以 DSH 原生 preset / RP 模式形态挂载，避免自建编排
4. 在真实 `dsh web` 下跑一轮基础对话验证

> 进入阶段 2 前先回读 D3 / D4 决策与 [`GLOSSARY.md`](reference/GLOSSARY.md) 术语。

---

## 验收标准

- 阶段 1（已达成）：`dsh web` 能加载插件，`apply` 与 disposer 均无报错，组合含 client bundle
- 全程：不触犯 [`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) 第 4 节任一红线
- 每阶段：代码保持轻量透明，无并发/分布式/多用户复杂度

---

## 阻塞与风险

- ~~**真实宿主版本**~~：已核实 CLI 0.1.5-rc.1 / 宿主包 0.1.5-rc.2，与基线一致
- **Agent 模式接线**：`ctx.agents` / `dsh-agent-presets` 的确切注册方式需在阶段 2 开始前核实
- **右侧栏 API**：`ctx.sidebarRightTabs` 在 0.1.5-rc.2 已确认存在；确切签名留阶段 3 核实
- **Skills 机制**：`@deepseek-ai/dsh-skill` 的具体注册方式需在阶段 5 前确认
- **卡包格式**：按用户决策，**留到项目形态成熟后再制定**
- **模型切换风险**：文档先行正是为了避免多代实现漂移；后续每个阶段须回读本文件对齐
