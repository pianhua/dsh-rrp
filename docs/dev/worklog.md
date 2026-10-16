# WORKLOG — 工作日志（当月进行中，最新在上）

> **只记当月进行中的条目。** 上月及更早的完整记录按月切到 [`worklog/`](./worklog/)，
> 翻历史去那里或走 git，不要往本文件堆跨月内容。
>
> 附录：[`2026-09`](./worklog/2026-09.md) — WorldState v2、架构重构、世界线 v2、舞台 v2、展厅 v2、宿主 0.2.0 适配

## 2026-10-16 · 工程纪律重整 P3：机器门禁 + 收尾

前三阶段立的规矩全靠人自觉。这次把它们写成脚本，接进 CI——**这是唯一能让纪律不被时间冲掉的一步**。

- **新增 [`scripts/check-repo-hygiene.mjs`](../../scripts/check-repo-hygiene.mjs)**，六项检查，每项都对应一条已经付出过代价的真实教训，不是预防性设计：
  1. **根目录白名单**——`dsh-rrp-test-report/` 曾在根目录堆到 81 个文件；
  2. **`docs/` 一级目录白名单**——防止 `docs/qgraphflow/` 这类外部工具产物重新长进来；
  3. **文档体积上限**——`worklog.md` 曾长到 74KB 单文件，`AGENTS.md` 曾 13KB（现限 24/8KB，ADR 单篇限 16KB；勘察证据与卡包规范豁免）；
  4. **ADR 结构完整性**——编号从 0001 连续不留空号，每篇必须有 `> 状态：`；
  5. **站点页面与导航一致**——不在 `srcExclude` 也不在 sidebar 的文档会被构建成无人可达的 orphan page；
  6. **本地相对链接有效**——文档迁移后最容易留下死链。
- **接入 `package.json` 的 `check:hygiene`，并在 `quality.yml` 中排在 install 之前**（纯 node + fs，不依赖 `node_modules`，便宜且早失败）。
- **门禁第一次运行就抓到 3 个真问题，其中一个是 P1 自己引入的**：
  - `docs/dev/worklog/2026-09.md` 指向 `../agents/human-agent-contract.md` 的链接失效——文件切到 `worklog/` 子目录后深度变了，链接没跟着调。`docs:build` 查不出来，因为 worklog 被 `srcExclude` 排除，VitePress 不校验被排除文件的链接。
  - `docs/reference/TAVERN_V2_COMPARISON.md` 13 处跨仓库链接全部少一级（该文件在 `docs/reference/`，`../../` 只回到仓库根，指向的是 `D:/projects/dsh-rrp/dsh-tavern-v2/`）；文首还写死了本机绝对路径 `D:/projects/dsh-tavern-v2`，违反 `docs/reference/README.md` 与 `HOST_SEAMS.md` 共有的约定。已改为 `README.md:53-68` 形式的纯文本证据引用，保留可追溯性，去掉在别人机器上永远点不开的假链接。
  - `docs/index.md` 是站点首页，本来就不该出现在 sidebar——已作为首页特例豁免。
- **门禁本身验证过**：真实仓库通过；故意造一个 `gallery-v2_ACCEPTANCE_R2.md` 验证能被拦住（验收报告命名违规，exit=1），确认后已清理。
- **`docs/qgraphflow/`（872KB）已删除**：零引用的 QGraphFlow 架构图，`sourceRef` 标 `dsh-rrp@c392d07` 且自称已漂移。取回：`git show 489d2a3:docs/qgraphflow/overview-collection/index.html > 本地路径`。

## 2026-10-16 · 工程纪律重整 P1：领域词典 + 协作准则瘦身

P1 主体：`src/` 与 `tests/` 仍零改动，动的全是文档与文档位置。

- **新建根 [`CONTEXT.md`](../../CONTEXT.md)（9.6KB / 31 词条 / 5 组）**：领域词典，每条只回答「是什么」+「**边界在哪**」，对齐 dsh-tavern 的 CONTEXT.md 写法。补上了原术语表里两个**最核心却查不到**的概念——**Projection（投影）**与 **Source 寄生面**（`architecture.md` 全篇在用，`GLOSSARY.md` 里没有），并把散落在 `DESIGN.md`/`architecture.md`/`HOST_ALIGNMENT.md` 的零散定义收进一处。
- **`AGENTS.md` 13,469 → 3,306 字节（-75%）**：删掉第 41–114 行那份 74 行手写目录树（逐个列出源文件名，必然腐化）与协议细节复述；保留铁律、拒绝过度工程的定位、提交纪律、质量门命令、真机验收新规，领域与流程细节改为指向真源的导航表。
- **worklog 切分 74.4KB → 主文件 15.1KB + [`worklog/2026-09.md`](./worklog/2026-09.md) 59.9KB**：按月切。切分同时修掉一个结构性错误——第 491 行那个 `## 2026-09-21` 章节里塞了 9/21→9/29 的追加式 `###` 小节，与文件声明的「最新在上」相反；9 月内容已整体移入归档文件，主文件恢复单一顺序。
- **新规（已写入 worklog 文件头）**：主日志只记当月进行中的条目，跨月内容按月切到 `worklog/`，不再往单文件堆。

### 盘点发现（未处理，待决）

- **`docs/qgraphflow/overview-collection/` 872KB 已于同日 P3 删除**：QGraphFlow 生成的架构全景图（`graph.json` + viewer `index.html`），除本文件的两条记录外**零引用**，`sourceRef` 标 `dsh-rrp@c392d07`，自带声明「docs/ 存在漂移，仅作参考」。按 P0 新规属过程产物。取回：`git show 489d2a3:docs/qgraphflow/overview-collection/index.html > 本地路径`。
- **`docs/TAVERN_V2_COMPARISON.md` 13 处跨仓库链接改为纯文本证据引用**：原文写 `../../dsh-tavern-v2/README.md#L53-L68`，但该文件在 `docs/reference/`，`../../` 只回到仓库根，实际指向 `D:/projects/dsh-rrp/dsh-tavern-v2/`——**路径少了一级**，13 处全是死链；且文首「D:/projects/dsh-tavern-v2」写入本机绝对路径，违反 `docs/reference/README.md` 与 `HOST_SEAMS.md` 共有的「本机绝对路径不写入共享文档」约定。改为 `README.md:53-68` 形式的纯文本标注，保留证据可追溯性，去掉在别人机器上永远点不开的假链接。
- **`docs/dev/host-seams.md`（2.5KB）与 `docs/reference/HOST_SEAMS.md`（49KB）不是重复**：前者是三条铁律的对外摘要，后者是 61 个 slot 的实测勘察证据，`dev/` 那份开头已声明分工。核对后不动。
- **VitePress 逃逸口**：`srcExclude` 只排了 5 项，导致 `worklog.md`（原 74KB）、`workflow.md`、`agents/` 4 个文件被当作 orphan page 无谓构建，且都不在 sidebar 里。已在本轮补全 `srcExclude`。

## 2026-10-16 · 工程纪律重整 P2：DECISIONS.md 拆有序 ADR

`docs/reference/DECISIONS.md` 47.8KB / 26 条决策 → `docs/adr/` 27 篇 + 索引。`src/` 与 `tests/` 仍零改动。

- **拆分结果**：26 篇 ADR 每篇独立成文，统一体例为「标题 + 状态栏 + 决定正文 + 被否决方案」，对齐 dsh-tavern。内容逐字迁出，**D1–D26 原编号全部保留不变**——ADR 文件名即编号，因此 `src/`（`chronicler.ts` 4 处、`worldline-digest.ts` 3 处等）与 `tests/` 注释里的 `D6`/`D21` 等引用零改动继续有效。
- **每篇标注状态**：接受 / 暂缓 / 部分取代 / 已实现。0010（D10 与 dsh-synapse 协同）是唯一的「部分取代」——地图职责已由世界线页签接管，补了 dsh-tavern 式的取代说明与「被否决方案」小节，把「暂不自建 ≠ 永不自建」这条教训写在了原处。0023/0024/0025/0026 标注已实现并注明交付证据。
- **新增 [ADR 0027](../../CONTEXT.md)（`0027-docs-sources-context-and-adr.md`）**：显式记录 2026-09-21 那条「不创建平行 `CONTEXT.md` / `docs/adr/`」的编排约定被本次取代。理由、代价与三个被否决方案写全——这次不无声违反历史决策。
- **`docs/adr/README.md`**：27 行索引表 + **六条关键脉络**（状态权威的确定顺序 0004→0005→0006→0022、分支与地图 0009→0010→0024、呈现面要有归属 0021→0025、卡包格式三步 0013→0014→0026、文风与破限 0016→0018→0020、文档编排 0027）+ 决策纪律四条。
- **引用同步更新 13 处**：`CONTEXT.md`、`AGENTS.md`、`docs/reference/README.md`、`docs/dev/workflow.md`（4 处）、`docs/dev/architecture.md`、`docs/agents/domain.md`（3 处）、`DESIGN.md`（2 处）、`GLOSSARY.md`、`LESSONS.md`、`HOST_ALIGNMENT.md`、`plans/conditional-injection-v1.md`、`worklog.md`（2 处）。
- **修复随包分发技能 [`presets/rp/skills/steward-decisions/SKILL.md`](../../presets/rp/skills/steward-decisions/SKILL.md)**：description 声称覆盖「D1–D22」但表格实际只到 D18。补齐 D19–D27、标注 0010/0013/0023–0026 的状态、表格改为一句话结论便于月停消费，并补一条「投影不是第二份权威状态」。
- **删除 `docs/reference/DECISIONS.md`**（48,943 字节，回收站可恢复），`srcExclude` 增 `adr/**`。
- **过程中的一个教训**：首次切分脚本用了 `[ordered]` 字典配 int 键，PowerShell 静默返回上一轮的值，写出 25 个编号错位一档的残留文件且不报错。已清空重做并加了两处断言（决策数 ≠ 26 即抛错、缺 slug 映射即抛错）。这类静默错位比报错危险得多。

## 2026-10-16 · 工程纪律重整 P0：过程产物退出主线

对标 dsh-tavern 做仓库收口，只清理不动骨架，`src/` 与 `tests/` 零改动。

- **删除 `dsh-rrp-test-report/`（81 文件）**：`TEST_REPORT.md` + `R2`→`R7` 六轮 + `E2E_BRIEF_ROUND2/3/4/6/7` 五份任务书 + 66 张轮次截图。病根是「每轮测试新增一份报告」的归档模式——`R1` 已不知去向，后来者无从判断哪份有效。
- **保留 DEF02 展厅 v2 验收档案**：报告 + 7 张 `g2-*.png` 迁至 `docs/reference/acceptance/`，保持 `screenshots/` 相对结构，报告内路径引用无需改写。选 `reference/` 而非 `dev/` 是因为 vitepress `srcExclude` 已排除 `reference/**`，避免 1.3MB 证据图进站点构建产物。
- **删除 `docs/reference/_archive/`（44 文件）**：其中 dsh-synapse 5 份适配/验证记录对应的项目已于 2026-09-20 撤装；`COMPLETED_WORK.md`/`TEST_REPORT.md`/`MEMORY.md` 等是过程账本。
- **删除 `.superpowers/`（3 文件，未跟踪）**：`plan-path` + `progress.md` 是第三套计划落脚点，已被 `docs/plans/` 与 `.scratch/` 取代。
- **新规（已写入 `docs/dev/workflow.md` 第 4 节 + `docs/reference/acceptance/README.md`）**：一个功能一份验收报告，复验覆盖更新原文件并追加「复验轮次」小节，禁止 `R2`/`R3`/`ROUND-N` 平行文件。仓库不再保留过程产物，翻旧账走 git 历史（README 已给出 `git log --diff-filter=D` / `git show` 取回命令）。
- **引用同步修复**：`docs/reference/README.md`（归档说明改为「历史内容怎么找」）、`docs/dev/workflow.md`、`docs/adr/0026-gallery-v2-cover-grid.md` 第 7 项（当时位于 `docs/reference/DECISIONS.md` D26，同日 P2 拆分后迁到 ADR）。
- **未处理（有意）**：`docs/dev/worklog.md` 内的旧引用保持原样——那是历史陈述，记录当时动作属实；`.scratch/` 内 4 处引用指向已删目录，属过程区快照，不改以免失真，grep 时会看到这 4 处残留。
- **待办**：无。P0–P3 已全部完成；后续纪律变更走 `check:hygiene` 这道机器门禁，不再依赖自觉。

## 2026-10-16 · P1 移植勘察：宿主 systemPrompt 装配面（未开工，仅事实）

> 目标（用户可验证）：把「借鉴清单 P1 #5–#8」中真正缺失的机制落到 dsh-rrp，使长线游玩的上下文**有界**且前缀缓存不被打爆。
> 档位：新特性/跨模块 → 走 `grill → to-spec → to-tickets → implement`；**本条只记事实与待决，未进 `src/`**。

### 事实（均已核对源码，非推测）

**我方现状**
- Author 侧**没有运行期提示词装配**：`AUTHOR_SYSTEM_PROMPT`（`src/agents/author.ts:24-137`）整段静态，`src/preset.ts:95` 以 `__DSH_RRP_AUTHOR_PROMPT__` token 物化进 `config.prefix`，每卡注册一个 preset（`src/preset.ts:69-113`）。`buildAuthorPrompt` / `authorAgent`（`author.ts:148-177`）在生产路径上是**死代码**，仅 `tests/agents-contract.spec.ts:13` 引用。
- `src/agents/contract.ts:14-24` 的「缓存不变式 M1」是**注释级约定，无代码强制**；真正生效的只有 `agent.cordis.yml` 的 `complete: true` + `includeRuntimeContext: false`，以及 `tests/preset.spec.ts:52` 的逐字节断言。
- 「同值不追加」**已存在**：`cardFingerprint`（`state-publisher.ts:186-188` vs `:253-256`）、`factsFingerprint`（`:175-183` vs `:326-357`）、`timelineFingerprint`。但有两个**逃逸口**每轮照样追加逐字节相同的全文：`foldMoved`（`:324-325`）、`timelineMoved`（`:317-320`）；且 facts 文本是整份 `renderWorldState` stableJson 快照（`world-state-visibility.ts:357-369`）——**历史随轮次线性膨胀**是当前的真问题，前缀本身今天仍是字节稳定的（无时间戳/回合号进模型可见文本）。
- 条件注入**没有过期机制**：靠文本买断（`lore-condition.ts:247` 「此前所有条件注入一律作废」+ `:259-268` 撤销清单 + 重启后全撤销 `state-publisher.ts:220,297-306`），**旧块永久留在日志里**。
- 开局写入顺序：`system/message` 受保护头（turn1）→ `publishState`（卡+初始状态+baseline）→ 开场白 `assistant/message`（turn2）（`start.ts:76-90,242-252,98-121`）。**没有任何合成 user 轮次**。

**参照项目（只读勘察，未改动）**
- 三个机制全部挂在**一个**宿主 hook 上：`ctx.on('system-prompt/assemble', …)`（`tavern-plugin/lib/hooks/turn-lifecycle.js:80-102`），系统提示**每请求装配、不写进转录**。
- 其持久事件刻意写 `content: []`，正文藏在 `source.sections` 里按四个标记还原（`session-stable-prefix.js:73-94,117-131`，注释：空 content 不会变成摘要素材）——所以「日志是唯一真源」与「不进模型历史」两件事被同时满足。
- 代价：前缀机制核心 186+194 LOC，压在约 800 LOC 配套设施（durable-file-promotion 265、user-preference-profile 321、session-surface-mutations 115…）与 **6 条迁移分支**上；相比之下卡提示变更检测只有 **35 LOC**、当轮注入 **24 LOC + 78 LOC 适配器**。

**宿主一等公民（我们尚未使用的 seam，宿主 0.2.0-rc.1 实测存在）**
- `@deepseek-ai/dsh-system-prompt`：`ctx.systemPrompt.section({name, order, text | provider(context), interpolate, complete})` —— **provider 每次装配求值**，返回 Cordis disposer（天然满足可逆注册）；`context()` 是「持久化 user-role 快照」通道；`variable()`、`suppressRuntimeContext()`、`tools()` 同源。
- 官方实践文档 `dsh-agent-preset/skills/cordis-plugin-development/references/practices.md` 三条直接裁决：
  1. `:18`「**Add prompt text with `ctx.systemPrompt.section()`.** Add per-agent context with `agent.inject()`；它记为 `agent/inbox/spliced` 并进入下一个准入步骤」；
  2. `:17`「**不要**监听 `system-prompt/assemble` 来增删工具或文本」（即参照项目用的是被官方劝退的最强机制）；
  3. `:7`「会话日志是唯一真源，模型所见必须可从已提交事件重建」。
- `agent/pre-step`（`dsh-agent/lib/types/runtime-types.d.ts:302-310`）可**替换进入本步的消息**；`agent/request` 明确「cannot mutate messages」；`llm/stream` 对 LOOP 请求 deep-frozen，「listeners read it, never rewrite it」。

### 待决（拷问轮 frontier）
1. **易变内容放哪**：继续「追加进转录 + 文本买断」（现状），还是改用 `ctx.systemPrompt.section()` provider 每请求装配（= P1 #5/#7 的宿主原生版，且比参照项目便宜一个数量级）？关键未知：section 文本每轮变化会否把 `[system+history]` 前缀缓存整段打掉——需真机测量，不能靠推理定案。
2. **P1 #6** 是否降级为「补两个逃逸口 + 卡/preset 通道同值不追加」的小修（现状已有指纹去重，归档 `COMPLETED_WORK.md:33` 的 P1-6 已做过状态侧）。
3. **P1 #8 种子对话轨迹**与 **D21** 正面冲突（参照项目为此打了 2 个宿主客户端 patch 隐藏合成轮，并引入 3 条 throw 路径）；且会在世界线回合树与小说导出里长出假轮次。建议**不做**，或先改 D21 再谈。
4. **术语**：`稳定前缀快照` / `当轮生效注入` / `种子对话轨迹` 是否登记为 GLOSSARY 新词（规则：新增概念先在术语表登记，再进实现）。
5. 归档 `TAVERN_PRESET_ANALYSIS.md:152`「前缀缓存：我们更强」与新清单「学 A」并不矛盾——前者说的是**转录前缀字节稳定**（我们赢），后者说的是**上下文有界**（我们输）。此区分需写进文档，避免下轮再翻烧饼。

## 2026-10-16 · 仓库收口：质量门复校 + 本机票据与验收证据归仓

### 已完成
- **质量门复校（更正上一条记录）**：`pnpm run format:check` 实际**未通过**——`src/agents/chronicler.ts`、`src/recall.ts`、`src/recall-route.ts`、`src/client/components/worldline-turn-rail.tsx` 及对应 4 个测试文件不合 Prettier；2026-10-16 条目所记"全量质量门 format 零警告"不成立（那批提交跳过了 format）。已用 `prettier --write` 修正，纯重排无语义变更，提交 `26008aa`。
- **归仓本机未跟踪资产**：`.scratch/{gallery-v2,host-020-upgrade,stage-v2,world-state-v2,worldline-v2}` 的规格与票据 markdown（24 文件，`52b9e70`）；`dsh-rrp-test-report/DEF02_GALLERY_V2_ACCEPTANCE.md` + 10 张真机证据截图（`ae7e857`）。`.scratch/dsh-host.json`、`.scratch/logs/`、`*.log` 仍由 `.gitignore` 排除，handoff 文档只记凭据存放路径不含值。
- **复验**：`format:check` / `typecheck` / `lint` 全零告警，Vitest 63 文件 / 517 用例通过（~6.8s），`git diff --check` 干净，工作区无未跟踪残留。

### 待决
- **main 领先 origin/main 10 个提交，未推送**（等用户明示）。
- **移植清单剩余项**：P0 只剩 #4「Playwright 真实玩局 E2E」——现有 `tests/e2e-simulation.spec.ts` 是进程内管线模拟，不驱动浏览器；P1 #5–#8（稳定前缀快照、卡提示变更检测、当轮生效注入、种子对话轨迹）与 P2 #9–#10（词汇表瘦身、流程一页纸纪律）全部未动。
- **真实游玩闭环仍需模型密钥**（设置 → 模型写 `DEEPSEEK_API_KEY`），宿主 0.2.1-alpha.1 的两个升级阻塞项未解（详见 `docs/reference/HOST_BASELINE.md`）。

## 2026-10-16 · 借鉴 dsh-tavern 成熟机制的架构演进与全链路闭环

### 已完成
- **并发与版本安全锁（Phase 0）**：
  - `src/chronicler.ts`：实现回滚检测（`proseHeadSeq < throughSeq`）与并发抢跑折叠锁（`liveFoldSeq >= throughSeq`），过期/抢跑推演自动丢弃（`status: 'cancelled'`），杜绝旧轮次推演覆盖新世界状态。
  - `src/client/components/worldline-turn-rail.tsx`：引入未完结回合分叉守卫（`canFork = node.proseExcerpt.trim().length > 0 || node.turn === 0`），禁止对正文为空或推演未就绪节点创建分叉。
  - `src/worldline-fork-marker.ts`：分叉标记触发 `onFork(child.id)` 回调，即刻调用 `cleanupSession(childId)`，清理子会话旧缓存与在途推演。
- **两阶段主动历史召回引擎（Phase 1）**：
  - `src/recall.ts`：实现两阶段渐进揭示历史召回引擎。Stage 1 关键词精准/重叠搜索（query ≤240 字符，按相关度与时效排序并截取上下文摘要）；Stage 2 深度轮次读取（turn 深度读取，支持 radius 0-3 上下文展开）。内置单作用域 6 次调用预算硬顶、10 回合冷却与完全重复检索去重；输出内置反幻觉警告（“严格基于回忆片断回答，不得当作当前场景继续输出”）。
  - `src/recall-route.ts`：挂载 HTTP 路由 `POST /dsh-rrp/recall`，并在宿主具备 `ctx.tools` 时原生注册 Cordis 工具 `rrp_recall_history`。
  - `presets/rp/skills/recall-history/SKILL.md`：编写标准回忆技能规范。
- **增量状态推演与月停回忆注入（Phase 2）**：
  - `src/agents/chronicler.ts` & `src/chronicler.ts`：`chroniclerReplySchema` 升级支持 `state` 完整切面或 `patch` 增量补丁；Chronicler runner 自动通过 `applyWorldStatePatch` 增量合并变更并校验 schema，降低模型输出 token 与上下文消耗。
  - `src/agents/copilot.ts` & `src/copilot.ts`：Copilot 自动提取玩家问题关键词并执行主动回忆检索，格式化为 `【历史回忆】` 注入 Prompt。稳定上下文（卡包设定、世界状态、已有设定集）位于 Prompt 前部，动态回忆与玩家输入置于后部，严格保障大模型 KV Prefix Cache 稳定性。
- **全链路多轮交互自动化模拟测试（Phase 3）**：
  - `tests/e2e-simulation.spec.ts`：构建 5 回合多轮叙事 E2E 模拟测试，完整覆盖开局准备、正文生成、Chronicler 完整状态折叠、增量 Patch 补丁折叠、时间线事件批次追踪、未完结分叉守卫、分支子会话隔离与缓存清理、主动历史召回与反幻觉校验、Copilot Prompt 前缀缓存排布验证，以及并发回滚锁断言。

### 验证
- **全量质量门**：`pnpm run typecheck`（TypeScript 5.9）零错误；`pnpm run lint`（ESLint）零警告；Vitest 全量 63 个测试套件 / 517 个测试用例 100% 通过（总运行耗时 ~9.5s）。
- **提交闭环**：按功能点分为 5 个原子 commit 独立提交，无无关杂质。

## 2026-10-13 · 第一阶段改造：开发环境打通 + 后台错误透传

### 已完成
- **宿主基线落地运行**：按 HOST_BASELINE 的 0.2.0-rc.1 安装专用宿主到本机 `~/.dsh-rrp/host`（npm 平铺树，避免顶层 pnpm 装 dsh 造成的 dsh-sandbox 版本错位）；`host-runner.mjs` 的 `resolveDshBin()` 解析顺序改为 仓库本地 → `~/.dsh-rrp/host` → 全局。
- **host-runner 进程识别修复**（闭环 2026-09-25 记录的 "启动器未能生成可验证 runner 状态" 问题）：DSH 0.2.x 在 Windows 上监听端口被 netstat 报为 PID 0，端口→PID 映射不可靠；改为扫描进程命令行中的精确 `--profile <p> --port <n>` 对（Windows 用 PowerShell CIM，Linux 用 ps），保留 state 的 PID+创建时间复核；无 state 时精确 argv 匹配也可管理进程。start/stop/status 全链路实测通过。
- **后台智体错误透传**：`collectText()` 原先忽略流式 `finish` 错误块，模型调用失败（如 MISSING_CREDENTIAL）被误报为 "EMPTY reply"。现在遇到 `error`/`aborted` finish 直接抛出真实原因（含 code 与 message），Chronicler/Summarizer/Scribe/月停四个后台智体同时受益；真机日志已验证输出 `LLM stream failed (error, MISSING_CREDENTIAL): llm-deepseek: no API key …`。
- 单元测试新增 5 例（collectText 成功拼接 / error finish 嵌套与扁平两种形状 / aborted / 空成功流）。

### 验证
- 全量质量门：typecheck、lint、format:check、Vitest 60 文件 / 489 用例、build 全部通过。
- 真机：rp-dev profile 下开局「雪夜雁门客栈」「女仆大小姐」均成功建会话、写开场白、触发 Chronicler；旧存档重启后可正常加载。

### 未完成/下一步
- **真实游玩闭环待玩家配置模型密钥**：会话内报 `MISSING_CREDENTIAL`，需在 设置 → 模型（Models）页写入 DEEPSEEK_API_KEY（credentials service），或在启动环境中 export 该变量。配好后：发消息 → Author 出正文 → Chronicler 结算 → 世界状态页签可见更新。
- **E2E 自动玩局（Playwright + 固定模型输出）未开始**：需先摸清宿主 Models 设置存储/API 以注入 stub 模型路由；计划在密钥真机验证后动工。
- **宿主 0.2.1-alpha.1 发现两个升级阻塞问题**（详见 docs/reference/HOST_BASELINE.md 未升级发现节）：失败回合会把会话写成 0.2.0 校验器无法加载的格式；netstat 端口归属丢失。升级宿主前先解决。
- 未提交；待用户确认后按功能点拆提交。
