# 当前任务（ACTIVE_TASK.md）

> 更新时间：2026-09-16  
> 规格基线：[`DESIGN.md`](DESIGN.md) · 宿主映射：[`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) · 开发流程：[`DEVELOPMENT.md`](DEVELOPMENT.md)

---

## 任务状态

- **阶段**：阶段 5 — Skills 知识体系替代 Lorebook（已完成）
- **状态**：RP 作用域已挂载 `skill-filesystem` + `tool-skill`，随包世界设定技能可被发现
- **原则**：先锁定形态与宿主映射，再落实现；每阶段回读本文件

---

## 阶段路线

| 阶段 | 主题 | 状态 |
| :--- | :--- | :--- |
| **0** | 文档架构与产品形态对齐 | ✅ 完成 |
| **1** | 最小可挂载插件骨架 | ✅ 完成 |
| **2** | 自定义 RP 模式 + Author Agent 基础对话 | ✅ 完成 |
| **3** | WorldState 会话投影 + 原生右侧栏看板 | ✅ 完成 |
| **4** | Chronicler Agent（`ctx.jobs` 异步推演记账） | ✅ 完成 |
| **5** | Skills 知识体系（替代 Lorebook） | ✅ 完成 |
| **5.5** | **闭环补完**：Author 消费最新 WorldState + 玩家矫正（D6） | ⬜ 下一步 |
| 6 | 原生卡包格式重制 + 卡片展厅（D13：待所有者拍板格式） | ⏸️ 待定 |
| 7 | Summarizer Agent（可选大局观，按轮触发） | ⬜ |
| 8 | Session.fork 世界线 + `dsh-synapse` 协同 | ⬜ |
| 9 | 外部记忆扩展接入（EverOS 方向，纯扩展） | ⬜ |

> **路线说明**：阶段 5 完成后，核心 RP 环路仍缺两半——Author 尚未「只读消费最新 WorldState」，面板尚不能「就地矫正」。这两项（D6 核心承诺）优先于阶段 6；阶段 6 卡包格式按 D13 明确留待项目形态成熟、所有者拍板后再定。

---

## 阶段 5 交付物（已完成）

- `presets/rp/agent.cordis.yml`：新增 `@deepseek-ai/dsh-skill-filesystem`（`bundledSkillDir` 指向随模式物化的技能目录）与 `@deepseek-ai/dsh-tool-skill`；只在 RP 作用域注册，不污染其他模式
- `presets/rp/skills/return-inn/SKILL.md`：示例世界设定技能（frontmatter `name` / `description` 决定语义触发）
- `src/preset.ts`：物化整棵 preset 树（含 `skills/`），把组合里的 `__DSH_RRP_SKILL_DIR__` 替换为副本的绝对技能路径；归属哈希改为递归覆盖全部文件
- `src/index.ts`：`verifyPreset` 增加按 RP scope 读取技能目录的诊断日志（宿主能力实证）
- 测试：模板化 + 技能物化 + 既有归属/清理（共 15 用例）
- **实测**：`[dsh-rrp] RP skills visible (1): return-inn`

---

## 下一动作（阶段 5.5 最小切片）

目标：**补齐核心 RP 环路——Author 只读消费最新 WorldState；玩家在右侧栏就地矫正（D6）**。

1. **Author 消费**：每轮起笔前把当前 `rrpWorldState` 作为运行时上下文注入 Author 会话（优先用宿主 `system-prompt` / 预设作用域的既有接缝，不自造提示词拼接管线）
2. **玩家矫正**：右侧栏面板可编辑四大维度；提交后追加**整值** `rrp/world-state` 事件（Last-Write-Wins，无锁、无校验矩阵）
3. 验证：改状态 → 下一轮 Author 以新切面起笔；分支切换后状态精确重放

> 进入前先回读 D5 / D6 / D9 与 [`GLOSSARY.md`](reference/GLOSSARY.md)（WorldState / Player Correction）。

---

## 验收标准

- 阶段 1–5（已达成）：真实 `dsh web` 加载、RP 模式组合、投影注册、右侧栏 Tab 下发、纪事官武装、技能发现，均无报错
- 全程：不触犯 [`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) 第 4 节任一红线
- 每阶段：代码保持轻量透明，无并发/分布式/多用户复杂度

---

## 阻塞与风险

- ~~**Skills 机制**~~：已确认 `skill-filesystem` 的 `bundledSkillDir` 根与作用域注册，并实测发现技能
- **Author 消费接缝**：把 WorldState 注入 Author 提示词的确切宿主接缝（`system-prompt` 段落 / 运行时上下文）需在阶段 5.5 前核实
- **玩家矫正写路径**：面板提交需追加会话事件；客户端到宿主的写通道（Remote/命令）需在阶段 5.5 前核实
- **卡包格式**：按 D13，待所有者拍板后再制定；阶段 6 暂缓
- **模型推演/浏览器实测**：纪事官真实推演、面板渲染与分支重放仍待人工 UI 确认
