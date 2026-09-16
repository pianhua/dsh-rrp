# 当前任务（ACTIVE_TASK.md）

> 更新时间：2026-09-16  
> 规格基线：[`DESIGN.md`](DESIGN.md) · 宿主映射：[`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) · 开发流程：[`DEVELOPMENT.md`](DEVELOPMENT.md)

---

## 任务状态

- **阶段**：阶段 9 — 外部记忆扩展接入（已完成）
- **状态**：全部可自动推进的阶段（0–5、5.5、7、8、9）已实现并验证；**唯一剩余阶段 6 需所有者先拍板卡包格式（D13）**
- **原则**：先锁定形态与宿主映射，再落实现；每阶段回读本文件

---

## 真机首测反馈与修复（2026-09-16）

所有者在 `rp-dev` 上用真实 API 实测一轮后的反馈与处置：

| 反馈 | 诊断 | 处置 |
| :--- | :--- | :--- |
| 只发「你好」却凭空出现「归离客栈」整段剧情 | 随包示例技能 `return-inn` 被模型过度触发；Author 人设缺少「无设定不得自造世界」的约束 | ① 从随包 RP 模式移除该示例技能（现 `RP skills visible (0)`），格式示例移入 [`examples/return-inn.SKILL.md`](reference/examples/return-inn.SKILL.md)；② Author 人设新增「起手约束」：无设定/开场白时只做简短、不与具体世界观绑定的回应 |
| 右侧状态栏是裸 JSON 文本框，可视化差、难改 | 首版为最小可用形态 | 重做为**结构化就地编辑器**（`src/client/world-state-tab.tsx`）：场景三字段 + 角色卡片（好感/情绪/外貌/状态）+ 物品卡片（数量/备注）+ 事件键值，均可增删改；保存后由权威投影回读 |
| 状态栏是否依赖已装插件 | — | **不依赖**。面板走宿主原生右侧栏（`@deepseek-ai/dsh-client-ui-sidebar-right`，属标准 web-app）；渲染发生在 `rp-dev`——该 profile 仅 base + web-app + 本插件，无任何社区插件 |
| 轨迹调用是否符合预期 | — | 符合：`agent/pre-step` 注入的「世界状态 · 事实基准」、Skills 的 `available_skills` 与 `skill` 调用、纪事官后台任务落账。不符合（已修）：首轮即加载具体设定技能 |

> 证据等级：本次仍为服务端日志 + 所有者截图/口述；面板视觉与交互细节需再次实机确认。

---

## 真机二测反馈与修复（2026-09-16）

所有者第二次实测后的反馈与处置：

| 反馈 | 诊断 | 处置 |
| :--- | :--- | :--- |
| 「状态确实有变，但不知道是写作 Agent 还是变更 Agent 做的」 | 纪事官在后台（D3），产出只有 WorldState 本身，没有任何归因记录 | 新增**活动账本**（`rrp/activity` 追加式投影）：纪事官记录 started/committed/failed + 人类可读变更摘要（`diffWorldState`），玩家矫正记录 `corrected`；右侧面板顶部展示「最近变更」与「纪事官正在推演…」，后台任务名改为可读中文 |
| 「目前不像 RP，还是像 coding agent；RP 以卡为基础，要有开场白」 | **卡包体系整体缺失**（Stage 6 未做）：无角色/世界卡、无开场白、无玩家角色、无初始状态、无世界知识技能 | ① 已加固 Author 人设，禁止一切元叙述/自我介绍；② 出具卡包格式提案 [CARDS.md](reference/CARDS.md)，**待所有者按 D13 拍板**后实现 |

> 证据等级：归因功能为服务端注册日志 + 已构建并已 serve 的客户端 bundle 标记核验 + 40 用例全绿；面板视觉仍需实机确认。

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

**阶段 6：原生卡包格式重制 + 卡片展厅。** 已出具完整提案 [CARDS.md](reference/CARDS.md)（目录结构 / `card.md` frontmatter / 开场白 / 初始状态 / 与 Skills·投影映射 / 展厅入口 / 6 个开放问题）。按 D13，需所有者先在提案 §10 拍板：

1. 载体：目录（推荐）还是单文件打包；
2. 开场白：首条正文（推荐）还是隐藏引导；
3. 世界核心：常驻注入（推荐）还是做成 Skill；
4. 玩家角色：进入 `characters`（推荐）还是单独字段；
5. 是否允许卡包自带 `agent.cordis.yml`（建议先不做）；
6. 卡包根目录位置。

拍板前不写卡包解析代码（避免重演旧项目「先写再返工」）。

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
- **面板形态**：已为结构化就地编辑器 + 活动账本归因；细粒度「就地点击修改数值」待打磨
- **卡包主体**：Stage 6 未实现，当前 RP 无卡无开场白——已在 [CARDS.md](reference/CARDS.md) 出提案，等待 D13 拍板
