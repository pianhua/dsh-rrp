# AGENTS.md — dsh-rrp 开发者与 AI 协作准则

> **项目代号**：`dsh-rrp`（DSH-Chronicle 现代重启版 · 个人单机沉浸式 RP 插件）  
> **核心定位**：面向 DeepSeek Harness（DSH）的**正统薄插件**，专为个人单机游玩打造的高品质角色扮演与交互小说引擎。  
> **设计基准**：严格以 [`docs/DESIGN.md`](docs/DESIGN.md) 为唯一目标规格，以 [`docs/HOST_ALIGNMENT.md`](docs/HOST_ALIGNMENT.md) 为宿主能力映射准则。  
> **防漂移记录**：`docs/reference/` 保存决策理由、标准术语、社区经验与旧项目教训（**本地开发工作区，不随仓库分发**）；**改动设计前必读其中的 `DECISIONS.md`**。

---

## 1. 核心哲学与不可动摇的铁律

### ① 个人玩具定位，拒绝过度工程（Personal Toy First）
- 本项目是**面向个人本地游玩的高级玩具**，未来开源也是单人单机部署形态；
- **坚决杜绝**企业级复杂基建：严禁引入分布式锁、多进程租约锁、冷备加密、CAS 乐观锁防冲突矩阵、并发压力测试、多租户鉴权等无谓复杂度；
- **简单透明至上**：代码逻辑必须清晰直白，任何人一眼就能看懂数据流向。

### ② 100% 正统 DSH 插件规范，拒绝重复造轮子（Host-First）
- **绝不自建平行世界**：严禁自建 HTTP 服务器（0 行 `node:http` `createServer`）、自建前端单页（0 行自制 SPA 弹窗与样式栈）、自建数据库管理引擎与迁移链；
- **全面依托 DSH 宿主能力**：
  - 前端 UI 严格接入 DSH 原生 Slot（`@deepseek-ai/dsh-client-ui-slots`）与原生右侧栏（`ctx.sidebarRightTabs`）；
  - 数据投影严格依托 DSH 会话投影（`ctx.sessionProjections`），领域只写纯数学折叠；
  - 后台异步任务统一挂载至 DSH 官方后台队列（`ctx.jobs`）；
  - 设定系统全面拥抱现代大模型原生认知规范——**DSH Skills（`@deepseek-ai/dsh-skill`）**，彻底淘汰老一代酒馆死板正则世界书（Lorebook）；
  - 世界线分支完全映射 DSH 原生会话分叉（`Session.fork`）；分支地图由本插件的「世界线」页签呈现（issue #28），`dsh-synapse` 已于 2026-09-20 撤装（D10 后续演变）。

### ③ 权能硬分权与自然时序流（No Locks, Just Natural Flow）
- **Author Agent（叙事执笔）**：只读消费精简工作区与 Skills，专注高质量第三人称文学正文创作，严禁替玩家代打，严禁写状态；
- **Chronicler Agent（状态推演）**：独立的客观智能体，在每轮正文产出后异步推演物理与心理变化，生成状态变动；允许根据剧情动态增加追踪维度；
- **玩家矫正（Player Correction，自然时序无锁流）**：
  - 彻底废除旧项目的“CAS 锁、永久硬锁、解绑通道”等防御性过度设计；
  - 状态流转遵循最质朴的人性逻辑：**AI 推演更新状态 → 玩家在侧边栏查看，若不满意随手直接就地修改 → 玩家开启下一轮时，Author 直接以最新修改后的切面为基准起笔**（Last-Write-Wins）。

### ④ 现代化构建与生命周期可逆性
- 构建对标社区高星标杆项目，统一使用 `tsdown` + `typescript` 构建纯 ESM 输出；
- 所有服务端注册必须是**可逆 Effect（Reversible Effect）**，支持热重载（HMR）干净释放。

---

## 2. 目录架构约定

```text
dsh-rrp/
├── docs/                        # 设计、宿主映射与开发流程
│   ├── DESIGN.md                # 唯一产品目标规格
│   ├── HOST_ALIGNMENT.md        # 宿主能力映射与反重复造轮子红线
│   ├── DEVELOPMENT.md           # 开发环境与日常循环（维护者本地私有日志，不随仓库分发）
│   └── reference/               # 为什么这么设计：决策/术语/经验/技能
│       └── HOST_BASELINE.md     # 宿主版本基线、seam 清单与升级流程（升级宿主前必读）
├── src/                         # 源码
│   ├── index.ts                 # 插件后端入口 (Cordis 插件)：注册 + 会话清理接线
│   ├── preset.ts / preset-id.ts # RP 模式物化（基础 rp + 每卡 rp-<id>）与 id 规则
│   ├── cards.ts / cards-route.ts / card-types.ts / card-import.ts
│   │                            # 卡包解析与触发注册表 / 只读路由 / host-client 共享词汇 / 酒馆卡转译导入
│   ├── world-state.ts           # WorldState 纯词汇（含 fold 判等 worldStatesEqual）
│   ├── state-payload.ts         # 状态载体：user/message 的 source.rrp（含 stateFoldSeq 折叠游标）
│   ├── state-publisher.ts       # 追加式发布（卡包 / 事实两通道，指纹去重）
│   ├── transcript.ts + projection/transcript.ts
│   │                            # 转录切片词汇与折叠器（宿主已禁同步读日志）
│   ├── transcript-reader.ts     # 投影→正文转录渲染（智体与路由共用，不牵入推演器）
│   ├── host-faces.ts            # 宿主服务面类型与管线工具单一来源（send/readBody/routeOf/collectText）
│   ├── chronicler.ts            # 状态推演触发与异步推演（ctx.jobs + ctx.llm）
│   ├── summarizer.ts / macro-summary.ts  # 剧情脉络触发与推演（ctx.jobs + /summary）与四维词汇
│   ├── activity.ts / activity-route.ts   # 归因账本（宿主内存 + 只读路由）
│   ├── lore.ts / lore-state.ts / lore-condition.ts / lore-provider.ts / lore-runtime.ts / lore-route.ts / lore-drafts.ts
│   │                            # D8 设定集：旧 sidecar 迁移 / 词汇 / 条件注入求值 / provider / 运行时 / 路由与草稿暂存
│   ├── correction.ts            # 玩家矫正写路径（宿主 webserver 路由）
│   ├── copilot.ts / copilot-store.ts / steward-proposals.ts
│   │                            # 月停路由与动作执行 / 宿主存储域历史 / 提案暂存确认落盘（issue #21 #33）
│   ├── worldline-tree.ts / worldline-digest.ts / worldline-store.ts / worldline-route.ts
│   │                            # 世界线树折叠 / 存档点摘要投影词汇 / 软归档名单 / 全图与归档路由（issue #28 #29）
│   ├── card-ui.ts / card-ui-route.ts / ui-schema.ts / ui-bridge.ts
│   │                            # 卡包界面声明校验 / 只读路由 / 组件与动作契约 / 沙箱桥（issue #18）
│   ├── cards-route.ts / start.ts / export-route.ts / card-workspace-route.ts / save-naming.ts
│   │                            # 卡包只读路由 / 开卡 / 小说导出 / 一卡一区（#37）/ 存档命名纯词汇
│   ├── route-contract.ts        # 前后端 HTTP+SSE 契约单一来源（#22）
│   ├── json-extract.ts          # 模型回复容错解析（Chronicler/Copilot/Scribe/Summarizer 四个后台智体共用；Author 走正文流不用它）
│   ├── settings.ts / prompt-budget.ts    # 会话级 RP 设置投影词汇 / 上下文体积估算词汇
│   ├── contracts.ts             # 对外只读契约（依赖为零）
│   ├── home.ts                  # harnessHome() 叶子模块
│   ├── client/                  # 客户端入口与面板
│   │   ├── index.ts             # 客户端入口（locale + 注册）
│   │   ├── context-types.ts     # 宿主客户端注入面的结构类型
│   │   ├── world-state-tab.tsx / components/  # 世界状态：装配器 + components/ 维度分组件
│   │   ├── lore-tab.tsx         # 设定集（D8）：起草/审阅/确认/删除
│   │   ├── copilot-tab.tsx / copilot-prefill.ts  # 月停面板（SSE）/ 舞台「问月停」预填
│   │   ├── gallery-panel.tsx    # 卡片展厅 + 开卡流（含导入、工作区归组）
│   │   ├── worldline-tab.tsx    # 世界线存档图：读档 / 重roll / 收起 / 导出
│   │   ├── stage-tab.tsx / stage-frame.tsx / stage-types.ts  # 舞台页签：声明式解释器 + 沙箱卡页面 + 共享接口
│   │   └── primitives.d.ts      # 宿主原子库结构面类型
│   ├── agents/                  # 智体提示词与行为规范（统一 AgentPromptContract，issue #32）
│   │   ├── contract.ts          # 统一提示词契约接口（六层结构 + Zod 绑定 + 缓存不变式）
│   │   ├── author.ts            # Author 提示词单一来源 AUTHOR_SYSTEM_PROMPT（preset.ts 物化注入）
│   │   ├── chronicler.ts        # 状态推演提示词与输出契约
│   │   ├── summarizer.ts        # 剧情脉络摘要智能体
│   │   ├── scribe.ts            # D8 设定集知识起草（只起草一条）
│   │   └── copilot.ts           # 月停提示词 + rrp-action 动作块词汇与解析
│   └── projection/              # 会话投影纯数学折叠器（7 单元）
│       ├── world-state.ts       # WorldState 投影单元（zod 校验 + 纯折叠）
│       ├── transcript.ts        # 转录切片投影单元（宿主已禁同步读日志）
│       ├── summary.ts           # 剧情脉络投影单元
│       ├── settings.ts          # RP 设置投影单元（摘要开关）
│       ├── lore.ts              # D8 设定集投影单元
│       ├── card.ts              # 当前卡包投影单元
│       └── worldline-digest.ts  # 存档点摘要投影单元（#28）
├── presets/                     # 随包分发的原生 agent preset（RP 模式）
│   └── rp/                      # 组合、元数据、管家技能包（steward-*，issue #33）与随模式作用域的世界知识技能
├── cards/                       # 官方原生卡包
├── scripts/                     # link-dev / inspect-context / repair-legacy-sessions
├── cordis.patch.yml             # DSH profile patch 声明
├── package.json                 # 依赖声明 (严格遵循 DSH peer 规范)
└── tsconfig.json
```

---

## 3. 开工与编码协议

所有进入本仓库的 AI 助手与人类协作者，必须无条件遵守：
1. **查阅现状**：先确认当前工作区，不随意创建计划外文件；
2. **对齐目标**：在动笔前先核对 `docs/DESIGN.md` 与 `docs/HOST_ALIGNMENT.md`；涉及设计取舍或命名时，先读 [`docs/reference/DECISIONS.md`](docs/reference/DECISIONS.md) 与 [`docs/reference/GLOSSARY.md`](docs/reference/GLOSSARY.md)；
3. **红线拦截**：如果发现准备写 `http.createServer`、写通用 SQLite 连接池、写前端整站弹窗，立即停手，寻找对应的 DSH 宿主能力；
4. **轻量优雅**：代码追求精炼透明，每一行代码都直接服务于 RP 游玩体验，拒绝为了“架构完整性”而脑补基建；
5. **三条宿主硬约束**（详见 [`docs/reference/HOST_SEAMS.md`](docs/reference/HOST_SEAMS.md)，违者会真机爆炸）：
   - **绝不发明会话事件类型** —— 状态寄存在已知 `user/message` 的 `source`；
   - **不在陌生 context 上属性读取服务** —— 用 `ctx.get(name)`；agent 生命周期监听器整体 try/catch；
   - **注入上下文只追加、绝不 replace** —— 前缀缓存是性能命脉。
6. **流程纪律**：需求类改动先走 [`docs/dev/workflow.md`](docs/dev/workflow.md)——术语先行对齐 → 拷问确认即落盘 → 编码前对照本文件与 `docs/reference/` 规则文档做冲突检查；工作区盘点与待决事项记入 [`docs/dev/worklog.md`](docs/dev/worklog.md)。
