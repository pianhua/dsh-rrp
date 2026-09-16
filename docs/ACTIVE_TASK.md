# 当前任务（ACTIVE_TASK.md）

> 更新时间：2026-09-16  
> 规格基线：[`DESIGN.md`](DESIGN.md) · 宿主映射：[`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) · 开发流程：[`DEVELOPMENT.md`](DEVELOPMENT.md)

---

## 任务状态

- **阶段**：阶段 4 — Chronicler Agent 异步推演记账（已完成）
- **状态**：纪事官已随宿主 `ctx.jobs` + `ctx.llm` 武装；RP 会话每轮结束异步推演并落整值事件
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
| 5 | Skills 知识体系（替代 Lorebook） | ⬜ 下一步 |
| 6 | 原生卡包格式重制 + 卡片展厅 | ⬜ |
| 7 | Summarizer Agent（可选大局观，按轮触发） | ⬜ |
| 8 | Session.fork 世界线 + `dsh-synapse` 协同 | ⬜ |
| 9 | 外部记忆扩展接入（EverOS 方向，纯扩展） | ⬜ |

---

## 阶段 4 交付物（已完成）

- `src/agents/chronicler.ts`：纪事官人设与推演准则；**完整状态**输出契约；容错 JSON 提取 + zod 校验（`parseChroniclerReply`）
- `src/chronicler.ts`：
  - 触发：宿主 `session/event` 的 `turn/end` 且 `reason.kind === 'completed'`，并用 `agentPreset` 投影门控为 RP 会话
  - 调度：`ctx.jobs.attachController('dsh-rrp')` 自附全局控制器（RP preset 无 tool-jobs 行）→ `ctx.jobs.start` 注册后台任务
  - 推演：`ctx.llm.stream` 单次领域提示词调用（对照宿主 `compaction-basic` 的调用形态），可取消
  - 落账：`session.append('rrp/world-state', 完整状态)`（整值事件），驱动阶段 3 投影与面板刷新
  - 全程错误contained：失败只记日志，绝不打断会话
- 测试：提示词/解析（含容错与拒绝）、预设门控、**假 LLM 端到端**（触发→任务→推演→落账）
- 实测：`[dsh-rrp] Chronicler armed for preset rp`（附带控制器无报错）

> 记：真实模型的一轮推演需在 UI 中实际游玩一次确认（本机未自动触发模型调用）。

---

## 下一动作（阶段 5 最小切片）

目标：**Skills 知识体系替代 Lorebook（D7）**。

1. 侦察 `ctx.skills` 与 `@deepseek-ai/dsh-skill-filesystem` 的注册/扫描契约（`SKILL.md` 目录、roots、`snapshot/list/get`）
2. 确定卡包世界知识的落点（项目 `.dsh/skills` / `customSkillDirs` / 运行时 `ctx.skills.register`）
3. RP preset 纳入 `skill-filesystem` + `tool-skill` 行，让 Author 按需调取设定（渐进披露，不硬塞上下文）
4. 真实 `dsh web` 验证：设定按需加载、正文引用正确

> 进入阶段 5 前先回读 D7 / D8 与 [`SKILLS.md`](reference/SKILLS.md)。

---

## 验收标准

- 阶段 1–4（已达成）：真实 `dsh web` 加载、RP 模式组合、投影注册、右侧栏 Tab 下发、纪事官武装，均无报错
- 全程：不触犯 [`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) 第 4 节任一红线
- 每阶段：代码保持轻量透明，无并发/分布式/多用户复杂度

---

## 阻塞与风险

- ~~**事件追加 API**~~：已确认 `Session.append` 对未知事件类型放行（仅校验 `request/header`、`tool/result`），整值事件可落日志
- ~~**异步接缝**~~：已确认 `ctx.jobs.attachController` + `ctx.jobs.start` 与 `ctx.llm.stream` 契约
- **模型推演验证**：真实模型的一轮 Chronicler 推演尚未实测（需人工游玩一次）
- **Skills 机制**：`@deepseek-ai/dsh-skill` 的具体注册方式需在阶段 5 前确认
- **卡包格式**：按用户决策，**留到项目形态成熟后再制定**
- **浏览器实测**：面板渲染 / 分支重放 / 基础对话仍待人工 UI 确认
