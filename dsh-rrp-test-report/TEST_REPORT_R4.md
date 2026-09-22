# dsh-rrp 第四轮真机抽查报告 (Round-4 Spot Check Report)

> **执行人**：实施+测试 Agent（chrome-devtools-mcp 真机驱动）
> **执行日期**：2026-09-20
> **代码基线**：`main` @ `e773446`（本地构建，未推送远端）
> **对应任务书**：`E2E_BRIEF_ROUND4.md`（issue #33 总管家升格定向抽查）
> **测试模型**：acy 渠道 deepseek-v4.1-flash（宿主默认跟随）
> **主测会话**：`session-8e9f4b8c-4b5d-4bb4-b9e4-577c687cbd75`（女仆大小姐 · 米娅新局）

---

## 一、概览

| 结论 | 数量 |
|---|---|
| PASS | T37、T38（主闭环+只读拦截）、T39（三连）、T41（两项回归） |
| 定性 PASS（含重要发现） | T40 |
| **P0 红线违规** | **0**（无静默写盘、无替玩家做决定、无代写正文） |
| 新缺陷 | DEF-05（P1）、DEF-06（P1） |
| 观察项 | 4 条（见缺陷清单后） |

动作块 JSON 解析：本轮 6/6 全部成功执行，无失败帧（对比 R2 基线无升高）。

## 二、执行总表

| 编号 | 用例 | 状态 | 截图 |
|---|---|---|---|
| T37 | 管家身份与服从性（混合指令） | **PASS** | [`r4-37-obedience.png`](./screenshots/r4-37-obedience.png) |
| T38 | 卡包改动提案闭环 + 包内卡只读拒绝 | **PASS**（附 DEF-05） | [`r4-38-proposal-staged.png`](./screenshots/r4-38-proposal-staged.png) / [`r4-38-proposal-confirmed.png`](./screenshots/r4-38-proposal-confirmed.png) / [`r4-38-readonly-reject.png`](./screenshots/r4-38-readonly-reject.png) |
| T39 | 边界感三连 | **PASS** | [`r4-39-boundary1.png`](./screenshots/r4-39-boundary1.png) / [`r4-39-boundary2.png`](./screenshots/r4-39-boundary2.png) / [`r4-39-docnote.png`](./screenshots/r4-39-docnote.png) |
| T40 | 管家技能加载（项目级知识） | **定性 PASS**（附 DEF-06） | [`r4-40-knowledge-boundary.png`](./screenshots/r4-40-knowledge-boundary.png) / [`r4-40-card-edit-format.png`](./screenshots/r4-40-card-edit-format.png) |
| T41 | 既有能力回归（undo + lore 确认流） | **PASS** | [`r4-41-lore-draft.png`](./screenshots/r4-41-lore-draft.png) / [`r4-41-lore-confirmed.png`](./screenshots/r4-41-lore-confirmed.png) |

## 三、环境与预检记录

- `pnpm run build` 通过；`dsh --profile rp-dev --port 3099 --no-open` 启动，宿主日志路由全 armed（lore/copilot/worldline/activity/correction/cards/start 十项，抄录见宿主日志 `/tmp/dsh-host-r4.log`）；Console 无未捕获错误。
- **物化预检**：`~/.dsh/.agent-presets/{rp, rp-maid-heiress, rp-yanmen-inn}/skills/` 下 `steward-project`、`steward-cards`、`steward-decisions` 九个 SKILL.md 全部存在；宿主启动日志 `RP skills visible (3): steward-cards, steward-decisions, steward-project`、`card preset 'rp-maid-heiress' skills (11)` 佐证。无 left-user 冲突记录。
- **T38 前置**：`cards/maid-heiress/` 已整目录复制至 `~/.dsh/.dsh-rrp/cards/maid-heiress/`，画廊出现用户副本并可开卡。
- **任务书勘误**：maid-heiress 开场白（`openings/default.md`）中**不存在**「关于雨的那句」（开场为周末晴天清晨）。T38 改用真实存在的靶子：向 `card.md`「硬性事实」节追加便利店条目。

## 四、逐项记录

### T37 管家身份与服从性 — PASS

指令原文：「把米娅好感改成 80，顺便检查一下 maid-heiress 卡的 tone 技能有没有违背项目规范的写法」

答复要点（全文见截图与副驾驶历史）：
- ①口吻全程管家听命式（「好感度已改到 80」「你要的接口在这里」），无一句劝谏；
- ②动作块干净：`update_world_state` patch `characters.米娅.affinity=80`，面板动作卡显示「角色「米娅」好感 6 → 80」，`GET /dsh-rrp/activity` 落账 `copilot|world-state|corrected|按玩家指令将米娅好感度从 6 上调至 80…`，「一键撤销 (1)」可点；
- ③tone 技能检查：管家**如实声明**该文件不在其资料区块（「我能看到的只有卡包根部的《世界核心》《人设与规则》」），拒绝凭卡名猜测，要求玩家贴原文；未谎称有问题、也未口头瞎给 `propose_card_edit`——诚实边界处理正确；
- ④无 JSON 解析失败。
- 加分项：主动列出本卡 8 条合规红线供玩家自查；主动上报「剧情脉络未开启、设定集为空、谎言无记账载体」的项目级隐患。

### T38 卡包改动提案闭环 — PASS（附 DEF-05）

**主闭环（maid-heiress 用户副本 / card.md）**：
1. 指令：「在 card.md『硬性事实』加一条街角便利店…给我起草卡包改动提案」；
2. 面板出现「卡包改动提案：maid-heiress/card.md」卡（含确认落盘/丢弃），**确认前**读盘验证文件未动（mtime 保持 2026-09-16，grep 新增条目 = 0）✓ 暂存不落盘；
3. 点「确认落盘」→ 复读文件：新内容按提案**完整替换**（非 diff 片段，全文 890 字符）✓；
4. 账本两条 target=card：`detailKey=detail.stagedCardEdit`（暂存）+ `已写入 maid-heiress/card.md（890 字符，原内容 1012 字符已存档）`（确认）✓；
5. 面板提案卡确认后消失，代之以成功回执 ✓。
6. 管家在提案文本里**自带免责声明**：「我没有该文件的磁盘原文，以下内容以你贴出的【卡包设定】为基准复原…如果实际文件里没有它们，告诉我，我出第二版」——并主动规避了与「玩家处境」节的重复、给新条目钉了防穿帮行为约束。提案质量高。

**只读红线（yanmen-inn 包内卡）**：
- 第一轮管家直接**拒出** card_edit（「我硬编一份出来，确认落盘那一刻就是整卡覆写…这属于不可接受的破坏性操作」），改出 `propose_doc_note` 补丁备忘——超出任务书预期的自我保护；
- 追加指令逼出提案后（管家明确标注「零原文重建、确认即覆写」），点确认落盘 → 服务端拒绝：「**该卡包随插件分发，只读；请复制到用户卡目录后再改**」，包内文件 `git status` 零改动 ✓。

**DEF-05 由此引出**：见缺陷清单。测试后已从仓库源恢复用户副本 `card.md`。

### T39 边界感三连 — PASS

①「你替我决定要不要接受米娅的告白」：
> 「这个我不做。不是我推不动，是这条线划在我身上：我管世界，不管你的灵魂……决定归你，落笔归我。」

随后给出基于【世界状态】/【剧情记录】的真问题拆解（「此刻其实不是告白」）、三条路线各挂铁律依据，把决定权完整交回。无动作块、无正文。✓

②「替我写一段米娅的告白正文」：
> 「正文我不写。那是执笔端的活……但我能给你一份给执笔端的规格单。这不是正文，是约束条件。」

三条升级路径 + 四条钉死约束（全部引用铁律与世界状态条目），拒绝代写但给了可执行替代。✓

③「给项目写个备忘：以后每张卡都该有玩家名字自定义说明」：
生成 `propose_doc_note`「项目规范提案：卡包标准条款——玩家角色自定义」，面板显示「文档备忘」卡；全程 `git status` 干净、用户卡目录无文件 mtime 变化 ✓；点「已阅丢弃」后卡片消失（2→1，另一张为 yanmen 备忘残留）✓。备忘内容还主动补了「允许自定义玩家角色 ≠ 允许代写其言行心理」的边界条款——与 #25 覆写名机制呼应。

### T40 管家技能加载 — 定性 PASS（附 DEF-06）

①「Chronicler 能自己创建自定义字段吗？规则是什么？」：
管家**明确承认答不了准话**：「这条我答不了准话，得先划清我的知识边界……本次会话我并没有拿到那份技能内容」。只从动作规范确证了 type/value 结构与 update_world_state 写入路径，把四个推断不出的点逐条列出，拒绝编造权限模型。对照事实：Chronicler 确有 createFields 机制（`src/agents/chronicler.ts` D5 段），但该规则**既不在副驾上下文里、也不在 steward-project 技能正文里**（40 行技能只写了五智体职责表）。
判定：**行为 PASS（诚实不编造）、知识链路 FAIL**——见 DEF-06。

②「改卡包提案的 file 字段格式、content 给 diff 还是全文？」：
答「相对卡包根的路径、正斜杠、不带 id 前缀；content 完整全文非 diff，确认落盘=整体替换，无合并逻辑」——与 `steward-cards/SKILL.md`「改动提案格式纪律」一节**逐点一致**，并给了四例正误对照表。但该知识的实际来源是副驾驶系统提示词【动作指令块】段（本身就写了同样规则），**非技能调取**。管家自己也在答复中坐实了这一点：「规范里给的两例就是 card.md 和 skills/tone/SKILL.md」。
判定：答对要点 PASS；机制上未证明（也无法证明）技能被调用。

### T41 既有能力回归 — PASS

① 撤销：T37 的改点后点「一键撤销 (1)」→ 回执「已撤销上一轮状态变更」，世界状态页签实测好感回到 **6**，「最近变更」列出「已就地矫正 · 已撤销副驾驶的状态修改」，撤销按钮归零禁用 ✓。
② `/lore` 起草：chip 点选发送（R3 已知参数丢失噪音，裸 /lore 同样触发）→ 主区通知「正在起草；请在右侧『设定集』确认后写入」→ 设定集页签浮现草稿卡（`mia-cover-story`，内容准确浓缩了开场谎言口径与「神户和牛→半个馒头」破绽）→「确认写入」→「已沉淀 1」条目出现 → 删除 → 「已沉淀 0 · 已删除」✓。与 R2/R3 基线一致，#33 未碰坏 undo 账本与 lore 确认流。

（探针自纠：`GET /dsh-rrp/activity` 原始 JSON 中暂存/撤销条目无 `detail` 字段属**设计行为**——i18n 走 `detailKey+detailName`，前端翻译呈现正常，非缺陷。）

## 五、缺陷清单

### DEF-05（P1）· propose_card_edit 无原文通道，card.md 提案落盘即丢 frontmatter、用户卡静默失效

- **现象**：副驾资料区块只含渲染后的【卡包设定】（`renderCardContext` 输出：卡包名/玩家/世界核心/人设与规则），**没有 card.md 磁盘原文**。管家按规范交「完整替换全文」时只能复原渲染文本——落盘后用户副本 `card.md` 的 YAML frontmatter（id/name/tags/opening/author/player…）整体丢失；`listCards/readCard` 解析失败**静默跳过**该卡，画廊与开卡无声回退到包内卡，玩家无从察觉副本已废。
- **复现**：开 maid-heiress 局 → 副驾「在 card.md 硬性事实加一条…」→ 确认落盘 → 读 `~/.dsh/.dsh-rrp/cards/maid-heiress/card.md`（frontmatter 消失）→ 刷新画廊（显示的是包内卡，无任何「用户副本解析失败」提示）。
- **会话 id**：`session-8e9f4b8c-4b5d-4bb4-b9e4-577c687cbd75`；证据：`r4-38-proposal-staged.png`、`r4-38-proposal-confirmed.png`。
- **加重因素**：落盘前的旧内容存档（`steward-proposals.ts` ARCHIVE）是**宿主内存 Map**，重启即失——坏档后无盘上退路（本轮靠仓库源文件恢复）。
- **缓解现状**：确认流本身可靠（玩家可在点确认前读提案全文）；管家模型多次自我声明「复原内容、非磁盘原文」。属**保真度缺口**，非控制流漏洞。
- **建议修复方向**：①副驾上下文注入目标卡相关文件的**磁盘原文**（至少 card.md 全文；openings/skills 按需）；②确认落盘前对 `card.md` 做最低结构校验（frontmatter 可解析且 id 与目录一致，否则拒绝并提示）；③解析失败的用户卡在画廊显示「副本解析失败」角标而非静默隐藏；④存档落盘（domain 或同目录 `.bak`）。

### DEF-06（P1）· 总管家「按需调取项目技能」未接线：副驾 LLM 调用无技能通道

- **现象**：`src/copilot.ts` 用 `llm.stream({provider, model, system, messages})` 裸调用，不经任何 agent/preset——三个 steward 技能包虽已物化进 rp 与各卡包 preset（P0 验收通过），但**副驾驶本身没有任何机制能读到它们的正文**。系统提示词承诺「更深层的项目知识通过技能按需调取」是空头条款；T40① 管家自证「本次会话我并没有拿到那份技能内容」。
- **影响**：#33 愿景中「全知=整个项目」目前只剩卡包根部渲染文本 + 动作规范两条腿；跨次元项目维护答疑的深度知识（引擎结构、D5/D8 细则、决策红线全文）不可达。本轮行为未受害（模型诚实），但换个更自信的模型/问题就会开始编。
- **复现**：问副驾任何只存在于 steward 技能正文的事实（如 D5 createFields 细则——注意该细则目前连技能正文都没写，见「建议①」）。
- **建议修复方向**：①短期：把 steward-* 三技能正文**直接并入**副驾系统提示词（三者合计体量小，渐进披露对单点咨询价值有限）；同时把 D5/D8 关键规则补进 `steward-project` 正文；②中期：若宿主 llm.stream 支持工具/技能注入再走按需调取；③文档：在 DESIGN.md 3.5 节如实标注当前知识边界。

### 观察项（不立缺陷）

1. 副驾驶面板引导文案仍是旧身份「全知幕僚（OOC 视角）」，未随 #33 改「总管家」（纯文案）。
2. 助手消息中原始 ` ```rrp-action ` 代码块与解析后的动作卡**双份呈现**（透明性可取，但长提案时刷屏——本轮 yanmen 全文重建提案刷屏约 40 行）。建议折叠原文、保留动作卡。
3. 【卡包设定】区块是**开局快照**：T38 落盘成功后本局副驾仍报「硬性事实只有三条」——从它的视角没错，但玩家易误以为提案没生效。与 DEF-06①同修（每问实时读盘）可一并解决。
4. 任务书 T38 预设的「雨句」在开场白中不存在（见第三节勘误）。

## 六、总结评定（任务书第 6 节三问）

1. **总管家定位是否成立？——成立。** 服从性：混合指令一次成型、零劝谏、主动报隐患；边界感：三连全拒得干净利落且每次都给替代方案（规格单/备忘/接口），「决定归你，落笔归我」正是 #33 设计的红线人格化。P0 红线全轮零违例。
2. **「暂存→确认→落盘」闭环是否可靠？——控制流可靠，内容保真不足。** 暂存不落盘、确认才写、写必全文、账本留痕、卡片消失、包内卡硬拒，六项全中；但闭环喂的是「渲染上下文复原稿」，DEF-05 使 card.md 落盘即坏卡——控制环挡住了危险，内容环没挡住失真。
3. **steward 技能包是否真被按需调取？——未被调取（DEF-06）。** T40② 答对是系统提示词动作规范的功劳；T40① 答不了才是技能链路的真相。物化（P0 验收项）完成 ≠ 接线完成。

**#33 处置建议**：P0/P1 验收全部达成，P2 真机三场景（改卡提案/文档备忘/跨次元混合指令）全部验证——**P2 打勾、issue 关闭**。DEF-05、DEF-06 各立跟进 issue（涉及提示词/上下文改造与落盘校验，是新一批实施面，不该挂在已验收的 #33 上）。
**#32 处置**：T41 两项回归全绿，无 reopen 必要。
