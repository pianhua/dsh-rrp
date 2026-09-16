# 当前任务（ACTIVE_TASK.md）

> 更新时间：2026-09-16  
> 规格基线：[`DESIGN.md`](DESIGN.md) · 宿主映射：[`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) · 开发流程：[`DEVELOPMENT.md`](DEVELOPMENT.md)

---

## 任务状态

- **阶段**：阶段 2 — 自定义 RP 模式 + Author Agent（已完成）
- **状态**：RP 模式（原生 agent preset）已随插件物化并在真实宿主中成功组合
- **原则**：先锁定形态与宿主映射，再落实现；每阶段回读本文件

---

## 阶段路线

| 阶段 | 主题 | 状态 |
| :--- | :--- | :--- |
| **0** | 文档架构与产品形态对齐 | ✅ 完成 |
| **1** | 最小可挂载插件骨架（能 `dsh web` 加载，无业务） | ✅ 完成 |
| **2** | 自定义 RP 模式 + Author Agent 基础对话 | ✅ 完成 |
| 3 | WorldState 会话投影 + 原生右侧栏看板 | ⬜ 下一步 |
| 4 | Chronicler Agent（`ctx.jobs` 异步推演记账） | ⬜ |
| 5 | Skills 知识体系（替代 Lorebook） | ⬜ |
| 6 | 原生卡包格式重制 + 卡片展厅 | ⬜ |
| 7 | Summarizer Agent（可选大局观，按轮触发） | ⬜ |
| 8 | Session.fork 世界线 + `dsh-synapse` 协同 | ⬜ |
| 9 | 外部记忆扩展接入（EverOS 方向，纯扩展） | ⬜ |

---

## 阶段 2 交付物（已完成）

- `presets/rp/agent.cordis.yml`：RP 模式的 agent-plane 组合，唯一一行 `@deepseek-ai/dsh-persona`，`complete: true`（Author 文本即完整系统提示）+ 屏蔽运行环境快照
- `presets/rp/preset.yml`：模式显示名「角色扮演 · 执笔」与说明
- `src/preset.ts`：把随包 preset 物化到 `<dshHome>/.agent-presets/rp/`（DSH 默认扫描的 user root）；marker 记录哈希，刷新只覆盖自己未被改动的副本，用户编辑永不覆盖
- `src/index.ts`：`apply` 物化 + `ctx.inject(['agentPresets'])` 延迟校验（解决 roster 晚于本行激活的时序问题），`standingKeyFor` 预组合确保模式真实可用
- `tests/preset.spec.ts`：物化 / 刷新 / 用户编辑保护 / 幂等清理
- 实测（真实 `dsh --profile rp-dev`）：`[dsh-rrp] RP preset created at ...` → `[dsh-rrp] RP mode '角色扮演 · 执笔' composed and ready`

> Author 的权能边界（只写正文、严禁代打、不写状态）写在 persona 文本里；Chronicler 与状态记账留待阶段 4。

---

## 下一动作（阶段 3 最小切片）

目标：**WorldState 会话投影 + 原生右侧栏看板**。

1. 侦察 `ctx.sessionProjections.register` 与 `@deepseek-ai/dsh-session-projection` 的 `init/apply` 纯函数契约
2. 定义四大维度（`characters` / `inventory` / `scene` / `flags`）的初始切面与事件折叠（纯数学，领域只写折叠）
3. 客户端注册原生右侧栏 Tab（`ctx.sidebarRightTabs`；slot 键见宿主实测的 `sidebar.right.*`）
4. 真实 `dsh web` 验证：状态渲染正确、分支切换精确重放

> 进入阶段 3 前先回读 D5 / D6 / D9 决策与 [`GLOSSARY.md`](reference/GLOSSARY.md) 术语（WorldState / Player Correction）。

---

## 验收标准

- 阶段 1（已达成）：`dsh web` 能加载插件，`apply` 与 disposer 均无报错，组合含 client bundle
- 阶段 2（已达成）：RP 模式被 roster 发现并成功组合；Author 权能边界写入 persona
- 全程：不触犯 [`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) 第 4 节任一红线
- 每阶段：代码保持轻量透明，无并发/分布式/多用户复杂度

---

## 阻塞与风险

- ~~**真实宿主版本**~~：已核实 CLI 0.1.5-rc.1 / 宿主包 0.1.5-rc.2
- ~~**Agent 模式接线**~~：已确认 `ctx.agentPresets`（`resolve` / `standingKeyFor`）与 user root 物化路径
- **会话投影契约**：`ctx.sessionProjections.register` 的 `init/apply` 签名与事件类型需在阶段 3 开始前对照本机源码核实
- **右侧栏 Tab**：`ctx.sidebarRightTabs` 在 0.1.5-rc.2 已确认存在；确切注册签名留阶段 3 核实
- **Skills 机制**：`@deepseek-ai/dsh-skill` 的具体注册方式需在阶段 5 前确认
- **卡包格式**：按用户决策，**留到项目形态成熟后再制定**
- **对话冒烟**：阶段 2 的「基础对话」仍需在 UI 中选 `角色扮演 · 执笔` 实际发一轮验证（需模型与人工）
