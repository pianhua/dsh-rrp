# 宿主能力映射与反重复造轮子红线（HOST_ALIGNMENT.md）

> **文档定位**：`dsh-rrp` 的**宿主适配宪法**。  
> 任何实现前，先在此表定位：宿主是否已有该能力？有则接入，无则才写领域代码。  
> 目标基线：DeepSeek Harness **`>= 0.1.5-rc.1`**（社区高星插件共同验证线）。

---

## 1. 第一原则

> **领域只写纯数学，驱动权归宿主。**

`dsh-rrp` 只拥有「角色扮演领域语义」：执笔规范、状态推演准则、摘要逻辑、卡包定义。  
其余一切（HTTP、UI 外壳、会话存储、事件驱动、后台调度、可观测性）**一律由 DSH 宿主提供**。

---

## 2. 宿主已提供能力（必须复用）

| 领域 | DSH 宿主能力 | 服务 / 包 | `dsh-rrp` 的正确用法 |
| :--- | :--- | :--- | :--- |
| **HTTP 路由** | 宿主 Web Server | `@deepseek-ai/dsh-host-webserver` → `ctx.webServer.register` | 只有确需独立端点时才注册路由，**绝不 `createServer`** |
| **前端 UI** | Slot 注册表 | `@deepseek-ai/dsh-client-ui-slots` → `ctx.slots.register` | 状态看板、卡片展厅全部做成 Slot 组件（React 18） |
| **工作区导航** | 原生 Workspace 列表与会话归属 | `ctx.workspaces` / `ctx.sessions.create({ workspaceId })` | 展厅只选择宿主已有工作区；不创建 RP 工作目录、不把 Workspace 当状态库 |
| **右侧栏** | 原生右侧栏 Tab | `ctx.sidebarRightTabs` / `ctx.sidebarRight` | WorldState 看板注册为原生 Tab，**不自绘面板** |
| **会话真源** | 仅追加事件日志 | `@deepseek-ai/dsh-session` | 正文与分支以 Session 为唯一权威；`Session.fork` = 世界线分支 |
| **状态投影** | 投影驱动注册表 | `@deepseek-ai/dsh-session-projection` → `ctx.sessionProjections.register` | WorldState 写 `init/apply` 纯函数，宿主自动驱动 + 推送 |
| **投影缓存** | 投影持久化 | `@deepseek-ai/dsh-session-projection-cache` | 重启后投影自动恢复，**不自建缓存失效逻辑** |
| **后台任务** | 任务注册表 | `@deepseek-ai/dsh-jobs` → `ctx.jobs` | Chronicler / Summarizer 异步执行全部挂 jobs |
| **长期任务 UI** | 任务进度条 | `@deepseek-ai/dsh-client-ui-jobs` | 宿主原生展示后台任务，**不自写轮询** |
| **Agent 循环** | Agent 注册表 | `@deepseek-ai/dsh-agent` / `dsh-agent-loop` → `ctx.agents` | Author 等智体由宿主循环驱动 |
| **子智体编排** | Subagent seam | `@deepseek-ai/dsh-subagent` → `ctx.subagents` | 需要派生/隔离智体时用官方 provider，不自造流水线 |
| **工具注册** | 工具管线 | `@deepseek-ai/dsh-tools` → `defineTool` | Codex 查阅等只读工具按官方规范定义（含 `presentResult`） |
| **技能知识** | Skill 体系 | `@deepseek-ai/dsh-skill` / `dsh-skill-filesystem` | 世界设定即 Skill，按需调取（替代 Lorebook） |
| **非会话存储** | 存储中心 | `@deepseek-ai/dsh-storage`（json / sqlite backend + domain form） | 域数据挂 storage domain，**不自建连接池/迁移链** |
| **会话持久化** | 官方持久化 | `@deepseek-ai/dsh-session-persistence-sqlite` | 正文落盘交给宿主，不自建 story 库 |
| **执行轨迹观测** | 原生轨迹面板 | `@deepseek-ai/dsh-client-ui-trajectory` / `dsh-client-ui-tool` | 直接使用宿主原生轨迹，**不自建 DevConsole** |
| **会话统计遥测** | 原生统计 | `@deepseek-ai/dsh-session-telemetry` / session-stats | 复用宿主指标，**不自建 packet-log** |
| **国际化** | 地区字典 | `@deepseek-ai/dsh-client-locale` → `ctx.locale.register` | 所有文案走 locale，不硬编码字符串 |
| **配置存储** | 设置服务 | `@deepseek-ai/dsh-settings` | 插件配置用官方 settings，不自建配置文件管理 |
| **原子写** | 原子文件写 | `@deepseek-ai/dsh-atomic-write` | 确需文件落盘时使用（如卡包索引） |

### 2.1 当前实现符合度（2026-09-17 事实审计）

整体结论：**主架构符合，局部实现待收敛**。下表只记录已从源码与当前安装宿主包验证的事实；“待决策”不是授权绕开宿主继续扩展。

| 项 | 现状 | 结论 |
| :--- | :--- | :--- |
| Cordis 插件与 bundle | `package.json.dsh.bundle.patch` + `cordis.patch.yml`；host/client 分包 | ✅ 符合 |
| UI | 原生 slots、右侧栏、session/controller 与 primitives；无独立 SPA | ✅ 符合 |
| 会话状态 | 已知 `user/message.source.rrp` + 五个纯投影（Card / WorldState / Summary / Settings / Sediment）；无自造必需事件类型 | ✅ 符合 |
| 后台推演 | Chronicler / Summarizer / Scribe 走 `ctx.jobs + ctx.llm`；没有自建队列或 Agent loop | ✅ 符合 |
| 卡包 Skills | 每卡派生 `rp-<card>` preset，利用官方 standing scope 隔离 | ✅ 符合，不是重复造轮子 |
| 投影注册生命周期 | `sessionProjections.register()` 在宿主中本身是 calling-fiber effect；未保存提前 disposer 不等于 HMR 泄漏 | ✅ 符合 |
| D8 持久化 | `source.rrp.sediment` 操作事件 + `rrpSediment` 纯投影；agent provider 读取所属会话投影 | ✅ 符合；旧 sidecar 仅在首次访问时迁移并备份为 `.legacy.bak` |
| 后台状态 UI | 推送优先：典籍列表走 `useProjection('rrpSediment')`、在飞状态走 `useSessions` 的 `jobsBySession` 宿主推送；宿主不注入该座位时保留 2s 轮询作 fallback | ✅ 已收敛（fallback 为宿主能力缺席时的显式降级） |
| Frontmatter | 官方 `yaml` 包解析（P4 已替换手写子集）；仅覆盖 frontmatter 用到的字段，不复用为通用 YAML 能力 | ✅ 符合 |
| 进程内状态 | `RETAINED`、`LEDGERS`、`PENDING`、`LAST_SUMMARIZED`、纪事官在飞标记均经 `cleanupSession`（`session/disposed` / `agent/disposed`）统一释放（P0-4 + 并发守卫） | ✅ 符合 |

D8 的语义已经确定：沉淀属于世界线，子会话继承分叉点前的事件前缀，分叉后的新增/删除只影响各自分支。实现复用 Session 日志与投影，不复制目录、不自建分支存储。Workspace 只承担宿主导航与归组，不参与这一状态语义。

---

## 3. 旧项目「重复造轮子」处置对照

> 旧仓 `dsh-custom-agent` 约 4.9 万行中，判定约 1.2 万~1.5 万行为重复宿主能力。下表为明确处置结论。

| 旧实现 | 体量 | 处置 | 替代方案 |
| :--- | ---: | :--- | :--- |
| `src/web/rp-web.ts` 自建 HTTP + SSE | 2500+ | ❌ 不迁移 | `ctx.webServer.register` |
| `src/ui/**` 整站 SPA + 自制样式栈 | 5700+ | ❌ 不迁移 | Slot + 原生右侧栏 |
| `src/devconsole/**` 平行控制台 | 3900+ | ❌ 不迁移 | `dsh-client-ui-trajectory` 原生轨迹 |
| `src/packet-log/**` 自建数据包日志 | 775 | ❌ 不迁移 | 宿主 session telemetry |
| `src/background/**` 自研任务队列/死信 | 1769 | ❌ 不迁移 | `ctx.jobs` |
| `src/runtime/**` 自研回合编排 OS | 5706 | ❌ 不迁移 | `ctx.agents` + 领域胶水 |
| `src/persistence/**` 通用 SQLite 框架 | 1596 | ❌ 不迁移 | `ctx.storage` + 官方 session persistence |
| `src/change/rp-change-state.ts` 巨石状态机 | 3463 | ❌ 不迁移 | `sessionProjections` 纯折叠 |
| 34 套 `*-store.ts` / `*-persistence.ts` 样板 | — | ❌ 不迁移 | storage domain |
| `scripts/admin/rp-admin.mjs` 自建运维 CLI | 数百 | ❌ 不迁移 | 宿主内置管理能力 |
| Author / Chronicler **语义与提示词** | — | ✅ 保留重写 | 领域核心资产 |
| 原生卡包三资产**设计理念** | — | ✅ 保留重设计 | 格式将重新制定 |
| 世界线**非线性哲学** | — | ✅ 保留 | 映射原生 fork |
| 玩家矫正**产品承诺** | — | ✅ 保留简化 | 自然时序流（无锁） |

---

## 4. 红线禁区（出现即拒绝）

以下代码模式一旦出现，立即停手并回到本表寻找宿主替代：

| 禁区 | 原因 |
| :--- | :--- |
| `node:http` `createServer` / 第二端口 | 宿主已有唯一 Web Server |
| 自制整站前端 SPA、自制弹窗/Toast 样式栈 | 应使用原生 Slot 与右侧栏 |
| 通用 SQLite 连接池、WAL 管理、schema 迁移链 | 应使用 `ctx.storage` / 官方 session persistence |
| CAS 乐观锁、分布式锁、多进程租约、永久仲裁保护盾 | 个人单机玩具不需要；采用自然时序流 |
| 自建后台任务队列 / 死信 / 自愈矩阵 | 应使用 `ctx.jobs` |
| 自建 DAG 图数据库 / 图投影平台 | 映射 `Session.fork`，可视化交给社区地图插件 |
| 自建 Trace / DevConsole / packet-log | 宿主原生轨迹与遥测已足够 |
| 在核心引擎内解析酒馆 PNG / 兼容旧酒馆字段 | 核心只认原生格式；转译由独立 Skill 负责 |
| 前端组件硬编码中文文案 | 必须走 `ctx.locale.register` |
| 不可逆的服务端注册（无 disposer） | 必须支持 HMR 干净释放 |

---

## 5. 依赖与工程规范

严格对标社区高星插件的 `package.json` 形态：

```jsonc
{
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "inject": ["@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-slots"],
      "platform": "web"
    }
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.2"
  }
}
```

约定要点：

- 纯 ESM；构建用 `tsdown` + `typescript`；
- DSH 相关包一律放 `peerDependencies`（可选能力标记 `peerDependenciesMeta.optional`），**绝不把宿主巨石打进 dependencies**；
- 插件可导出两种形态，**不可混用**：service 类默认导出；function 插件具名导出 `name` / `inject` / `Config` / `apply`；
- 可选服务用 `ctx.get(name)` 探测，声明依赖才用 `ctx.<name>`；
- 所有注册必须绑定 effect 生命周期；宿主 API 若已把注册实现为 calling-fiber effect，可依赖其自动卸载，返回 disposer 仅用于提前释放。

---

## 6. 使用检查清单

新增任何功能前，依次自问：

1. 宿主是否已有该能力？→ 有则接入（回本表第 2 节）
2. 是否触犯第 4 节任一红线？→ 是则重新设计
3. 是否属于「角色扮演领域语义」？→ 不是则应归宿主
4. 注册是否可逆？→ 必须可逆
5. 是否引入并发/分布式/多用户复杂度？→ 个人玩具，删除
