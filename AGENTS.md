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
  - 世界线分支完全映射 DSH 原生会话分叉（`Session.fork`），从物理拓扑上兼容 `dsh-synapse` 会话地图。

### ③ 权能硬分权与自然时序流（No Locks, Just Natural Flow）
- **Author Agent（叙事作家）**：只读消费精简工作区与 Skills，专注高质量第三人称文学正文创作，严禁替玩家代打，严禁写状态；
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
│   ├── index.ts                 # 插件后端入口 (Cordis 插件)
│   ├── preset.ts / preset-id.ts # RP 模式物化（基础 rp + 每卡 rp-<id>）与 id 规则
│   ├── cards.ts / card-types.ts # 卡包解析与词汇（host/client 共享的纯类型）
│   ├── world-state.ts           # WorldState 纯词汇（host/client 共享）
│   ├── macro-summary.ts         # 四维大局观纯词汇（host/client 共享）
│   ├── state-payload.ts         # 状态载体：user/message 的 source.rrp
│   ├── state-publisher.ts       # 追加式发布（卡包 / 事实两通道）
│   ├── chronicler.ts            # 状态推演触发与异步推演（ctx.jobs + ctx.llm）
│   ├── summarizer.ts            # 剧情脉络触发与推演（ctx.jobs + ctx.llm + /summary）
│   ├── activity.ts / activity-route.ts   # 归因账本（宿主内存 + 只读路由）
│   ├── lore.ts / lore-provider.ts / lore-runtime.ts / lore-route.ts
│   │                            # D8 知识沉淀：按会话存储、skill provider、路由与 /lore
│   ├── correction.ts            # 玩家矫正写路径（宿主 webserver 路由）
│   ├── steward-proposals.ts     # 总管家提案暂存/确认/落盘（issue #33，内存态+确认后写用户卡）
│   ├── cards-route.ts / start.ts# 卡包只读路由 / 开卡（发布初始状态 + 开场白）
│   ├── card-workspace-route.ts  # 一卡一区（issue #37）：幂等收养卡级工作区，开卡/分叉自动归组
│   ├── save-naming.ts           # 存档命名纯词汇（issue #37）：主线编号 + 分支带父档名
│   ├── contracts.ts             # 对外只读契约（依赖为零）
│   ├── home.ts                  # harnessHome() 叶子模块
│   ├── client/                  # 客户端入口与面板
│   │   ├── index.ts             # 客户端入口（locale + 注册）
│   │   ├── world-state-tab.tsx  # 世界状态：结构化就地编辑器
│   │   ├── lore-tab.tsx     # 设定集（D8）：起草/审阅/确认/删除
│   │   ├── gallery-panel.tsx    # 卡片展厅 + 开卡流
│   │   └── primitives.d.ts      # 宿主原子库结构面类型
│   ├── agents/                  # 智体提示词与行为规范（统一 AgentPromptContract，issue #32）
│   │   ├── contract.ts          # 统一提示词契约接口（六层结构 + Zod 绑定 + 缓存不变式）
│   │   ├── author.ts            # Author 提示词单一来源 AUTHOR_SYSTEM_PROMPT（preset.ts 物化注入）
│   │   ├── chronicler.ts        # 状态推演提示词与输出契约
│   │   ├── summarizer.ts        # 剧情脉络摘要智能体
│   │   ├── scribe.ts            # D8 设定集编纂者（只起草一条）
│   │   └── copilot.ts           # 副驾驶提示词 + rrp-action 动作块词汇与解析
│   └── projection/              # 会话投影纯数学折叠器
│       ├── world-state.ts       # WorldState 投影单元（zod 校验 + 纯折叠）
│       ├── summary.ts           # 剧情脉络投影单元
│       ├── settings.ts          # RP 设置投影单元（摘要开关）
│       ├── lore.ts          # D8 沉淀投影单元
│       └── card.ts              # 当前卡包投影单元
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
