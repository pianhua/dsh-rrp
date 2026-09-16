# AGENTS.md — dsh-rrp 开发者与 AI 协作准则

> **项目代号**：`dsh-rrp`（DSH-Chronicle 现代重启版 · 个人单机沉浸式 RP 插件）  
> **核心定位**：面向 DeepSeek Harness（DSH）的**正统薄插件**，专为个人单机游玩打造的高品质角色扮演与交互小说引擎。  
> **设计基准**：严格以 [`docs/DESIGN.md`](docs/DESIGN.md) 为唯一目标规格，以 [`docs/HOST_ALIGNMENT.md`](docs/HOST_ALIGNMENT.md) 为宿主能力映射准则。  
> **防漂移记录**：[`docs/reference/`](docs/reference/README.md) 保存决策理由、标准术语、社区经验与旧项目教训；**改动设计前必读 [`DECISIONS.md`](docs/reference/DECISIONS.md)**。

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
- **Chronicler Agent（纪事官）**：独立的客观智能体，在每轮正文产出后异步推演物理与心理变化，生成状态变动；允许根据剧情动态增加追踪维度；
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
├── docs/                        # 设计、宿主映射与任务指针
│   ├── DESIGN.md                # 唯一产品目标规格
│   ├── HOST_ALIGNMENT.md        # 宿主能力映射与反重复造轮子红线
│   ├── ACTIVE_TASK.md           # 当前执行任务指针
│   └── reference/               # 为什么这么设计：决策/术语/经验/技能
├── src/                         # 源码
│   ├── index.ts                 # 插件后端入口 (Cordis 插件)
│   ├── preset.ts                # RP 模式（agent preset）物化与归属
│   ├── world-state.ts           # WorldState 纯词汇（host/client 共享）
│   ├── chronicler.ts            # 纪事官触发与异步推演（ctx.jobs + ctx.llm）
│   ├── author-context.ts        # Author 每步只读消费最新 WorldState（agent/pre-step）
│   ├── correction.ts            # 玩家矫正写路径（宿主 webserver 路由）
│   ├── client/                  # 客户端 Slot 与右侧栏插件
│   │   ├── index.ts             # 客户端入口
│   │   └── components/          # React 18 UI 组件 (状态看板/卡片展厅)
│   ├── agents/                  # 智体提示词与行为规范
│   │   ├── chronicler.ts        # 纪事官提示词与输出契约
│   │   └── summarizer.ts        # 大局编年摘要智能体 (可开可关，待阶段 7)
│   ├── skills/                  # 预留：技能相关 TS 辅助（技能包随 preset 分发）
│   └── projection/              # 会话投影纯数学折叠器 (WorldState)
│       └── world-state.ts       # WorldState 投影单元（zod 校验 + 纯折叠）
├── presets/                     # 随包分发的原生 agent preset（RP 模式）
│   └── rp/                      # 组合、元数据与随模式作用域的世界知识技能
│       └── skills/              # SKILL.md 世界设定包（D7，按需调取）
├── cards/                       # 官方原生卡包 (未来制定标准规范)
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
4. **轻量优雅**：代码追求精炼透明，每一行代码都直接服务于 RP 游玩体验，拒绝为了“架构完整性”而脑补基建。
