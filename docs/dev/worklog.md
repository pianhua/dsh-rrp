# WORKLOG — 工作日志（当月进行中，最新在上）

> **只记当月进行中的条目。** 上月及更早的完整记录按月切到 [`worklog/`](./worklog/)，
> 翻历史去那里或走 git，不要往本文件堆跨月内容。

> 月中提前轮转：2026-10-17 主日志触 32768 字节上限，当日全部 10 月条目切至
> [`worklog/2026-10.md`](./worklog/2026-10.md)；当月后续条目继续记本文件，次月归仓时并入。

## 2026-10-17 · R1 修复：懒开局落地（issue 06 关闭，ADR 0028）

### 已完成

- **勘察实证**（探针 spec 现场 dump）：碰撞日志形态确认；`turnBoundary` 快照于 preset 组合时
  （loop 首回合永远 turn 1，预写任何闭合回合必撞）；loop 首个 system commit 原生活成为
  受保护头（占位头退休）；**`observeSession`/`readSession` 在 0.2.0-rc.1 上对碰撞日志宽容**
  （票据 04 的冷读拒绝出自 v3-to-v4 严格断言栈）——验收门 therefore 直接跑宿主包
  `restoreReleasedV4Artifacts`，不依赖任何冷读入口的宽容。
- **实现两道宿主硬约束修正**（设计 v2）：① `session/event` 监听内追加被宿主禁止
  （实测 `session append cannot reenter while another append is being published`）——
  事实改经 **`agent/pre-step` waterfall** 改写 decision.messages，由 loop 自己在受保护头后、
  玩家消息前追加（新增 `buildOpeningFactsMessages` 复用 publishState 同款渲染）；
  ② 开场白必须保持 assistant 角色（decision 只收用户消息）——首个 system commit 的
  事件监听登记 OPENING_DUE 并 **queueMicrotask**，在 loop 同步追加突发后、回复前落进
  仍开着的 step 1。最终日志序：头→事实→玩家→提醒→开场白→正文。
- **语义变化（ADR 0028 记录）**：开局后首条玩家消息前日志为空；开场白位于首条玩家消息
  之后、正文之前；`StartResponse.openingWritten` 增 `'deferred'`。Chronicler 不再为
  开局空转触发（首回合一次完整折叠）。
- 验收：e2e playthrough 重启相升级为**宿主冷读 readSession 200 + 严格 v4 关系断言 +
  数据面三方**；负向对照 WRONG_GOLD=1 仍非零退出（exit=1，断言点正确）；单测
  start.spec 全量改写（10 例）。

### 验证

- 全量质量门（hygiene 现含 28 篇 ADR）+ 548 用例 + build 全绿；e2e 连跑 3 次一致（见当次提交）。

### 待决

- 无。issue 06 关闭；reopen 条件：宿主某版本 loop 计数器改为现读（ADR 0028 记录）。

## 2026-10-17 · 决策审计与文档清理：27 篇 ADR 首审、悬挂待决全裁决、死研 4 份清除（decision-audit）

### 已完成

- **ADR 首次全面内容复审**（所有者委托裁决）：27 篇逐条重读原文、对照生产代码与测试证据裁决——
  **全部 reaffirm，0 退役**。所有者的「不放心」在职 ADR 层面未获证实：架构基座（Host-First/投影/
  追加式发布/无锁矫正/个人玩具红线）全部被 548 用例与 e2e 玩局链实证仍成立。复审日期统一
  2026-10-17；0005 补「WorldState v2 已被 0023 接管」同步注；0025/0026 正文「待实现」与
  状态栏「已实现」的内部不一致同步。逐条裁决与证据：`.scratch/decision-audit/spec.md`。
- **悬挂待决全部裁决**（worklog 5 条清零）：#1 易变内容维持现状（section 路线须真机测量后再评估）；
  **#2 P1-6 关闭**（指纹去重已覆盖生产路径）；**#3 P1-8 种子轨迹裁决不做**（与 D21 冲突，重开先改 D21）；
  #4 术语不预支、随实现登记；#5「转录前缀稳定 vs 上下文有界」两维区分写进 CONTEXT.md Stable Prefix
  ——这是防翻烧饼的关键一条。
- **文档清除 4 份**（按 reference/README 自有的死研规则）：`plans/conditional-injection-v1`（shipped，
  决策归 0017）、`TAVERN_V2_COMPARISON` 与 `TAVERN_SANITIZATION`（过期调研，结论已折进 ADR/roadmap/
  tavern-migration）、`reference/examples/return-inn.SKILL`（0 引用示例）。`TAVERN_DETAIL_COMPARISON`
  保留为 R2/R3 证据基并注明收口后移除；`docs/plans/` 留 README 桩保分类入口；workflow §4 补上
  票据 Status 词汇规范（issue-tracker/triage-labels）的链接——0 引用是断裂不是无用。

### 验证

- 纯文档改动：质量门 hygiene/format/typecheck/lint、548 用例、build 全绿（前后一致）；e2e 零接触未重跑。
- 提交：`docs(adr)` 复审同步 → `docs` 死研清除 → `docs` 待决裁决，共 3 个，已推送。

### 待决

- 无新增。审计结论：**决策面干净，R1（issue 06）仍是唯一 P0**，可直接开工。

## 2026-10-17 · 仓库彻底重构：对照 dsh-tavern 的分层归位 + 重启路线图（repo-restructure 票据 00–07 全 resolved）

### 已完成

- **审计先行**：58 个平铺根文件、空 `src/skills/`、一次性脚本与日常脚本混居、worklog 触顶（32099/32768 B）、模块地图漂移；零 TODO、无超大文件。按「拒绝无差别重写」既定纪律（9 月 repo-refactor 规格 + ADR 0015），定行为保持型结构重构，规格与 8 张票据落 `.scratch/repo-restructure/`。
- **src 分层归位（5 提交）**：`routes/`（10 个 *-route.ts）→ 四域目录（world-state/ worldline/ lore/ cards/，20 文件）→ `runtime/`（8 个智体运行时）+ `host/`（7 个宿主接缝）→ `publish/`（6 写通道）+ `ui-contract/`（3）。根目录定型 **4 文件 + 12 目录**。55+ 处消费方 import 由解析式改写器更新（sed 两次踩坑记入教训：重复组后向引用只捕获末次迭代；被移文件的内部 import 必须按**旧位置**解析）。
- **bundle 路径不变量事故（本轮最大教训）**：`import.meta.url` 相对路径在 tsdown 打包后按 lib/ 深度解析、源码形态按真实文件深度——「src 根深度 == lib 深度」是隐性不变量，文件一挪即破。单测/integration 全绿漏过，**e2e 三连红一致抓到**（生产形态网的价值实证）：ENOENT `D:\projects\presets\rp\agent.cordis.yml`。修复：新增 `src/repo-dir.ts` `repoDirOf()` 双层探测（深先浅备），preset 源目录、随包卡目录、stage-kit 资产三处接入；`src/cards/cards.ts` 自名陷阱（浅层候选 == 模块自身所在目录）写成回归用例。**今后搬迁文件时，凡 import.meta.url 一律走 repoDirOf，禁止手调层级数。**
- **routes→runtime 单向化**：`fetchSessionRounds` 连同 `PersistenceService` 从 recall-route 迁入 `runtime/recall.ts`（copilot 与 recall 路由共用），消掉 runtime→routes 反向依赖。
- **配套清理**：`scripts/maintenance/` 归档 5 个一次性脚本；worklog 月中轮转至 `worklog/2026-10.md`（32.4 KB）；6 篇现状文档 31 处 `src/*.ts`/`scripts/*.mjs` 引用对齐（历史 ADR、worklog 归档、旧项目反例按裁决不改）；`architecture.md` 模块地图与磁盘一一对应。
- **重启路线图**：`docs/dev/restart-roadmap.md` 落盘——R1 issue 06（根因三层内联自足，P0）、R2 Playwright 真玩局（建议排在 R1 后）、R3 P1 #5–8、R4 B2、R5 B3、R6–R8 工程余项；AGENTS.md 文档真源表登记。

### 验证

- 全量质量门（hygiene / format / typecheck / lint）+ 548 用例（基线 543 + repoDirOf 新增 5）+ build + **e2e 连跑 3 次一致全绿**（修复前 3 连红同因，负面对照式互为印证）。提交链：worklog 轮转 → 01 routes → 02 四域 → 03 runtime+host → 04 publish+ui-contract → 05 scripts → 06 docs → 07 roadmap → repoDirOf 修复，共 9 个。

### 待决

- 无新增。issue 06 修复仍为最高优先（roadmap R1）；懒开局方案动 V4 语义，必须先规格 + ADR（30+20）。

附录：[`2026-10`](./worklog/2026-10.md) — play-e2e 四票据交付、工程纪律重整 P0–P3、issue 06 发现（月中轮转）
附录：[`2026-09`](./worklog/2026-09.md) — WorldState v2、架构重构、世界线 v2、舞台 v2、展厅 v2、宿主 0.2.0 适配
