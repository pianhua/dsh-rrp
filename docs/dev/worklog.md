# WORKLOG — 工作日志（当月进行中，最新在上）

> **只记当月进行中的条目。** 上月及更早的完整记录按月切到 [`worklog/`](./worklog/)，
> 翻历史去那里或走 git，不要往本文件堆跨月内容。

> 月中提前轮转：2026-10-17 主日志触 32768 字节上限，当日全部 10 月条目切至
> [`worklog/2026-10.md`](./worklog/2026-10.md)；当月后续条目继续记本文件，次月归仓时并入。

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
