# WORKLOG.md — 工作区状态盘点（追加式，最新在上）

## 2026-09-25 · WorldState v2 Phase 6/7/9 UI、可见性与消费者迁移

### 已完成
- Phase 6：WorldState 加入 `conversation.view`；主区工作区与 native 右侧栏共享按 Session 隔离的 draft store；支持 v2 对象/目标/矛盾/认知/事件/关系、预算诊断、timeline 筛选、保存预览、引用删除二次确认和 hidden markup 防泄漏。
- Phase 7：内部/model/player 可见性过滤、player-safe projection/卡包 detail/timeline route、hidden 写保护和不泄密提示完成。
- Phase 9：条件注入、Stage、WorldlineDigest、活动摘要、UI schema 与两张官方卡的 v1 flat 路径已迁移到 v2 tracked-object/object-field/global-field 路径；不恢复 v1 fallback。
- 票据 07、09 已 resolved；票据 06、08 标为 `ready-for-human`。已知宿主边界是 DSH 0.1.6-alpha.2 没有公开 Session 导航拦截 seam，因此 Save/Discard/Stay 是可观察降级控件，不伪造导航拦截；票据 08 的真实 host/browser 验收仍待执行。

### 验证
- 全量标准质量门：environment、format、typecheck、lint、Vitest（55 文件 / 410 用例）、build、`git diff --check` 均通过。
- 可见性/双入口/安全写入定向回归：7 文件 / 42 用例通过；Phase 7 player-safe/card-route/timeline 测试通过。
- 旧 v1 consumers、官方卡 when/Stage bind、prune/activity fixtures 已迁移；官方卡加载不再产生旧 flat path 警告。

### 未完成/下一步
- 票据 08 仍需真实 DSH 浏览器验证：两张官方卡新建会话、主区/右栏共享 draft、推演竞态、timeline 筛选、hidden 内容不泄漏、native fork 的 inherited/local timeline 边界。
- 按此前用户授权尝试 `node scripts/host-runner.mjs start`：启动器未能生成可验证 runner 状态或认证 URL；随后 `status` 报 `3099 CONFLICT (unverified PID 5584)`，但 `/dsh-rrp/cards` 返回 200。未执行 stop，避免误停未知进程；未读取认证日志。真实 DSH/browser 验收保持未验证，票据 08 为 `ready-for-human`。
- 未提交、未推送、未合并；`.agents/` 与 `skills-lock.json` 仍是本机技能资产。

## 2026-09-24 · WorldState v2 Phase 4/5 Agent 与安全写入切片

### 已完成
- Phase 4：Chronicler/Author 已迁移到 v2 完整 WorldState；Chronicler 输出变更摘要/证据，按明确剧情证据更新对象、认知、目标、矛盾和事件，实际变化写 actor=chronicler timeline batch；no-op/失败/取消不写 timeline；Author 输入分层并加入 model/hidden 秘密边界。
- Phase 5：玩家矫正和月停 WorldState 动作使用 v2 safe-write；支持 diff preview、完整 snapshot、actor provenance、引用安全、归档/恢复/确认删除、隐藏内容保护和预算诊断；月停动作先暂存，玩家确认后以 actor=copilot 写入，undo 保持追加恢复快照。
- 主审修正：玩家写路径不能通过删除 hidden 对象/字段绕过保护；fork 子线玩家批次始终明确 `origin: local`。
- 票据 `.scratch/world-state-v2/issues/04-chronicler-and-author-contract.md`、`05-player-correction-and-safe-writes.md` 已 resolved。

### 验证与边界
- Phase 4 定向：2 文件 / 24 用例；Phase 4 回归集：8 文件 / 60 用例通过。
- Phase 5 定向：7 文件 / 50 用例通过；相关 ESLint、Prettier、`git diff --check` 通过。
- 全仓 typecheck/test 仍被尚未迁移的 client/UI、lore-condition、旧 world-state-draft/activity/prune 测试阻塞；不以 v1 fallback 掩盖，后续票据继续迁移。

## 2026-09-24 · WorldState v2 Phase 1 领域模型与投影切片

### 已完成
- 在 `feat/world-state-v2` 分支开始实现；保留访谈期 docs 改动和未跟踪本地技能资产，不修改 `.agents/` / `skills-lock.json`。
- 完成 v2 `WorldState` 领域词汇：追踪对象、外部引用、角色通用字段、卡包/未定义标量字段、近期目标、活跃矛盾、认知、双向关系、当前事件、visibility、归档/删除引用安全、结构化 diff 和预算诊断。
- 完成 `rrpWorldState` v2 projection（stateVersion 2）和 `rrpWorldStateTimeline` host-only projection；payload 在已知 `user/message.source.rrp` 中携带完整 snapshot + 原子 `worldStateTimelineBatch`，没有新增 Session event。
- 移除 Phase 1 范围内的 v1 relations 回填、扁平顶层动态字段 fallback、硬数量静默裁剪和旧会话隐式迁移。
- 修正审查发现：角色在场改为 `present/absent/unknown` 三态；当前事件状态覆盖 `pending/active/blocked/completed/invalid/abandoned`。

### 验证
- Phase 1 定向 Vitest：6 文件、37 用例通过。
- Phase 1 定向 ESLint、Prettier、`git diff --check`：通过。
- 全量 typecheck/test 暂未全绿：错误集中在尚未迁移的 Chronicler、Correction、Copilot、Lore 条件、旧客户端、卡包和旧测试消费者；未通过 v1 fallback 掩盖，下一阶段按票据继续迁移。

### 当前状态
- 票据 `.scratch/world-state-v2/issues/01-domain-model-and-projection.md` 已记录为 resolved。
- 下一步是票据 02 卡包 schema/官方卡迁移和票据 03 持久时间线写入；Phase 1 的 wire shape 与 projection key 已固定。

## 2026-09-24 · WorldState v2 Phase 2/3 卡包 schema 与持久时间线

### 已完成
- Phase 2：新增独立 `state.schema.json` 契约与 `src/card-state-schema.ts`；`maid-heiress`、`yanmen-inn` 的 `state.json` 迁移到 v2，`affinity` 仅在女仆卡适用；schema 不进入 CardContext、source payload、preset 或 UI runtime。
- Phase 3：新增/完善 baseline 与原子 `worldStateTimelineBatch` 写入；时间线继续寄生于已知 `user/message.source.rrp`，host-only projection `rrpWorldStateTimeline` 折叠物理事件前缀；无变化、失败、取消、非法载荷不写 WorldState timeline。
- 两个票据已 resolved：`.scratch/world-state-v2/issues/02-card-schema-and-official-cards.md`、`03-persistent-worldstate-timeline.md`。

### 验证与已知边界
- Phase 2/3 定向验证通过：卡包/schema/start/preset/card-ui、publisher/fork/transcript/timeline 测试；合计当前目标文件全绿。
- 现有 `lore-condition.ts` 仍按 v1 WorldState 路径求值，官方卡加载会出现旧路径警告；Chronicler、Correction、Copilot、客户端和 UI 尚未迁移，属于后续票据 04–07，不恢复 v1 fallback。
- 全仓 typecheck/test 尚未全绿，失败来自上述尚未迁移的 v1 消费者和测试；不得在 Phase 2/3 结论中声称全仓完成。

## 2026-09-24 · WorldState v2 领域设计确认与规格落盘

### 目标与决策
- 维护者确认从开发阶段转入 WorldState 定向维护/优化/升级/精细打磨；本轮完成 144 个设计问题的分层访谈并确认共享理解。
- WorldState v2 负责近期、当前、可行动状态：追踪对象、角色通用字段、卡包专属字段、角色认知、双向关系、近期目标、活跃矛盾、当前事件和持久只读时间线；剧情脉络负责高维长线视角，卡包/Skills 负责硬设定。
- WorldState 进入 `conversation.view` 会话页签，右侧栏保留完整编辑能力；两处共享 Session 草稿。D6 无锁玩家矫正保留；D22 已修订为近期状态与高维剧情视角分工。
- 已确认不为旧会话做新 schema/时间线兼容迁移；动态字段及主要状态对象暂不设硬数量上限，不静默删除，由预算/体积提示和实测驱动后续限额决策。

### 已落盘
- 术语与决策：`docs/reference/GLOSSARY.md`、`docs/reference/DECISIONS.md`（D5、D22、D23）。
- 规格：`.scratch/world-state-v2/spec.md`。
- 垂直票据：`.scratch/world-state-v2/issues/01`–`08`，含真实阻塞关系、验收和 out-of-scope。
- 当前只改设计文档、术语/决策和本工作日志；没有进入 `src/`、`tests/` 或构建配置。

### Ready-to-code gate 状态
- 用户目标、标准术语、字段边界、生命周期、可见性、异常、fork 语义、双入口 UI 和验收场景已落盘。
- 规格和票据已形成；实现前仍需按每张票据执行编码前冲突检查，并从 `01-domain-model-and-projection` 开始按依赖顺序实施。
- 工作区另有技能安装产生的未跟踪 `.agents/` 与 `skills-lock.json`，本轮不纳入 WorldState v2，也不修改或清理。

### 下一步
- 先做规格/票据与 `AGENTS.md`、`DESIGN.md`、`HOST_ALIGNMENT.md`、`DECISIONS.md`、`GLOSSARY.md`、`HOST_SEAMS.md` 的冲突审查。
- 冲突门通过后，按 01→02/03→04/05→06/07→08 的依赖顺序实现；每张票据独立测试，最终进行两张官方卡的浏览器/宿主验收。


## 2026-09-23 · 仓库架构重构分支与基线门禁

### 目标与决策
- 在隔离分支中进行循证、小步、保持行为兼容的架构维护；审计不支持无差别重写全仓。
- 保留 `.worktrees/` 本地数据，改为在 Git、ESLint、Vitest 与 Prettier 中排除它，防止嵌套 checkout 被误当作当前仓库文件。
- 已建立 `.scratch/repo-refactor/spec.md` 与 5 个实现切片票据；进一步切片必须保留 DSH Host-First、路由与会话持久化契约。

### 已完成
- 当前工作分支 `refactor/repo-architecture`，从 `main` / `origin/main` 的 `9b0cdc7` 创建；未提交、未推送、未合并。
- 首轮审计覆盖插件入口/生命周期/投影发布、服务端领域路由、客户端与契约、工具链/测试组织；识别类型重复、导入职责耦合、Lore 共用能力依赖路由、WorldState 表单纯转换耦合组件、卡片列表 DTO 未复用等候选；无证据支持投影、Stage、世界线或 host-runner 大改。
- `.gitignore`、`.prettierignore`、ESLint 与 Vitest 配置已加入 `.worktrees/` 排除；不删除、不移动、不改动任何嵌套 worktree 内容。

### 基线验证
- 首轮 `pnpm run check:environment`、`pnpm run format:check`、`pnpm run typecheck`：通过。
- 首轮 `pnpm run lint`：因递归扫描 `.worktrees/feat-auto-20260923-47726507`，报 268 个多 `tsconfigRootDir` 解析错误；首轮 Vitest 收集根与嵌套 checkout 共 87 个文件，760 个用例通过但嵌套旧 checkout 缺少 `happy-dom`，另有 1 个收集错误；build 因测试链中止未运行。
- 将 `.worktrees/` 排除于 `.gitignore`、`.prettierignore`、ESLint 和 Vitest 配置；不修改嵌套目录内容。执行 `pnpm install --frozen-lockfile` 恢复 package.json 已声明但本地未链接的 `happy-dom`，lockfile 未变。
- 修正后 `pnpm run check:environment`、`pnpm run format:check`、`pnpm run typecheck`、`pnpm run lint`、`pnpm test --silent`（45 文件 / 391 用例）与 `pnpm run build` 均通过；`git check-ignore` 确认 `.worktrees/` 被忽略。

### 集成结果与状态
- 00–05 票据均已 resolved；完成共享宿主类型/清理覆盖、卡片导入解析与落盘分层、Lore 应用层、WorldState 草稿纯转换、卡片 DTO 对齐。
- 最终验证：`pnpm run check:environment`、`pnpm run format:check`、`pnpm run typecheck`、`pnpm run lint`、`pnpm test --silent`（46 文件 / 407 用例）、`pnpm run build`、`git diff --check` 均通过。
- 经维护者指示尝试 `node scripts/host-runner.mjs start`：启动器移除了已存在的空闲 runner 状态文件并截断日志，但因无法验证 Windows 进程所有权而未生成新状态。随后 `status` 报告 `3099` 为 `CONFLICT (unverified PID 42936)`；服务仍监听，`GET /dsh-rrp/cards` 返回 200（2 张卡），`GET /` 返回 401。为避免误停可能的用户进程，没有执行 stop；未读取包含本地认证信息的日志。当前可用性受登录认证阻塞，登录 URL 未能由 runner 安全捕获。
- 分支 `refactor/repo-architecture` 尚未提交、推送或合并；根 `.worktrees/` 仍存在且未改动，`git worktree list` 保留原有注册。


## 2026-09-23 · GitHub #42/#43 修复

### 目标与决策
- 闭环开放 Issue #42（host-runner 仅终止自身管理的 DSH 进程）与 #43（将 cleanup 生命周期测试隔离到临时 DSH_HOME）。
- host-runner 通过抽象进程身份、精确参数切分、启动时间与 PID 双重比对确保强所有权；遇到端口冲突安全失败，拒绝终止未知进程。
- cleanup 规范生命周期测试，通过 `withIsolatedDshHome` 重定向至独立临时目录，保证开发者本机 `$HOME/.dsh` 不被读取、创建、刷新或删除；断言已存在自定义修改时不发生覆盖。

### 已完成
- #42：提取纯函数决策逻辑至 `scripts/host-runner-ownership.mjs`，包含参数精确切分、非子串参数匹配与端口所有权状态决策；新增 `scripts/host-runner-ownership.d.mts` 强类型定义；重构 `scripts/host-runner.mjs`，在 Windows 下安全调用 PowerShell 提取进程并防御性格式化时间，修复 `processStartedAt` 状态持久化与 `stopHost`/`startHost` 冲突拒绝逻辑；新增 `tests/host-runner-ownership.spec.ts` 覆盖状态决策、PID 复用拒绝、Windows/POSIX 命令行解析。
- #43：在 `tests/cleanup.spec.ts` 中封装 `withIsolatedDshHome`，将所有 `rrp.apply(ctx)` 生命周期测试限制在临时工作区中执行；增加针对已修改 preset 的不覆盖断言。
- 本地票据 `.scratch/repository-audit/issues/03-host-runner-kill-ownership.md` 与 `04-isolate-cleanup-test-home.md` 均标记 resolved。

### 验证
- `pnpm exec vitest run tests/host-runner-ownership.spec.ts tests/cleanup.spec.ts`：2 文件、15 用例通过。
- `pnpm test -- --run`：45 文件、390 用例通过。
- `pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`：均通过。

### 状态
- 准备提交特性分支并合并至主分支。

## 2026-09-23 · GitHub #40/#41 修复

### 目标与决策
- 处理开放 Issue #40（共享 JSON 请求体无限读取）与 #41（StagePanel 条件 Hook 顺序变化）。
- 保持宿主 Web Server 接入与现有项目结构；普通 JSON 请求体限 4 MiB，卡片导入限 32 MiB；Stage 同实例状态切换由真实 React DOM 测试覆盖。

### 已完成
- #40：`src/host-faces.ts` 的 `readBody` 按实际 UTF-8/二进制字节数累计并在超限首个 chunk 立即拒绝；`readJsonBody` 返回结构化成功/400/413。全部共享 JSON 路由统一响应；卡片导入显式提高限额。世界线和月停主 POST 在存储访问前解析与拒绝请求，避免超限请求触发副作用。
- #41：`src/client/stage-tab.tsx` 将 WorldlineDigest 投影 Hook 移至无卡分支返回之前；新增 happy-dom 同一 React root 测试覆盖无卡→有卡→无卡、digest transcript 推送和卡切换页面更新。
- 本地票据 `.scratch/repository-audit/issues/01-bounded-request-body.md` 与 `02-stage-hook-order.md` 均标记 resolved。

### 验证
- `pnpm exec vitest run tests/route-contract.spec.ts tests/stage-hook-order.spec.ts tests/host-faces.spec.ts`：3 文件、16 用例通过。
- `pnpm test -- --run`：44 文件、380 用例通过。
- `pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`、`git diff --check`：均通过。

### 状态
- 未提交、未推送。工作区改动仅覆盖 #40/#41、happy-dom 测试依赖、测试与本工作日志；GitHub issue 状态尚未修改。


> 纪律（见 `docs/dev/workflow.md` 第 4 节）：已确认的内容必须落盘，上下文压缩后只认本文件。
> 每条带日期；事项关闭时标注（关闭 + 日期），不删旧条。

## 2026-09-22 · Agent 完整交接包（Round-6/7 全量闭环与纯净基线归零）

### 目标：
1. 彻底解决旧 Agent 频繁卡死、无法进入浏览器 Web 界面的启动痛点，建立稳定可复用的宿主自动化管理方案；
2. 闭环 Round-6 舞台 Stage（issue #18）T42–T48 全量真机验收并归档；
3. 将积攒的格式债务、协作契约与工具脚本按逻辑拆解并完成原子化提交，恢复纯净代码工作树；
4. 闭环 Round-7 条件注入机制 v1（issue #16）T49–T53 全量真机抽查并归档；
5. 输出标准化交接包与当前系统黄金基线，供后续 Agent 或维护者平滑接续。

### 范围 / out-of-scope：
- **范围（In-Scope）**：
  - 本地 DSH 宿主服务启动器脚本 `scripts/host-runner.mjs`（端口强杀、代理剥离、直连 Node 派生、Token/Cookie 自动捕获）；
  - Round-6 舞台（issue #18）T42–T48 Chrome 真机驱动测试、截图与报告归档；
  - 格式债务清理提交（9 个既有 client/tests 文件，无逻辑变更）；
  - Agent 协作契约规范（`docs/agents/` 与 `AGENTS.md`、`docs/dev/workflow.md`、`docs/dev/worklog.md`）提交；
  - Round-7 条件注入 v1（issue #16）T49–T53 Chrome 真机驱动测试、截图与报告归档；
  - 本地敏感凭据隔离（`.gitignore` 加入 `.scratch/`）。
- **Out-of-Scope（未触碰/未做）**：
  - 严格遵守开工门纪律，未在缺乏 Ready-to-code gate 下擅自修改 `src/` 业务逻辑；
  - 未执行未授权的 `git push`（当前处于 ahead 9 纯净本地状态，等维护者指令推送）；
  - 未擅自修改 `DECISIONS.md` D14 原文（留给所有者拍板定性）。

### 已确认术语和决策：
1. **产品定位**：个人单机 RP 玩具（D15），拒绝分布式锁、CAS 乐观锁防冲突矩阵、冷备加密等企业级过度工程。
2. **宿主映射**：Host-First 铁律，绝不自建 HTTP 服务器（0 行 `node:http` `createServer`）、绝不自建前端单页、绝不上私有 SQLite 连接池。
3. **权能分立与自然时序流**：
   - Author Agent 专注第三人称正文创作，严禁代打发言，严禁直接写状态；
   - Chronicler 异步推演物理与心理变化，按需扩展字段（D4/D5）；
   - 玩家就地矫正（Player Correction）为自然时序流（D6，Last-Write-Wins），矫正即真理；
   - 事实与走向分权（D22）：具体事实听 WorldState，剧情走向听剧情脉络 Summarizer。
4. **正文区纯净规范（D21）**：聊天流保持纯宿主原生打字机流式呈现，绝不在每轮正文之间插入插件内容，界面一律走右侧栏与舞台（Stage）页签。
5. **条件注入纪律（D17）**：仅允许数值/布尔路径比较（禁止自由字符串等值），单条 800 字/总量 2000 字封顶，按 skill id 字典序排序，外壳带穷尽声明与失效撤销句，档内波动去重。
6. **月停（Copilot）定位（D19/D22）**：玩家私属幕僚，负责出戏推演、技能包建议与卡包/文档提案暂存。

### 改动文件：
- **已提交至 Git（HEAD `bf577b3`，ahead 9 commits）**：
  - `scripts/host-runner.mjs`：自动化宿主管理脚本（直连派生 + 代理剔除 + 凭据换取）
  - `.gitignore`：增加 `.scratch/` 隔离本地会话凭据与运行日志
  - `docs/agents/domain.md`、`human-agent-contract.md`、`issue-tracker.md`、`triage-labels.md`：人与 Agent 协作真源
  - `AGENTS.md`、`docs/dev/workflow.md`、`docs/dev/worklog.md`：开发流程、工作日志规范与记录刷新
  - `docs/plans/conditional-injection-v1.md`：标记 issue #16 正式全量闭环
  - `src/client/` 与 `tests/` 下 9 个文件的 Prettier 排版格式对齐
- **本地只读测试归档（被 .gitignore 忽略，不污染分发仓库）**：
  - `dsh-rrp-test-report/E2E_BRIEF_ROUND6.md`、`TEST_REPORT_R6.md`、`screenshots/r6-*.png`（Round-6 舞台全项 PASS 证据）
  - `dsh-rrp-test-report/E2E_BRIEF_ROUND7.md`、`TEST_REPORT_R7.md`、`screenshots/r7-*.png`（Round-7 条件注入全项 PASS 证据）
  - `.scratch/dsh-host.json`（本地运行中宿主端口与 Token 元数据）

### 验证命令与结果：
- `git status`：`nothing to commit, working tree clean`（工作树 100% 纯净）
- `pnpm run format:check`：PASS（All matched files use Prettier code style）
- `pnpm run typecheck`：PASS（0 错误）
- `pnpm run lint`：PASS（0 错误，0 警告）
- `pnpm run build`：PASS（ESM 274.34 kB，CJS 226.85 kB 成功生成）
- `pnpm test -- --run`：PASS（**42 个测试文件、371 个测试用例 100% 全部通过**）
- `node scripts/host-runner.mjs status`：3099 端口活跃，PID 24484，`/dsh-rrp/cards` 返回 200 OK
- Round-6 真机抽查：T42–T48 全部 PASS（沙箱拦截、状态联动、输入保留、打字机 160 tok/s 无卡顿）
- Round-7 真机抽查：T49–T53 全部 PASS（跨档激活、高阶激活、撤销句生成、档内去重、真实正文口吻融入且零协议泄漏）

### 剩余风险或未决项：
1. **决策与文档表述张力（待拍板定性）**：
   - `src/card-import.ts` 包含酒馆卡（PNG/JSON）一次性转译导入功能，而 `HOST_ALIGNMENT.md` 与 `DECISIONS.md` D14 早期字面写着“核心引擎零酒馆代码”。
   - **待办**：需所有者拍板定性（例如确认：“D14 意在禁止运行时 ST 模拟兼容层，允许一次性导入转译工具”，并将结论更新至 `DECISIONS.md`）。
2. **远端代码同步**：
   - 本地 `main` 分支领先 `origin/main` 9 个提交，待所有者决定何时执行 `git push`。

### 阻塞及 Blocked by：
- **无任何技术或功能阻塞（Blocked by: None）**。
- 历史上的宿主启动卡死、舞台 Stage 真机缺口、条件注入真机缺口已**全部清除**。

### 下一步建议：
1. **选项 1（首推轻量收口）**：拍板 D14 文字张力，更新 `DECISIONS.md`，完成 `git push` 同步远端。
2. **选项 2（开启新特性研发）**：
   - 目标 A：**一卡一区（issue #37）**：卡包独立工作区隔离、存档独立归组与小说一键导出；
   - 目标 B：**世界线读档与分支重卷优化**：读档后舞台切面回跳、深层分支折叠与标注；
   - 执行前按规范在 `.scratch/<feature-slug>/spec.md` 建立规格，满足 Ready-to-code gate 后动笔。

## 2026-09-22 · Round-7 条件注入机制 v1 全量真机闭环（issue #16 PASS）

### 已确认与已完成

- **工作区基线原子化固化**：
  - 经维护者明确指令，将既有工作区拆解并完成 3 个原子提交：
    1. `6597d35 style: 清理既有 Prettier 格式债务`（覆盖 9 个客户端与单测文件）
    2. `8fb1c11 docs: 建立人与 Agent 协作契约与开发工作流规范`（docs/agents/ 与 workflow 落地）
    3. `fb2e190 tool(dev): 落地 host-runner 自动化启动方案并忽略本地暂存`
  - 工作树彻底收敛恢复为纯净基线（clean working tree）。
- **Round-7 条件注入机制 v1（issue #16）真机验收全项通过（PASS）**：
  - **T49（初始未激活态）**：好感 10（<40）时，`GET /dsh-rrp/lore` 返回 `injectedChars: 0`，`triggers` 中 `maid-mia-warm` 与 `maid-mia-intimate` 均为 `active: false`（截图：`screenshots/r7-t49-inactive.png`）。
  - **T50（跨档激活 ≥40）**：好感调至 42 时，`maid-mia-warm` 即刻翻转为绿色「生效中」徽章，`injectedChars: 388`；事实载荷中正确追加【条件注入 · 裁决块】，含穷尽声明与调用纪律（截图：`screenshots/r7-t50-warm-active.png`）。
  - **T51（高阶跨档激活 ≥80）**：好感调至 85 时，两条设定全部显示「生效中」，`injectedChars: 763`；注入块按 skill id 字典序排序输出（截图：`screenshots/r7-t51-intimate-active.png`）。
  - **T52（降档失效与撤销句）**：好感改回 20（<40）时，两条设定降档失效；事实通道精准生成撤销句（`撤销：以下条目现已失效，立即停止使用其内容——maid-mia-intimate、maid-mia-warm。`）；档内微调（20→25）不重复生成注入块（指纹去重生效）（截图：`screenshots/r7-t52-revoked.png`）。
  - **T53（真实正文承接与协议隔离）**：在好感 42 温热阶段下推进剧情，Author 创作正文生动融入温热期特质（敢小声吐槽茶一般并察言观色、缩脚上沙发），正文全篇零协议元文本渗漏；Chronicler 异步推演平稳触发（截图：`screenshots/r7-t53-prose-response.png`）。
- 编写任务书 `dsh-rrp-test-report/E2E_BRIEF_ROUND7.md` 与报告 `dsh-rrp-test-report/TEST_REPORT_R7.md`。
- 更新 `docs/plans/conditional-injection-v1.md`，正式标记 issue #16 全量闭环。

### 阻塞解除与未决项

- **阻塞解除**：issue #16 条件注入机制 v1 彻底完成真机闭环，不再有未验功能悬挂。
- **待决事项**：
  1. `HOST_ALIGNMENT.md §3.1` 酒馆卡导入 vs D14 字面冲突待拍板定性。
  2. 下一阶段玩法特性选型（如 issue #37 一卡一区，或新特性研发）。

## 2026-09-22 · Round-6 真机抽查全量闭环 + 宿主自动化启动方案落地

### 已确认与已完成

- **宿主启动方案落地与试错闭环**：
  - 定位旧 Agent 屡次卡在启动服务上的四大根因：1) 宿主启动未脱壳导致命令挂起；2) 3099 端口残留僵尸进程（EADDRINUSE）；3) 环境变量 SOCKS 代理污染导致 LLM 静默空响应；4) 缺少启动 Token 捕获导致首次浏览器访问 401。
  - 新增 `scripts/host-runner.mjs`：支持 `start`、`stop`、`status`；实现进程自动释放、代理环境变量剥离、直连 Node 派生、Launch Token 与 Session Cookie 自动捕获、健康探测及 `.scratch/dsh-host.json` 元数据落盘。实测 4~6 秒内一键稳定就绪。
- **Round-6 舞台 T42–T48 完整真机验收通过（PASS）**：
  - T42（空态与雁门舞台）：雁门客栈卡「孤灯客栈 · 案头」及 6 面板完整渲染；临时重命名 `ui/` 验证舞台空态提示「这张卡没有声明界面（ui/manifest.json）。」，不白屏不报错；恢复后即刻还原。
  - T43（随剧情刷新）：玩家推进一轮剧情（开锁探索尽头房间），流式结束后 Chronicler 异步推演（`ctx.jobs`），WorldState 与此刻场景自动无缝切换，在场人物与小动作实时同步，无需手动刷新。
  - T44（条件面板翻转）：通过 iframe 控制台将好感推至 41（≥40），「升温阶段」gauge（min 40, max 100）**从无到有动态出现**；通过右侧栏就地矫正调回 20（<40）保存后，该面板即刻消失。
  - T45（原语边界）：点击「问管家」唤起月停并预填不发送；右侧栏变更记录准确归因「你 · 玩家就地矫正」。
  - T46（P0 沙箱隔离）：iframe 自检两项全红拦截，父侧 `contentDocument` 为 null，安全红线未失守。
  - T47（输入保留）：iframe 输入框在外部触发世界状态刷新后，文本内容与滚动状态完整保留。
  - T48（流式刷新成本）：常驻舞台页签下长正文流式打字机生成平滑，无卡顿闪烁，宿主底部测定 160 tok/s，缓存命中 96%，`useProjection` 订阅开销极低。
- 截图证据归档至 `dsh-rrp-test-report/screenshots/`（`r6-t42-*.png`、`r6-t44-*.png`、`r6-t48-*.png`），`TEST_REPORT_R6.md` 更新为全项 PASS。

### 阻塞解除与未决项

- **阻塞解除**：Round-6 舞台（issue #18）真机验收正式闭环通过；真机缺口不再阻塞后续 Ready-to-code gate。
- **待决事项**：
  1. `HOST_ALIGNMENT.md §3.1` 酒馆卡导入 vs D14 字面冲突仍待所有者拍板定性。
  2. 工作区改动提交策略（建议拆分为：1. 格式债务清理；2. Agent 协作契约规范；3. host-runner 与真机验收归档）。

## 2026-09-22 · 内置浏览器复验 Round-6（前序）

### 已完成

- 使用 Codex In-app Browser 启动本地宿主并打开仓库版「女仆大小姐」卡局。
- 复验舞台页签、声明式面板、月停问管家预填、沙箱 SecurityError/CSP 双拦截、状态刷新后 iframe 输入保留。
- 重跑 format、typecheck、lint、全量测试（42/371）与 build，均通过。
- 详细结果已追加到 `dsh-rrp-test-report/TEST_REPORT_R6.md`。

### 未完成与阻塞（已被后序全量闭环解决）

- T43、T44、T48 仍缺完整真机证据；T42 缺无 `ui/` 卡空态证据。
- iframe 快速行动按钮被浏览器自动化安全层拒绝，无法完成好感阈值翻转。
- Round-6 当时未能标记完整通过，Ready-to-code gate 保持阻塞（关闭：2026-09-22 由 Chrome DevTools 驱动与 host-runner 全量闭环）。

## 2026-09-21 · Round-6 基线刷新与验证（自动化完成，真机待补）

### 已确认

- 执行前基线为 `main...origin/main [ahead 5]`；工作区有 13 个已跟踪改动文件，以及 `.scratch/`、`docs/agents/` 未跟踪目录。
- 已将 `dsh-rrp-test-report/E2E_BRIEF_ROUND6.md` 的代码基线从 `97653a3` 刷新为当前 `HEAD 3785de2`，并注明工作区另有未提交格式/文档改动。
- 格式债务票据只覆盖 9 个 `src/client` / `tests` 文件；已在规格中明确测试 seam 为 N/A + 现有全量 Vitest 回归，并在票据中明确不覆盖其他文档与 Round-6 brief。

### 新鲜验证

- `git diff --check`：通过，退出码 0。
- `pnpm run format:check`：通过。
- `pnpm run typecheck`：通过。
- `pnpm run lint`：通过。
- `pnpm test -- --run --reporter=dot`：通过，42 个测试文件、371 个用例；stderr 仍有既有 controlled-input warning、故意失败路径日志和宿主缺失服务的降级日志。
- `pnpm run build`：通过，ESM/CJS 产物生成成功。
- 清除代理变量后启动 `dsh --profile rp-dev --port 3099 --no-open`：成功；日志确认 7 个投影、Chronicler、Summarizer、卡包/舞台/设定集/月停/世界线路由已挂载。临时宿主已停止。
- 只读 HTTP 冒烟：宿主带 Cookie 页面、`/dsh-rrp/cards`、米娅/雁门 manifest、米娅 `console.html` 均返回 200。
- 已创建 `dsh-rrp-test-report/TEST_REPORT_R6.md`，明确区分自动化前置验证与尚未执行的 T42–T48。

### 未完成与阻塞

- 当前会话没有 Chrome DOM/点击/截图自动化能力，T42–T48 未执行，不能将 Round-6 标记为真机通过。
- `~/.dsh/.dsh-rrp/cards/maid-heiress/` 用户卡副本仍存在；正式测仓库版米娅前需按 brief 移动避让，测试后还原，不能删除。
- 当前工作区仍混合格式债务、Agent 协作基线、条件注入计划状态和 Round-6 文档；不能把整个 dirty worktree 宣称为单一格式切片或 Ready-to-code。

### 下一步

1. 由具备 Chrome 真机操作能力的测试 Agent 按最新 brief 执行 T42–T48，并补充报告与截图。
2. 真机证据到位后，再由维护者决定当前混合改动的逻辑分组提交策略；在此之前不进入新的 `src/`、`tests/` 或构建配置实现。
3. 条件注入 v1 仍以 T1–T8 已实现、等待真机证据为准，不重复实现。

## 2026-09-21 · 首个代码基线切片

### 已确认

- 盘点确认条件注入 v1 的 T1–T8 已有实现、测试和 UI；原计划状态“待动工”已经过期，下一轮重点是 Round-6 真机抽查，不重复实现这条能力。
- 本轮代码修改限定为清理既有 Prettier 格式债务：9 个源码/测试文件，只接受排版变化，不改变逻辑或契约。

### 已落盘

- 新增 `.scratch/format-debt/spec.md` 与 `.scratch/format-debt/issues/01-prettier.md`，票据状态已改为 `resolved`。
- 更新 `docs/plans/conditional-injection-v1.md`，反映 T1–T8 已完成、等待真机验证。
- 对 9 个既有文件运行 Prettier；未进入新功能代码实现。

### 新鲜验证

- `pnpm run format:check`：通过。
- `pnpm run typecheck`：通过。
- `pnpm run lint`：通过。
- `pnpm test -- --run`：通过，42 个测试文件、371 个用例。
- `pnpm run build`：通过，ESM/CJS 构建产物生成成功。
- 本机宿主冒烟：`dsh --profile rp-dev --port 3099 --no-open` 启动成功；日志确认 7 个投影、Chronicler、Summarizer、卡包/舞台/设定集/月停/世界线路由均已挂载，浏览器插件面板可读；测试进程已退出。

### 下一步

1. 用当前干净基线刷新 Round-6 真机 brief，并验证条件注入跨档、生效标记和降档撤销句。
2. 真机证据到位后，再从新的用户可验证玩法切片建立 `.scratch/<feature-slug>/spec.md`，不要继续扩写已完成的条件注入机制。

## 2026-09-21 · 人与 Agent 交互契约

### 已确认

- 维护者保留产品目标、优先级、体验取舍、不可逆操作和最终集成权；primary Agent 负责查证、编排、实施、验证和落盘；delegated Agent 只在明确票据范围内工作。
- 当前任务范围内的可逆阅读、文档、实现和验证默认直接推进，不为常规小选择反复请求确认；产品歧义、规则冲突、外部写入和不可逆决定才停下来提问。
- 提问采用“术语先行 + 多选项 + 30+20 检查点”；事实由 Agent 查证，确认内容立即写入唯一文档来源。
- `继续`、`采用 A`、`只读盘点`、`只改文档`、`先落盘`、`暂停`、`停止`、`重做` 已定义为跨会话可复用的控制词。

### 已落盘

- 新增 [`docs/agents/human-agent-contract.md`](../agents/human-agent-contract.md)，作为人和 Agent 的交互、汇报、上下文交接与完成条件的详细真源。
- `AGENTS.md` 与 `docs/dev/workflow.md` 只增加入口指针，避免复制同一套交互规则。

### 下一步

1. 以本契约接手下一项真实工作；开工时先做只读盘点，再把第一个可验证垂直切片写入 `.scratch/<feature-slug>/`。
2. 如果实际使用中出现重复提问、权限边界或交接格式不适用，把具体例子追加到本条并修改契约，不在聊天里形成第二套规则。

## 2026-09-21 · Agent 协作基线整理

### 已确认

- Matt Skills 作为日常主流程；Superpowers 只在项目启动、隔离工作区、系统性调试、TDD、完成验证和分支收尾等明确场景使用。
- 本项目继续以 `docs/reference/GLOSSARY.md`、`docs/DESIGN.md`、`docs/HOST_ALIGNMENT.md`、`docs/reference/DECISIONS.md` 和 `docs/dev/*` 作为唯一语义与流程来源，不创建平行 `CONTEXT.md` / `docs/adr/`。
- 需求、规格与任务票据采用本地 Markdown，约定见 `docs/agents/issue-tracker.md`；不会因为远程 GitHub 仓库存在就把日常协作状态外置。
- 本轮只整理 Agent 协作内容，不修改 `src/`、`tests/`、构建配置或运行逻辑。

### 已落盘

- 新增 `docs/agents/domain.md`、`docs/agents/issue-tracker.md`、`docs/agents/triage-labels.md`，为 Matt Skills 提供项目内文档和票据映射。
- 更新 `AGENTS.md`，明确人和 Agent 的分工、Matt/Superpowers 路由和 Ready-to-code gate。
- 重写 `docs/dev/workflow.md`，把术语统一、30+20、自检、确认即落盘、冲突检查、任务切片和完成验证串成可执行流程。

### 新鲜工程基线

- `pnpm run typecheck`：通过。
- `pnpm run lint`：通过。
- `pnpm test`：通过，42 个测试文件、371 个用例。
- `pnpm run format:check`：未通过，Prettier 报告 9 个既有 `src/client` / `tests` 文件；与本轮 6 个文档改动没有重叠，留作独立格式债务。
- 旧条目中“未提交改动、等待提交分组”的状态已经过期；当前 `main` 工作区干净，相关改动已分别落在 `a042b7e`、`f7edf17`、`9477a81`、`8c57b3b`、`3785de2`。

### 下一步

1. 把格式债务单独建票据；不要把它混入下一项功能或本轮协作规范整理。
2. 由所有者拍板 `HOST_ALIGNMENT.md` §3.1 的酒馆卡导入与 D14 字面张力。
3. 刷新 Round-6 真机 brief 的基线后，再从条件注入 v1 的最小垂直切片开始走 Ready-to-code gate。

---

## 2026-09-21 · 工作区盘点 + locale 红线修复 + 流程落地

### 盘点结论（冲突检查第 5 节执行结果）

工作区有一批**内聚度很高**的未提交改动（23 文件 +383/−1257，另有 8 个新文件），分六组：

1. **前端面板组件化**：世界状态页签拆 `components/world-state-{primitives,sections,dynamic}.tsx`；
   世界线页签重写为 Galgame 流程图（新增 `worldline-flowchart.tsx` / `worldline-inspector.tsx` / `worldline-layout.ts` + 布局测试）。
2. **循环依赖拆叶**：`stage-types.ts`（舞台共享类型）、`lore-drafts.ts`（lore 草稿暂存），均为原样 re-export，调用方路径不变。
3. **worldline-tree 折叠修复 + 特性**：孙代分叉被断成 root 的缺陷修复（`findNodeInLineage` 沿祖先上溯）；
   新增 `pending` 占位节点（零回合新 fork 显示「新分支起点」）。均有测试背书。
4. **文档跟随**：5 投影→7 投影、`ctx.storage`→`ctx.storageDomain`、5 智体名单、dsh-synapse 撤装等，全部为追代码的一致性更新，未发现语义冲突。
5. **已登记张力（待所有者拍板）**：`HOST_ALIGNMENT.md` §3.1 —— 酒馆卡导入与 D14 的字面冲突按「已知例外」记录，不改 D14 原文。
6. **基线健康**：typecheck / lint / vitest 全绿（41 文件 369 用例）。

### 本轮已修

- **locale 红线违例**：世界线新组件用了 15 个未注册字典键（`worldline.totalNodes` 等），此前靠硬编码中文
  `?? '…'` 兜底，违反 HOST_ALIGNMENT「UI 文案必须走 locale」红线，英文界面有显示裸键名风险。
  处置：字典抽为叶模块 `src/client/locales.ts`（沿用 stage-types / lore-drafts 先例），15 键补 ZH/EN；
  新增守卫测试 `tests/locale-keys.spec.ts`（ZH/EN 键集相等 + 源码所用键均已注册），把红线变成自动检查。
  注：组件里的 `?? '中文兜底'` 现已成为不可达死代码，下次触碰这些文件时顺手移除。
- **流程落盘**：新增 `docs/dev/workflow.md`（术语先行 → 30+20 拷问 → 确认即落盘 → 编码前冲突检查 → DoD），
  AGENTS.md §3 与 DEVELOPMENT.md 已挂指针。

### 待决事项

| 事项 | 阻塞什么 | 归属 |
| :--- | :--- | :--- |
| HOST_ALIGNMENT §3.1 酒馆导入 vs D14 的字面冲突拍板 | 导入功能的文档定性 | 所有者 |
| 未提交改动的提交策略（按逻辑分组切提交 or 一把梭） | 进入下一特性前的干净基线 | 所有者 |

### 待执行（按建议顺序）

1. **提交检查点**：上述六组改动测试全绿，建议按组切 3–5 个逻辑提交（组件化 / 拆叶 / worldline 修复+特性 / locale 修复 / 文档跟随）。
2. **Round-6 真机抽查**：brief 在案（`E2E_BRIEF_ROUND6.md`，T42–T48 舞台页签），但基线标注为 `97653a3`，已落后当前 HEAD，执行前先刷新 brief 的对照基线。
3. **条件注入 v1（issue #16）**：`docs/plans/conditional-injection-v1.md` 设计已对齐（R1 评审五条全采纳），T1–T8 待动工。

### 接手复核（2026-09-22）

- 接手时基线：`HEAD=0350a68`，`main` 与 `origin/main` 同步，工作树干净；上一节关于“未提交改动”和条件注入待动工的描述属于历史快照，不再代表当前状态。
- 条件注入 v1 的 T1–T8 已实现，计划文档与 Round-7 真机报告均标记正式闭环；当前 `.scratch/` 只有已 `resolved` 的格式债务票据，没有可直接领取的 `ready-for-agent` 代码票据。
- 本机复核（Linux、Node `v22.22.1`、pnpm `12.4.1`）：`format:check`、`typecheck`、`lint`、`pnpm test -- --run` 均通过；`pnpm run build` 在 tsdown 配置加载阶段失败，因当前 Node 的 `process.features.typescript=false`，tsdown 自动选择未安装的可选 `unrun` loader。项目开发基线要求 Node `v24.16.0` / pnpm `10.14.0`，故该失败先记为运行时基线不一致，未改动依赖或源码。
- 下一道开工门：先由所有者拍板 `HOST_ALIGNMENT.md` §3.1 的 D14/酒馆卡一次性导入张力，并明确下一项需求；若要重新声称构建全绿，先把本机运行时对齐到项目基线。

### Windows/Linux 共享基线落地（2026-09-23）

- 所有者确认需要把跨机协作规则落盘并通过 GitHub 共享；采用单一 `main` 共享基线 + 按功能命名分支，不建立按操作系统长期分叉。
- 新增 `.node-version`（Node `24.16.0`）、`package.json` 的 `packageManager`（pnpm `10.14.0`）与 `scripts/check-environment.mjs`；安装和构建会拒绝未对齐的运行时，避免再次出现 Node 22 下的 tsdown loader 误报。
- 新增 `CONTRIBUTING.md` 与 GitHub Actions `quality.yml`；详细开发协议集中在 `docs/DEVELOPMENT.md`，README 与 AGENTS 只保留入口指针。
- 本轮只修改文档、版本/协作配置与环境检查脚本，不修改业务逻辑；尚未提交或推送 GitHub。
- 验证结果：`format:check`、`typecheck`、`lint`、Vitest `42` 文件 / `371` 用例、`docs:build` 与 workflow YAML 解析均通过；当前 Linux 的 `check:environment` 与 `build` 按设计因 Node `22.22.1` 不等于 `24.16.0` 而阻断，pnpm 已由 Corepack 对齐为 `10.14.0`。
- 复核共享文档时发现 `reference/HOST_SEAMS.md` 仍含旧 Windows 本机绝对路径，已改为 `HOST` / `WRK` / `SRC` 的跨平台本机占位约定；归档目录中的历史路径不作为当前协作规则。

### Linux 工具链对齐与宿主冒烟验证（2026-09-23）

- Linux 安装并启用 nvm `v0.40.3`，Node.js 对齐到 `v24.16.0`；pnpm 通过 Corepack 对齐到 `10.14.0`，`pnpm run check:environment` 通过。
- 依赖使用 `CI=true pnpm install --frozen-lockfile` 完成；期间发现用户级 npm 配置残留失效代理 `127.0.0.1:7890`，清理后 registry 访问恢复，未修改仓库 lockfile。
- Linux 原有 DSH CLI 为 `0.1.7-alpha.1`，已安装项目基线 `@deepseek-ai/dsh@0.1.6-alpha.2`；从 `web` 模板生成 `rp-dev`，并以 POSIX 目录 symlink 注册当前 checkout。
- Node `24.16.0` 下 `format:check`、`typecheck`、`lint`、Vitest `42` 文件 / `371` 用例和 `build` 全部通过；tsdown 正常生成 host/client 产物。
- Linux host-runner 冒烟通过：12/12 个关键插件启动标记出现，`GET /dsh-rrp/cards` 返回 200（2 张卡），缺少 session 参数的 activity 请求按契约返回 400；随后 host 干净停止，3099 端口空闲且 runner 状态文件已清理。
- 本轮未执行依赖真实 LLM 凭据和浏览器交互的完整游玩流程；该部分仍以已有真机报告为依据，Linux 本次结论限定为工具链、profile、宿主加载和只读路由冒烟通过。


### WorldState v2 真机验收与热修（2026-09-25，feat/world-state-v2）

- 宿主环境：本机全局 npm `@deepseek-ai/dsh@0.1.6-alpha.2` 与基线一致；用户在桌面备好同版本 tarball 备查。发现 `~/.dsh/.dsh-rrp/cards/maid-heiress` 为 9/20 的 v1 残留卡且优先于随包卡，导致 `when` 注入报旧路径语法错误；已移出为 `maid-heiress.v1-stale-20260920`，启动日志恢复干净。
- 内置浏览器走通票据 08 全部真机验收：双卡新建会话（maid-heiress 主线4 / yanmen-inn 主线2）、主区+右侧栏共享草稿双向同步、玩家矫正预览→确认→`actor: player` 入 timeline、真实 Chronicler 提交 13 项变化（`actor: chronicler`）、`Session.fork` 子线只继承物理前缀且本地批次 `origin: local` 边界正确、hidden 内容不进玩家视图。票据 08 已置 `resolved`，证据写在票据内。
- 真机暴露并修复四个代码级缺陷（均含回归测试，Vitest 55 文件 / 416 用例全绿）：① 玩家矫正对任何带 hidden 内容的卡必失败（缺失改为从 prior 恢复，改写/新建仍拒绝）；② Chronicler 值漂移（definition 自造词、裸名引用、1e999→Infinity）加确定性信封修复；③ Chronicler 结构漂移（空集合无样例）加 prompt 结构样例块 + 一次带 issue 列表的引导重试；④ diff 的 added/deleted 侧显式 undefined 被宿主事件日志拒绝（省略缺失侧）。另加可观测性：校验失败附 zod issue 路径、`DSH_RRP_DEBUG_DUMP` 落盘畸形回复、appendLane 拒绝时报首个不可序列化路径。
- 已知遗留：主区世界状态页签在左侧栏折叠为图标轨时左侧被裁约一栏宽（宿主 slot 布局上下文，展开侧栏正常），记于票据 08 备查。
- 最终质量门：format / typecheck / lint / Vitest 416 / build / git diff --check 全绿。未提交未推送，等所有者决策。
- 左侧裁切修复（同日追加）：根因定位为世界状态工作区在窄容器下的横向溢出——`overflow-y:auto` 使 overflow-x 按规范计为 auto，焦点落到换行字段行右缘时浏览器自动持久横向滚动（scrollLeft），整面板呈现左侧裁切；flex 项默认 `min-width:auto` 加剧溢出。修复：`S.root` 补 `width:100%/minWidth:0`，`S.scroll` 显式 `overflowX:'hidden'`。内置浏览器真机 A/B 复验（图标轨/展开侧栏 × 右栏开合 × 字段聚焦）均渲染正常。质量门复跑全绿。


### 世界线 v2 重做：研究、决策落盘与开工（2026-09-25，feat/worldline-v2）

- 重做前双份勘察（源码 + 宿主 0.1.6-alpha.2 逐条核实）：现有实现确认 6 项结构性 bug——digest 500 上限与 fork 切口计算冲突、异步徽标糊尾节点、徽标只增不删、冷线挂父线尾部、「读档」只开会话末尾、V2 时间线零接入。宿主侧确认：无会话删除/回退 API（软归档为唯一清理）、无 fork 事件（`session/created` + `header.parentSession/isSeeded` 推断）、`sessionQuery.traceSession/readSession` 可拿冷线真实切口、`conversation.view` 可注册第三视图、宿主原生「轨迹」= 单会话执行轨迹（与世界线互补不替代）。
- 决策落盘：DECISIONS.md 新增 **D24**（16 题拷问访谈全部按建议锁定：双栏视图替代 galgame SVG、拓扑与 digest 解耦、徽标全量重建 + `stateFoldSeq`/`summaryTurn` 对齐、时间线 provenance 接入、fork 切口标记走父线 `source.rrp.worldlineForkCut` 追加、冷线精确切口/位置未知诚实标注、读档诚实语义 = 查看该回合 + 从此分叉）；GLOSSARY §3 新增 分叉切口 / 节点徽标 / 从此分叉 / 位置未知。
- 规格与票据：`.scratch/worldline-v2/spec.md`（契约到字段级）+ 票据 01（服务端数据层）/ 02（客户端双栏重写）/ 03（集成验收）。Ready-to-code gate 已过：无新事件类型（切口标记走既有 `user/message` source.rrp）、不自建分支库、不同步读日志、D21 各自渲染面、D10 拓扑只映射宿主 fork。
- 契约类型已先落盘：`src/worldline-digest.ts`（v2 词汇：绝对回合计数 nextTurn/firstLocalTurn/forkCuts/meta/seedTurnsOf）、`src/worldline-tree.ts`（fact/node 增 seedKnown/headTurn/isHead/meta）、`src/state-payload.ts`（RrpStatePayload 增 worldlineForkCut）。发现并已纳入规格的关键护栏：transcript 投影 payload 分支对**任何** payload 消息推进 `lastStateSeq`，纯切口标记会误导 Chronicler 跳过未推演正文——改为仅 `worldState`/`summary` 键推进。
- 分支 `feat/worldline-v2` 已从 main（a64b52a）切出，进入票据 01 实现。


### 世界线 v2 一期交付与真机验收（2026-09-26，feat/worldline-v2）

- 一期范围（D24）：数据三根支柱（拓扑与 digest 解耦 / 徽标按 `stateFoldSeq`·`storyTurn` 对齐 + 全量重建删除语义 / 时间线 provenance 接入节点）+ fork 切口标记（`source.rrp.worldlineForkCut` 追加父线，digest 上限保护切口节点）+ 冷线 `sessionQuery` 精确定位 + 客户端双栏视图（分支列表 + 虚拟化回合列 + 从此分叉确认层/重命名/收起确认与恢复/当前回合精确标记/投影订阅自动刷新）。galgame SVG 流程图及 layout/inspector 组件与对应测试已删。
- 真机验收（宿主 0.1.6-alpha.2，host-runner 起 3099 + 内置浏览器，女仆大小姐新开局三轮真实游玩）逐项通过：徽标 + 归因行（状态推演·本线 17 项变化）自动落在正确回合；分叉确认层自动命名「·线N」（N=服务端真实子线数）、自定义命名、创建即打开、binding 就绪即改名（旧 8×400ms 轮询废除）；收起确认层（明示下游数）→ 已收起区 → 恢复；主线不误标位置未知；冷支线/切口/主线三类降级语义全部符合 D24。
- 验收暴露并修复五个真 bug（全部含回归测试，全量 58 文件 / 445+ 用例待最终计数见质量门）：① `diffWorldState` 全局字段变更产出显式 `objectId: undefined` 触发宿主事件日志 serializability 拒绝，Chronicler 整轮失败；② Chronicler 省略空集合（globalFields/objectives 等）的回复无信封补全，一次引导重试不够——`repairChroniclerEnvelope` 确定性填充缺失集合，issue 列表同享修复；③ 折叠器把无父会话的主线也标 `位置未知`；④ 分叉确认层回合标签错用 `branch.latest` 而非选中节点；⑤ 宿主侧三连缺陷落盘 HOST_SEAMS D14——`readSession` 对一切 seeded 会话必抛（snapshot 不变量 vs end-seed 标记）、storageDomain 同 domain 不可二次打开（fatal）、持久化 `agentPreset` 不可靠（画廊主线落盘 "standard"）。
- 对宿主缺陷的插件侧兜底（可重建显示层缓存，不复制宿主真源）：`worldline-store` 增 cards 表（live rrpCard 投影旁路缓存，救冷主线整棵消失）与 cuts 表（fork 时刻观察到的精确切口，fork-marker onCut 落盘；冷 fork 不再依赖坏掉的 readSession，全冷状态下切口已知的子线正确挂载且不标位置未知）。store 全插件共享单 handle（index.ts 打开一次，路由/监听共用）。
- 工具链：`scripts/host-runner.mjs` 的 dsh 定位修复——dsh 包无 main/exports，`require.resolve` 裸包必失败，改为直接探测 `lib/bin.js`（仓库 node_modules → 全局 npm root）。
- 质量门全绿（format/typecheck/lint/vitest/build/git diff --check）。票据 01/02/03 已闭环，`.scratch/worldline-v2/` 规格与票据保持未跟踪。
- 已知遗留：cuts 表建立前 fork 的旧冷线仍「位置未知」（打开一次后卡归属入索引，属诚实降级）；宿主 readSession 修复后经宿主解析的路径已留好（cachedCut 优先、readSession 兜底）。运行中的宿主进程加载的是 prettier 重排前的等价构建，功能一致，下次重启自动生效。
