# 当前任务（ACTIVE_TASK.md）

> 更新时间：2026-09-17  
> **交接总入口：[`HANDOFF.md`](HANDOFF.md) · [`NEXT_AI_HANDOFF.md`](NEXT_AI_HANDOFF.md)**
> 规格基线：[`DESIGN.md`](DESIGN.md) · 宿主映射：[`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) · 开发流程：[`DEVELOPMENT.md`](DEVELOPMENT.md)

---

## 任务状态

- **阶段**：完成卡牌/存档/世界线隔离与 Workspace 适配重构；D5 动态状态及若干宿主边界仍未闭环
- **状态**：本轮重构已完成自动验证；真实宿主 UI、旧数据迁移与 fork 交互仍待人工验收，之后按“先架构收敛、后功能扩展”的顺序推进
- **后续执行**：当前 AI 已停止后续开发；下一位 AI 的唯一执行队列见 [`NEXT_AI_HANDOFF.md`](NEXT_AI_HANDOFF.md)，外部测试者负责自动与 `rp-dev` 验收
- **原则**：先锁定形态与宿主映射，再落实现；每阶段回读本文件

### 当前事实基线

| 项 | 结论 |
| :--- | :--- |
| 审计起点 | `main` @ `4abe489`，44 次提交，审计前工作区干净 |
| 自动验证 | `pnpm test`：Vitest **21 文件 / 117 用例全绿**；另有 `pnpm run typecheck`、`pnpm run build`、`git diff --check` 全绿 |
| 架构总评 | 主骨架符合 DSH 薄插件：未发现自建 server、数据库、任务队列、Agent loop、会话 DAG 或独立 SPA |
| 规格缺口 | D5 文档要求动态结构，当前 WorldState schema/UI 仍固定四域 |
| 世界线 | Card / WorldState / Summary / Settings / Sediment 均由 Session 投影重放；fork 继承分叉点前缀，分叉后独立 |
| Preset 真源 | 当前 preset 只读宿主 `agentPreset` 投影；Session header 仅是创建事实，不能用于后续 `agentPresets.select` 的鉴权或运行态武装 |
| 宿主边界 | D8 已收回会话事件/投影；仍有世界状态与典籍 2s 轮询、YAML 子集解析与进程 Map 生命周期债务 |
| 正确性风险 | 写入失败已向开卡、矫正、D8 与后台智体传播；推演期间仍可保存矫正，D6 顺序窗口尚未封口 |

> 本表是接下来开发的唯一任务入口。历史章节保留当时证据，不代表上述问题已经解决。

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
| 「状态确实有变，但不知道是写作 Agent 还是变更 Agent 做的」 | 纪事官在后台（D3），产出只有 WorldState 本身，没有任何归因记录 | 新增**活动账本**（宿主内存账本 + `GET /dsh-rrp/activity`）：纪事官记录 started/committed/failed + 人类可读变更摘要（`diffWorldState`），玩家矫正记录 `corrected`；右侧面板顶部展示「最近变更」与「纪事官正在推演…」，后台任务名改为可读中文 |
| 「目前不像 RP，还是像 coding agent；RP 以卡为基础，要有开场白」 | **卡包体系整体缺失**（Stage 6 未做）：无角色/世界卡、无开场白、无玩家角色、无初始状态、无世界知识技能 | ① 已加固 Author 人设，禁止一切元叙述/自我介绍；② 出具卡包格式提案 [CARDS.md](reference/CARDS.md)，**待所有者按 D13 拍板**后实现 |

> 证据等级：归因功能为服务端注册日志 + 已构建并已 serve 的客户端 bundle 标记核验 + 40 用例全绿；面板视觉仍需实机确认。

---

## 长线实测与修复（2026-09-16）

15 轮真实模型长局：**P0 全无，各专项 PASS**（人设/归因/摘要/技能/矫正/fork 重放；详见 [LONG_PLAY_TEST.md](reference/LONG_PLAY_TEST.md)）。

唯一 **P1 = WorldState 事件累积**（flags 3→32，注入基线随轮增长），已修：提示词改为「当前切面」语义 + `pruneWorldState` 宿主硬上限（提交 `4eaab20`）。

**续修（上下文发布，经历一次纠错）**：

1. 发现宿主把每条 pre-step 注入以 `surfaceOp:'append'` 落盘 → 每轮追加一份过时状态；
2. 一度改为 **replace 式发布**（surface 恒定 1 份），但实测**摧毁前缀 KV 缓存**（命中率 90%→14%，`cacheRead` 卡死 1024）——replace 会搬动消息位置，破坏"上轮请求是下轮请求前缀"；
3. **最终定案：append + 内容去重**（`src/state-publisher.ts`）——卡包只注入一次、事实仅在变化时追加；接受上下文增长（旧副本**被缓存**，交给宿主 compaction），换取缓存连续性。

**真机复验 PASS**（Chrome Agent，提交 `6610e4a`）：命中率 40%→43%→74%→**82%→88%→80%**，`cacheRead` 持续增长（1024→6144），`replace=0`，`card IN LOG=1`。详见 [CONTEXT_PUBLISHER_VERIFY.md](reference/CONTEXT_PUBLISHER_VERIFY.md) §10。

---

## UI 精修（2026-09-17）

所有者实测后给出两条明确反馈，本轮据此改造：

| 反馈 | 处置 |
| :--- | :--- |
| 「纸质主题不好看，暂时用回 DSH 原版亮暗」 | **撤掉 P0 暖纸 override**：删除 `src/client/theme.ts`、client `inject` 移除 `theme`、`context-types.ts` 去掉主题服务面、`tests/client.spec.ts` 改为「不覆盖宿主主题」断言 |
| 「侧边栏、选卡、开始这些 UI 太简陋，要做精美」 | 面板改用**宿主自己的原子库**：`@deepseek-ai/dsh-client-ui-primitives`（平台模块，见 [HOST_SEAMS.md](reference/HOST_SEAMS.md) §A4）——展厅加搜索/封面/标签/技能卡/开场白/底部主操作条；世界状态侧栏改为卡片化就地编辑器 + 底部保存条 + 运行中状态点 |

**证据等级**：`typecheck` / `build` / `test`（66 用例）全绿；已构建客户端 bundle 已 serve 且含新标记（`linear-gradient(140deg`、`gallery.nomatch`、`world.missing`），暖纸 token 已从本插件 bundle 消失。**面板视觉与交互仍需所有者实机确认**（见 [MANUAL_TEST.md](reference/MANUAL_TEST.md) §8）。

---

## 会话可读性与开场白修复（2026-09-17）

所有者实测发现两个严重问题，均已定位并修复：

| 现象 | 根因 | 处置 |
| :--- | :--- | :--- |
| 所有历史记录顶部红色 `历史加载失败 … event type 'rrp/card' … not marked ignorable` | 插件自造 `rrp/card` / `rrp/world-state` / `rrp/summary` / `rrp/activity` 事件类型；宿主的持久化读路径只认**构建期词表**，且 `Session.append` **无法设置 `ignorable`** | **彻底停用自造事件**：卡包/世界状态/编年改为寄存在普通 `user/message` 的 `source.rrp`（模型只读 `content`，`source` 不进请求）。新增 `src/state-payload.ts` + `src/state-publisher.ts`；投影改折叠 `user/message` |
| 点「开始这一局」后必须手动刷新才显示开场白 | 开场白与会话日志中的自造事件同批到达，被宿主的观察/校验拒绝；且客户端在 POST 之前就已 stage 会话 | ① 开场白改为**最后**追加；② 客户端改为 **POST 成功后再 `sessions.open()`**，一次拉全历史 |
| 活动账本（归因）不再进日志 | 它是玩家可见、模型不可见的簿记 | 迁到宿主内存 + `GET /dsh-rrp/activity` + 面板 2s 轮询 |
| 旧日志仍不可读 | 已有 `rrp/*` 事件缺 `ignorable` | `scripts/repair-legacy-sessions.mjs`（默认 dry-run，`--apply` 留 `*.pre-ignorable.bak`）；**多帧 zstd，第一帧必须恰好是 header 行**；RP 工作区 13 个日志已修复 |

**证据等级**：`typecheck` / `test`（69 用例）/ `build` 全绿；宿主以修复后的日志**重新启动成功**（启动即校验全部 header 帧）；全量解码校验：RP 工作区 16 个日志 `header-ok 16 / unknown-required 0`。浏览器端观感与「开盘即显」仍需所有者确认（[MANUAL_TEST.md](reference/MANUAL_TEST.md) §8）。

---

## 多卡技能作用域（2026-09-17）

**问题**：`mountCardSkills` 把**所有**卡的 `skills/*` 挂进同一个 `rp` preset 的技能根。DSH 的 skill 目录按 **agent preset 作用域**分层，于是任何一张卡都能检索到别的卡的世界知识——跨卡串味、甚至剧透。

**方案：每张卡一个派生 preset。**

- id 规则：基础 `rp`（无卡包设定）+ `rp-<card-id>`（只含该卡技能），见 `src/preset-id.ts`（依赖为零，宿主与浏览器共用）；
- card id 必须是规范小写 kebab-case，且目录名与 manifest id 完全一致；不再做会碰撞的有损归一化，并在读取入口拒绝非法路径；
- 物化：`materializePreset` 物化基础 preset + 每张卡一个；`mountSkillsForCard(dir, cardId)` 只拷当前卡的技能；
- 选择：卡片展厅开局时 `agentPresets.select(sessionId, presetIdForCard(card.id))`；
- 触发：纪事官/编年官按 **preset family** 匹配（`matchesPreset(id, 'rp')`），`rp-*` 同样受管；
- 清理：卸载时 `removeAllPresets` 删除整个 family（只删我们未改动的 marker 目录）。

**验证**：`tests/host-mount.spec.ts` 造两张合成卡 `alpha`/`beta`，断言 `rp-alpha` 只含 `alpha-lore`、`rp-beta` 只含 `beta-lore`、基础 `rp` 两者皆无；`tests/preset-id.spec.ts` 覆盖 id 规则。真机启动日志：`RP skills visible (0)` + `card preset 'rp-maid-heiress' skills (6)`。

**证据等级**：73 用例全绿、`typecheck`/`build` 通过、宿主实测启动日志与磁盘目录均确认隔离。

---

## 知识沉淀 D8（2026-09-17）

**目标**：剧情中确立的新设定 → **世界线专属**技能；受控、可审阅、渐进。

**实现**：

- `src/sediment-state.ts` + `src/projection/sediment.ts`：`snapshot/add/remove` 词汇、上限与 `rrpSediment` 纯折叠；
- `src/sediment-provider.ts`：只读所属 Session 的沉淀投影并适配为 agent scope Skill provider；
- `src/sediment-runtime.ts`：`agent/created`（仅 RP 家族 preset）时经 **`agent.ctx.get('skills').registerProvider`** 注册。普通会话互相隔离，fork 继承分叉点前缀，分叉后独立；旧 sidecar 只在投影为空时迁移为一次 `snapshot`，成功后备份为 `.legacy.bak`；
- `src/agents/scribe.ts`：Scribe 提示词 + 解析；只依据已发生事实起草一条，材料不足返回空草稿；
- `src/sediment-route.ts`：`GET/POST/DELETE /dsh-rrp/sediment`（list / draft / confirm / discard / manual / delete）+ `/lore` 命令；草稿只暂存宿主内存，**确认/删除才写 Session 事件**；
- 客户端新增右侧「典籍」tab：话题输入 + 起草、草稿预览 + 确认/丢弃、已沉淀列表 + 删除；归因进活动账本（actor `scribe`/`player`，target `sediment`）。

**历史证据**：文件版 D8 落地时 89 用例通过，事实审计基线为 91 用例。当前实现另有投影重放、兄弟分支隔离、旧数据迁移成功/失败与写入失败传播测试；真实宿主上的迁移与 fork UI 流仍需本轮人工验收。

**控制策略映射**：默认关闭 / 二次确认 / 只新增（含卡包自带重名拒绝）/ 可看可删 / 单次一条。

---

## 存档隔离与 Workspace 适配（2026-09-17）

- **卡**是静态内容身份：一个规范 `cardId` 对应一个 `rp-<cardId>` preset，卡间 Skills 不共享。
- **存档**是原生 Session：同一张卡每次「开始」都新建 Session，WorldState、Summary、Settings 与 Sediment 全部独立。
- **分支**是原生 `Session.fork`：继承切点前全部 RP 投影，之后各自追加，禁止自建槽位/目录复制/DAG。
- **Workspace**只复用宿主已有列表作为新存档归组参数。展厅在服务存在且有条目时显示紧凑选择器；宿主不提供该能力时无损退化为未分组会话。
- `/summary on|off` 已从进程全局变量迁为 `rrpSettings` 会话投影，因此同卡不同存档互不影响，fork 语义也自然正确。

---

## 阶段路线

| 阶段 | 主题 | 状态 |
| :--- | :--- | :--- |
| **0–5** | 骨架 → RP 模式 → 投影看板 → 纪事官 → Skills | ✅ 完成 |
| **5.5** | 闭环补完：Author 消费 + 玩家矫正（D6） | ✅ 完成 |
| **7** | Summarizer Agent（可选大局观，按轮触发） | ✅ 完成 |
| **8** | Session.fork 世界线 + `dsh-synapse` 协同 | ✅ Card / WorldState / Summary / Settings / Sediment 均纳入原生 fork 前缀重放 |
| **9** | 外部记忆扩展接入（EverOS 方向，纯扩展） | ✅ 完成 |
| 6 | 原生卡包格式重制 + 卡片展厅 | ✅ **完成**：格式/加载器/只读路由/首个测试卡/**展厅**/**开卡流**/**UI 精修（宿主原子库）**/**卡包设定注入**/**技能挂载**/**P3 沉浸视图**均已落地；P0 暖纸主题已撤回、P1（shadow 正文节点）评估后不做 |

---

## 阶段 9 交付物（已完成）

- `src/contracts.ts` + `dsh-rrp/contracts` 子路径：对外**稳定只读契约**（投影键 `rrpWorldState`/`rrpSummary`、事件名、WorldState/MacroSummary 类型、渲染函数），依赖为零，host 与 client 均可导入
- `docs/reference/MEMORY.md`：D12 边界、可用宿主接缝（`ctx.sessionQuery` 官方检索 / Skills / `agent/pre-step` / 工具注册）、EverOS 方向接入建议、五条反模式
- 实证：`ctx.sessionQuery`（`dsh-session-query` + sqlite backend）是官方检索接缝；`dsh-recall-plugin` 实为「消息撤回」而非记忆，避免误判
- **零核心记忆基建**：不内建向量库/嵌入/索引引擎（守 D12 与「个人玩具」红线）
- 测试 33 用例（含契约导出的键/事件/渲染）

---

## 已完成（阶段 6 交付回顾）

**阶段 6：卡片展厅 + 开卡新会话流 + UI 精修。** 已落地（[CARDS.md](reference/CARDS.md) §9–12，[UI_CEILING.md](reference/UI_CEILING.md)）：

- ✅ 目录格式 + `src/cards.ts` 加载器 + `GET /dsh-rrp/cards`、`/cards/one` 只读路由 + `tests/cards.spec.ts`
- ✅ 首个原生测试卡 `cards/maid-heiress`（由酒馆卡 `女仆大小姐.json` 单向转译，见 CARDS.md §11）
- ✅ **卡片展厅** `src/client/gallery-panel.tsx`：`main` 主区面板 + 同名 `sidebar.panellist` 导航图标
- ✅ **开卡新会话流**：`ctx.sessions.create` → `ctx.remote.agentPresets.select(id, presetIdForCard(card.id))` → `POST /dsh-rrp/start`（发布初始状态 + 最后追加开场白）→ `sessions.open` + `tests/start.spec.ts`
- ⏸️ **P0 暖纸主题（已撤回）**：曾以 `ctx.theme.overrideTokens` 实现暖纸 + 衬线 + 大行高；所有者实测后否决观感，恢复 **DSH 原版亮暗**（`src/client/theme.ts` 已删除，能力记录见 [UI_CEILING.md](reference/UI_CEILING.md)）
- ✅ **UI 精修（宿主原子库）**：卡片展厅与「世界状态」侧栏改用平台模块 `@deepseek-ai/dsh-client-ui-primitives`（Button / Pill / Input / StateDot / Tooltip / Icon*）——搜索框、卡面封面、技能卡、开场白引用块、底部主操作条；面板**自动跟随明暗主题**（[HOST_SEAMS.md](reference/HOST_SEAMS.md) §A4）
- ✅ **卡包设定注入**：`rrpCard` 投影（`src/projection/card.ts`）+ Author 每步基线按「卡包设定 → 实时状态 → 大局编年」注入（状态寄存在 `user/message` 的 `source.rrp`）
- ✅ **卡包技能挂载（按卡隔离）**：`mountSkillsForCard` 只把当前卡的技能挂进**该卡专属 preset** `rp-<card-id>`；基础 `rp` 无卡包设定——实测 `RP skills visible (0)` + `card preset 'rp-maid-heiress' skills (6)`
- ✅ **实机确认**：开场白以 `assistant/message` 追加被宿主原生接受、渲染为正文第一条（被拒会自动回退为 plugin notice）
- ✅ **实机确认**：卡包 persona 注入**零剧透**（秘密只通过行为细节体现）
- ✅ **P3 沉浸视图** `src/client/story-view.tsx`：新增「沉浸」Tab，订阅宿主 `chat` 快照，按小说排版重排正文（**纯增量**，不替换宿主渲染）
- ⏸️ **P1 正文节点 shadow**：**主动不做**——属"替换宿主渲染"，做错会让聊天直接不显示；沉浸视图（P3，纯增量）已覆盖小说排版需求，边际收益低而风险高（见 UI_CEILING.md）

## 阶段 6 首个交付：原生测试卡（2026-09-16）

所有者提供酒馆卡 `女仆大小姐.json`（V2，`description/personality/scenario` 为空，信息全在世界书 10 条词条）。
按 D14 做**单向转译**：`first_mes` → `openings/default.md`；世界书条目 → 6 个 `skills/*/SKILL.md`；
新增 `state.json` 初始 WorldState；丢弃 `extensions`（`regex_scripts`/`tavern_helper` 等）。

---

## 验收标准

- 已验证：历史真实 `dsh web` 加载、RP 环路、纪事官、Skills 与编年官；自动回归覆盖五个 RP 投影的 fork 重放、卡 id 隔离、preset 后选时序、旧 D8 迁移、可选 Workspace 与写入失败传播。本轮 `pnpm test` 为 21 文件 / 117 用例，`typecheck` / `build` / `diff --check` 均通过
- 尚未达成：D5 动态结构、零自写轮询、正式 YAML 解析、生命周期清理与本轮真实宿主 UI/迁移验收；见 [`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) §2.1
- 每阶段：代码保持轻量透明，无并发/分布式/多用户复杂度

---

## 下一步候选

| 优先级 | 事项 | 说明 |
| :--- | :--- | :--- |
| 高 | **D5 规格收敛** | 实现受控扩展结构，或由所有者明确收窄 D5；不得继续保持文档与 schema 冲突 |
| 高 | **矫正时序** | 按 D6 自然顺序封住推演中保存窗口，不引入 CAS |
| 中 | **宿主边界收敛** | 去掉两条轮询、替换 YAML 子集解析、补生命周期清理 |
| 中 | **第二张官方测试卡** | 架构收敛后再补；目前只有 `maid-heiress` |
| 低 | **P4 输入区接管** | 架构收敛后再扩展 `conversation.composer` |
| 低 | 沉淀草稿在线编辑 | 面板加可编辑字段（草稿已在内存） |
| 低 | 多语言与文案打磨 | locale 字典已分 ZH/EN |

---

## 阻塞与风险

- **人工验证项**：真实模型推演、Author 消费、面板渲染、长线游玩——必须人工/浏览器 Agent 实测；单测用结构化替身，覆盖不到 Cordis 代理与生命周期行为（见 [HANDOFF.md](HANDOFF.md) §5）。
- **旧会话兼容**：2026-09-17 之前的会话其 `rrp/*` 事件已按 `ignorable` 忽略，**世界状态面板为空**（正文与历史可读）。
- **活动账本**：当前只存宿主内存并由客户端 2s 轮询；这是现状，不再视为最终设计。
- **D8 迁移**：旧 sidecar 自动迁移已有单测；真实旧局迁移后 provider 可见性与 `.legacy.bak` 仍需在 `rp-dev` 人工确认。
- **D6 时序**：规范要求“纪事官更新 → 玩家查看并矫正 → 下一轮”；当前 UI 在纪事官运行期间仍允许保存，属于可达但未封口的顺序窗口。
