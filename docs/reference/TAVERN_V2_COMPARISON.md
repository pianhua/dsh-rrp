# dsh-tavern-v2 对标分析报告

> 目的：从 dsh-rrp 的产品与架构边界出发，学习 D:/projects/dsh-tavern-v2 的可复用经验；不改变 dsh-rrp 的 Host-First、Session Projection、Skills、原生 Fork 与个人玩具定位。
>
> 证据范围：对标项目工作区文件、README/TUTORIAL/AGENTS、lib/index.js、客户端 bundle、65 个 Node 测试，以及 dsh-rrp 当前设计和 365 个测试（40 个测试文件）。

## 1. 结论摘要

两个项目不是同一条产品路线：

- dsh-tavern-v2 是酒馆生态兼容层，重点是导入 SillyTavern 角色卡/世界书、管理 Agent 预设、注入提示词、记忆和关系网。
- dsh-rrp 是原生 DSH 的 RP 模式，重点是 Author / Chronicler / Summarizer 分权、WorldState 投影、Skills 按需知识、玩家矫正、原生 Session.fork 和受控知识沉淀。

可以借鉴的不是它的自建存储或提示词注入架构，而是它在真实使用中形成的可观测性、权威来源、迁移修复、回归测试和错误诊断方法。

## 2. 对标项目事实地图

- 角色卡、世界书、预设导入与编辑，兼容 PNG/JSON 的 SillyTavern 数据。[README.md:53-68](../../dsh-tavern-v2/README.md#L53-L68)
- 每个会话绑定一个预设，切换会话时按会话选择注入；角色卡、世界书和词条影响后续生成而不改历史。[README.md:105-134](../../dsh-tavern-v2/README.md#L105-L134)
- 世界书支持全文或关键词触发，教程把关键词模式作为节省上下文的推荐路径。[TUTORIAL.md:35-49](../../dsh-tavern-v2/TUTORIAL.md#L35-L49)
- 记忆总结、关系网、剧情选项和回复体检是围绕可用性和排错增加的产品功能。[README.md:64-68](../../dsh-tavern-v2/README.md#L64-L68)
- 服务端主要逻辑集中在约 4,146 行的 lib/index.js，客户端为预构建 bundle；项目规范明确要求服务端自包含。[AGENTS.md:16-48](../../dsh-tavern-v2/AGENTS.md#L16-L48)
- 它使用 ctx.systemPrompt.section()、ctx.webServer.register() 和 ctx.effect()，但仍自建大量 API、JSON 文件存储、HTML 设置页和客户端 DOM 操作。[lib/index.js:2711-2752](../../dsh-tavern-v2/lib/index.js#L2711-L2752)

## 3. 值得采纳的经验

### P0：建立注入体积与命中情况可见性

对标项目实测全量世界书达到 138,408 字符，并发现提示词尾部先被截断；它因此记录每个注入段的字符数，提供当前/全量/关键词三档估算和 60%/90% 告警。[CHANGELOG.md:196-229](../../dsh-tavern-v2/CHANGELOG.md#L196-L229)

映射到 dsh-rrp：不引入 Lorebook 或关键词注入；在不改变 Skills 语义的前提下，为 Author/Chronicler/Summarizer 记录本轮上下文来源和估算体积，区分卡包 Skill、沉淀 Skill、WorldState、Summary、Transcript。优先复用 Activity/宿主任务可见化路径，不新建 DevConsole 或日志数据库。

验收标准：能回答“这一轮模型看到了哪些来源、各占多少、为什么没有加载某个 Skill”，且诊断数据不进入会话正文。

### P0：审计所有注入路径共用一个会话资格判据

对标项目曾只给角色卡/世界书加隔离，却漏掉 NSFW 和事实修正段，导致标准会话仍收到 1,819 字符；后续抽出统一判据并增加回归测试。[CHANGELOG.md:3-29](../../dsh-tavern-v2/CHANGELOG.md#L3-L29)

映射到 dsh-rrp：已有 RP preset gate、投影注册 gate 和 Copilot/Sediment 会话检查，但应审计所有读取、写入、后台任务和 UI 订阅。矩阵至少覆盖当前 Session、preset family、父子 Agent 继承、fork 继承、非 RP Session 拒绝。这是审计与测试补强，不是新增锁或会话数据库。

### P1：把权威来源优先级写成纯函数并覆盖回归

对标项目解决了 DSH 顶部预设选择和插件 session-bindings.json 冲突：DSH 会话事件流优先，插件文件仅作兼容兜底，并测试过期绑定不得翻盘。[CHANGELOG.md:64-103](../../dsh-tavern-v2/CHANGELOG.md#L64-L103)

映射到 dsh-rrp：卡包选择以 Session 当前 preset/card projection 为权威；WorldState 以 Session projection 为权威；Sediment 以 projection 为世界线真源，旧 sidecar 只允许一次迁移。内存缓存、客户端快照和活动账本只能是派生视图。

### P1：吸收迁移与启动修复的幂等方法

对标项目发现把 sessions 放进 agent preset 根目录会让宿主把它误识别为坏预设，随后把会话数据迁出，并测试空壳目录、非空目录、目标已存在和重复执行。[CHANGELOG.md:164-194](../../dsh-tavern-v2/CHANGELOG.md#L164-L194)

映射到 dsh-rrp：继续坚持 Session 数据走宿主持久化、沉淀走 projection，不复制文件目录方案；但借鉴“启动修复必须幂等、有数据不丢、目标存在不覆盖、失败保留源”的迁移验收标准，适用于未来版本升级、旧沉淀迁移和 preset materialization。

### P1：错误诊断提供证据，不只显示失败徽标

对标项目的回复体检展示命中词、引用片段和分数；故障记录还复盘了诊断脚本自身造成假阴性的问题。[CHANGELOG.md:105-130](../../dsh-tavern-v2/CHANGELOG.md#L105-L130)

映射到 dsh-rrp：优先用于 Chronicler、Summarizer、Copilot 和沉淀任务，显示任务阶段、Session、输入来源、失败原因、是否写入、是否因 stale/no-change 被丢弃。Activity ledger 是合适承载点，不把诊断文本塞进正文或 WorldState；关键诊断应记录测量口径。

### P1：继续保持纯函数边界和反例测试密度

对标项目的 65 个测试集中覆盖世界书匹配、YAML 块边界、变量清理、上下文预算、迁移、拒绝检测和会话预设权威性，其中多项明确针对历史 bug。[tests/core.test.js:8-20](../../dsh-tavern-v2/tests/core.test.js#L8-L20)

映射到 dsh-rrp：保持当前 365 个测试的领域测试方式；新增测试优先覆盖投影折叠、路由校验、fork replay、cleanup、任务 stale/no-change、宿主缺能力降级、Skill scope 和非法输入不写入。

## 4. 可借鉴但不进入核心

| 对标能力 | 处理结论 | 原因 |
|---|---|---|
| 角色卡 PNG/JSON 导入 | 独立 AI 转译工具/Skill | D14 不让核心兼容酒馆字段 |
| 关键词世界书 | 不迁移到核心 | D7 已选择 Skills 按需加载 |
| 记忆总结 | 只对标产品诉求 | dsh-rrp 已有独立 Summarizer，长期记忆按 D12 外置 |
| 关系网 | 未来可选视图/扩展 | 不成为 WorldState 或新的会话真源 |
| 剧情选项 | 卡包级可选输出协议 | 不硬编码全局提示词，也不能替玩家代打 |
| 回复体检 | 低优先级诊断面板 | 只报告输出状态，不规避模型安全策略 |
| 玩家名/变量归一化 | 导入转译规则 | 不增加酒馆变量运行时 |

## 5. 明确不采纳的架构与风险

1. 自建 HTTP server、第二端口或平行 API 层；dsh-rrp 只能使用宿主 Web Server。
2. HTML 设置页、自制 SPA、全局浮动按钮和 DOM 事件委托；dsh-rrp 继续使用原生 Slot、右侧栏和宿主 primitives。[lib/client.js:4-31](../../dsh-tavern-v2/lib/client.js#L4-L31)
3. JSON sidecar 作为会话真源；会破坏 Session.fork 的世界线语义。
4. 把所有逻辑堆进一个 host 文件；应继续按 dsh-rrp 的领域模块分层。
5. 全局提示词硬编码破限、强制剧情推进或替玩家发言；与 Author 零代打和项目边界冲突。
6. 模块级 lastSessionId 或全局猜当前会话；应从当前 Agent/Session 上下文和 projection 读取。
7. 大量 catch {} 作为正常降级；应保留用户可见任务状态和结构化失败原因。

## 6. 建议实施顺序

### 第一阶段：只做证据与审计

- 建立注入来源/体积的纯统计模型，先不改变 Skills 选择策略。
- 画出 Session/preset/Agent/fork 资格矩阵，逐条覆盖现有入口。
- 为已有 Activity ledger 增加任务阶段、结果类型和失败证据。

### 第二阶段：补测试和小型诊断 UI

- 为矩阵、迁移幂等、动态字段、Skill scope、fork replay 增加回归测试。
- 在现有 WorldState/Copilot/Sediment 面板中增加简短诊断状态，不新增独立控制台。

### 第三阶段：再评估可选产品能力

- 关系网只作为非权威视图评估。
- 剧情选项只以卡包级 Skill/协议评估。
- 酒馆卡导入只在独立转译工具成熟后接入，不改核心领域词汇。

## 7. 当前验证基线

- 对标项目：pnpm test 通过，65/65 tests passed。
- dsh-rrp：pnpm run typecheck 通过；pnpm test 通过，40 个文件、365 个测试通过。
- 本报告没有修改源码或核心架构；后续实施应从第一阶段的审计/统计测试开始。

> 测试数字随开发滚动，本节的计数以撰稿时的 `pnpm test` 实跑为准；日常以命令输出为真，勿把此处的数字当契约。
