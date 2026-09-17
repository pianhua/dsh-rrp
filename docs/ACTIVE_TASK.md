# 当前任务（ACTIVE_TASK.md）

> 更新时间：2026-09-16  
> 规格基线：[`DESIGN.md`](DESIGN.md) · 宿主映射：[`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) · 开发流程：[`DEVELOPMENT.md`](DEVELOPMENT.md)

---

## 任务状态

- **阶段**：阶段 9 — 外部记忆扩展接入（已完成）
- **状态**：阶段 0–5、5.5、7、8、9 已完成；**阶段 6 进行中**——所有者以真实酒馆卡触发转译，目录格式已定，加载器与首个测试卡已落地
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
- 物化：`materializePreset` 物化基础 preset + 每张卡一个；`mountSkillsForCard(dir, cardId)` 只拷当前卡的技能；
- 选择：卡片展厅开局时 `agentPresets.select(sessionId, presetIdForCard(card.id))`；
- 触发：纪事官/编年官按 **preset family** 匹配（`matchesPreset(id, 'rp')`），`rp-*` 同样受管；
- 清理：卸载时 `removeAllPresets` 删除整个 family（只删我们未改动的 marker 目录）。

**验证**：`tests/host-mount.spec.ts` 造两张合成卡 `alpha`/`beta`，断言 `rp-alpha` 只含 `alpha-lore`、`rp-beta` 只含 `beta-lore`、基础 `rp` 两者皆无；`tests/preset-id.spec.ts` 覆盖 id 规则。真机启动日志：`RP skills visible (0)` + `card preset 'rp-maid-heiress' skills (6)`。

**证据等级**：73 用例全绿、`typecheck`/`build` 通过、宿主实测启动日志与磁盘目录均确认隔离。

---

## 阶段路线

| 阶段 | 主题 | 状态 |
| :--- | :--- | :--- |
| **0–5** | 骨架 → RP 模式 → 投影看板 → 纪事官 → Skills | ✅ 完成 |
| **5.5** | 闭环补完：Author 消费 + 玩家矫正（D6） | ✅ 完成 |
| **7** | Summarizer Agent（可选大局观，按轮触发） | ✅ 完成 |
| **8** | Session.fork 世界线 + `dsh-synapse` 协同 | ✅ 完成 |
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

## 下一动作

**阶段 6：卡片展厅 + 开卡新会话流 + UI 精修。** 已落地（[CARDS.md](reference/CARDS.md) §9–12，[UI_CEILING.md](reference/UI_CEILING.md)）：

- ✅ 目录格式 + `src/cards.ts` 加载器 + `GET /dsh-rrp/cards`、`/cards/one` 只读路由 + `tests/cards.spec.ts`
- ✅ 首个原生测试卡 `cards/maid-heiress`（由酒馆卡 `女仆大小姐.json` 单向转译，见 CARDS.md §11）
- ✅ **卡片展厅** `src/client/gallery-panel.tsx`：`main` 主区面板 + 同名 `sidebar.panellist` 导航图标
- ✅ **开卡新会话流**：`ctx.sessions.create` → `ctx.remote.agentPresets.select(id, presetIdForCard(card.id))` → `POST /dsh-rrp/start`（发布初始状态 + 最后追加开场白）→ `sessions.open` + `tests/start.spec.ts`
- ⏸️ **P0 暖纸主题（已撤回）**：曾以 `ctx.theme.overrideTokens` 实现暖纸 + 衬线 + 大行高；所有者实测后否决观感，恢复 **DSH 原版亮暗**（`src/client/theme.ts` 已删除，能力记录见 [UI_CEILING.md](reference/UI_CEILING.md)）
- ✅ **UI 精修（宿主原子库）**：卡片展厅与「世界状态」侧栏改用平台模块 `@deepseek-ai/dsh-client-ui-primitives`（Button / Pill / Input / StateDot / Tooltip / Icon*）——搜索框、卡面封面、技能卡、开场白引用块、底部主操作条；面板**自动跟随明暗主题**（[HOST_SEAMS.md](reference/HOST_SEAMS.md) §A4）
- ✅ **卡包设定注入**：`rrpCard` 投影（`src/projection/card.ts`）+ Author 每步基线按「卡包设定 → 实时状态 → 大局编年」注入（状态寄存在 `user/message` 的 `source.rrp`）
- ✅ **卡包技能挂载（按卡隔离）**：`mountSkillsForCard` 只把当前卡的技能挂进**该卡专属 preset** `rp-<card-id>`；基础 `rp` 无卡包设定——实测 `RP skills visible (0)` + `card preset 'rp-maid-heiress' skills (6)`
- ⬜ **实机确认（关键）**：开场白以 `assistant/message` 追加是否被宿主接受并渲染为正文；被拒会自动回退为 plugin notice（`user/message`）
- ⬜ **实机确认**：卡包 persona 走 `agent/pre-step` 注入是否会以 context 节点剧透（CARDS.md §11）
- ✅ **P3 沉浸视图** `src/client/story-view.tsx`：新增「沉浸」Tab，订阅宿主 `chat` 快照，按小说排版重排正文（**纯增量**，不替换宿主渲染）
- ⏸️ **P1 正文节点 shadow**：**主动不做**——属"替换宿主渲染"，做错会让聊天直接不显示；沉浸视图（P3，纯增量）已覆盖小说排版需求，边际收益低而风险高（见 UI_CEILING.md）

## 阶段 6 首个交付：原生测试卡（2026-09-16）

所有者提供酒馆卡 `女仆大小姐.json`（V2，`description/personality/scenario` 为空，信息全在世界书 10 条词条）。
按 D14 做**单向转译**：`first_mes` → `openings/default.md`；世界书条目 → 6 个 `skills/*/SKILL.md`；
新增 `state.json` 初始 WorldState；丢弃 `extensions`（`regex_scripts`/`tavern_helper` 等）。

---

## 验收标准

- 阶段 1–5、5.5、7、8、9（已达成）：真实 `dsh web` 加载、RP 环路、纪事官、Skills、编年官、fork 重放、外部契约，均无报错；`pnpm run typecheck` / `build` / `test`（66 用例）全绿
- 全程：不触犯 [`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) 第 4 节任一红线
- 每阶段：代码保持轻量透明，无并发/分布式/多用户复杂度

---

## 阻塞与风险

- **阶段 6**：格式已由所有者真实酒馆卡触发落地（D13「形态成熟后再定」已满足）；剩余为 P1/P3 观感深化
- **人工验证项**：纪事官/编年官真实模型推演、Author 真实消费、面板渲染、真实 fork 游玩——均需人工 UI 确认（本机无浏览器自动化、未自动烧 token）
- **/summary 开关持久性**：进程内状态；如需持久化可挂 `ctx.settings`
- **面板形态**：已为结构化就地编辑器 + 活动账本归因；细粒度「就地点击修改数值」待打磨
- **开场白注入**：宿主没有「建时带首条消息」的 API，当前以 `assistant/message` 追加；需实机确认宿主是否接受并渲染（被拒自动回退为 plugin notice）
