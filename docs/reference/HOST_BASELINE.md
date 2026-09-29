# 宿主基线（HOST_BASELINE.md）

> **本文档是宿主版本的唯一对账点。** 升级宿主、怀疑宿主行为变化、或接入新宿主能力前，先读这里。
> 契约层仍是 [`HOST_ALIGNMENT.md`](../HOST_ALIGNMENT.md) 与 [`HOST_SEAMS.md`](HOST_SEAMS.md)；本文件只记录「我们基线在哪个版本、消费哪些接缝、审计过什么」。

---

## 当前基线

| 项 | 值 |
| :--- | :--- |
| 安装宿主 | `@deepseek-ai/dsh@0.2.0-rc.1`（npm 全局，`dsh --version` 核验） |
| 源码克隆 | 每台机器的本地 `deepseek-harness` checkout，tag `dsh-v0.2.0-rc.1`（commit `4878cdabd8`） |
| 索引 | codegraph（仅索引宿主克隆；`codegraph telemetry off` 已执行） |
| peerDependencies | 9 个 `dsh-*` peer 全部 `^0.2.0-rc.1`（dev 实装同版） |
| 升级日期 | 2026-09-29 |

源码克隆与安装版本必须**严格同 tag**。升级宿主后第一件事：在克隆里 `git fetch && git checkout dsh-v<新版本>`，然后更新上表。

## Seam 清单（我们消费的全部宿主能力）

每次升级宿主后逐项对照源码复核（签名、语义、废弃标记）：

| 接缝 | 消费位置 | 0.2.0-rc.1 状态（2026-09-29 复核） |
| :--- | :--- | :--- |
| `ctx.sessionProjections`（含 wire-less 单元的 register 重载） | `src/index.ts` 注册 7 个投影单元 | 未变化（apply 同步、同引用门控不变） |
| `session.append` + `user/message` 的 `source.rrp` 寄生 | `state-payload.ts` 等 | **已迁移**：会话格式 V4，`kind:'plugin'` 禁用；写 `{kind:'rrp'}`，读兼容 `{kind:'rrp'}`/`{kind:'plugin:dsh-rrp'}`（V3 迁移产物）/旧 `{kind:'plugin',plugin:'dsh-rrp'}`；surfaceOp 仍必填 |
| **V4 surface 头不变式** | `start.ts` 开局 | **新增消费**：首个 surface 事件必须是 system/message（受保护头）；开局先写头回合 turn1（source 经 `@deepseek-ai/dsh-system-prompt` 归属），开场白回合 turn2 |
| `ctx.jobs`（attachController + start） | `chronicler.ts` / `summarizer.ts` / `lore-route.ts` | **已迁移**：`owner: SessionId`、`run(job: JobHandle)`；本项目 runner 无输出读取需求 |
| `ctx.llm.stream` | 三个推演智能体 | 未变化（角色面新增 developer/tool，本插件不构造角色数组） |
| `agent/created` / `agent/disposed` 生命周期 | `lore-runtime.ts` / `index.ts` | 未变化 |
| `ctx.webServer` 路由注册 | correction / cards / activity / lore / start | 未变化 |
| `ctx.commands` | `/lore`、`/summary` | 未变化 |
| agent presets | `preset.ts` | **已迁移**：`.agent-presets` 目录扫描与 `USER_PRESET_DIR` 已删除；改运行时 `ctx.agentPresets.register({id,plugins})`（返回 disposer）；`selectedDefault` 取代 `modeSelectionEnabled`；客户端 `remote.agentPresets.select` 形态不变 |
| skills（scoped catalog） | `lore-provider.ts` / `preset.ts` | 未变化；preset 经 `bundledSkillDirs`/`customSkillDirs` 配置（card preset 只加本卡 skill root） |
| `Session.fork` | 世界线分支（设计层） | **语义变化**：`OPEN_TURN` 删除，回合中间分叉自动补 `forked` synthetic closers；本插件折叠器已审计（message 驱动，不受影响）+ 回归测试锁定 |
| ui-slots（`slots.register` / `slots.inject`） | `src/client/**` | 未变化（InjectParams 按声明 scope 决定不变） |
| `sidebarRightTabs.register` | 三个右栏页签 | 注册签名未变；关闭回调形态为 `ctx.sidebarRight.registerCloseHandler`（未消费）；新增 `keepMounted`（未消费） |
| Workspace 投影（getSnapshot/subscribe） | gallery 选取器 | 未变化 |
| `dsh-client-ui-primitives` | 客户端原子 | **已迁移**：Icon 尺寸后缀导出改名 `Regular`/`Medium`（`primitives.d.ts` 与 stub 已同步） |
| `conversation.view` 第三视图 | 世界线/舞台/世界状态页签 | 注册未变；owner props 新增 `inspectCall`（未消费） |
| `ctx.sessionQuery`（`listSessions` / `readTitleSnapshots`；web-app 包 `openAt: 'never'`） | `worldline-route.ts` 冷支线骨架 | 未变化；**宿主已修复 seeded 会话 `readSession` 必抛缺陷**（inheritedEventCount + end-seed 标记），cuts 旁路缓存保守保留 |
| 宿主 webserver | — | 未变化 |

### ui-slots InjectParams 口径（alpha.2 实测）

`inject` 的实参由**槽位声明的 scope** 决定，不是我们注册时决定的：

- `sidebar.right.pane.tab` 声明 `scope: 'session'` → `inject(sessionId)` ——世界状态/设定集页签按此消费。
- `main` 声明 `scope: 'root'` → `inject()` ——展厅面板按此消费（零参函数正确）。
- `sidebar.panellist` 声明 `scope: 'root'` → 无 inject。

## 已弃用债务（宿主方向，非本次缺陷）

宿主决策笔记 `.agents/notes/implemented/architecture/2026-09-09-deprecate-synchronous-session-event-reads.md`：
**`Session.snapshotEvents()` / `eventAt()` / `ownEvents()` 同步历史读已废弃**（现有调用可暂留，禁止新调用）。官方替代模式：持久事件字段 + 会话投影 + 从增量事件维护派生态，恢复时从投影重建。

**本仓库已清账（2026-09-18）**：新增 `rrpTranscript` 投影单元（`src/projection/transcript.ts`），Chronicler 三个转录读法、`state-publisher.adopt()`、`lore-runtime.hasLoreEvent` 全部改读投影切片，生产代码零 `snapshotEvents` 残留（`grep -rn snapshotEvents src/` 应为空）。

## 运行时卸载约束

`0.1.6-alpha.2` 起 plugin-manager 支持运行时卸载插件：卸载路径必须真释放一切。
本仓库：全部注册挂在 `ctx.effect`/`ctx.inject`；模块级会话缓存在 `session/disposed` 清理之外，另由 `cleanupAllSessions()` 在卸载 effect 中清空（`src/index.ts`）。

## 查询宿主源码

- **源码克隆**：每台机器的本地 `deepseek-harness` checkout（与安装版本同 tag）。所有宿主问题先查源码，不读 npm 发布产物（客户端尤其只有压缩 bundle）。
- **codegraph 索引**：只索引宿主克隆（`.codegraph/codegraph.db`，本机建立；本仓库不索引）。
  - CLI：`codegraph query <symbol> --json` / `callers` / `callees` / `impact` / `affected <file>`。
  - MCP：`mcp__codegraph__*` 和配置文件属于本机开发环境；MCP 服务器只加入配置后新建的会话，会话中途配置需新开会话生效。
  - 升级宿主后 `codegraph init` 刷新索引。
- 图谱答「谁调用谁 / 影响面」；精确文本、locale、配置仍走 Grep/Glob。

## 升级流程

1. `npm i -g @deepseek-ai/dsh@<目标版本>`（宿主若在运行先关闭；Windows/Linux 的全局安装路径各自保留在本机）。
2. 宿主源码克隆切到对应 tag；`codegraph init` 刷新本机索引。
3. 对照上表逐 seam 复核（重点看「状态」列有无变化）。
4. 在本仓库执行 `git grep -n -E 'snapshotEvents|eventAt|ownEvents' -- src`，结果必须为空。
5. `pnpm run check:environment && pnpm run typecheck && pnpm test && pnpm run build`。
6. 更新本表「当前基线」与日期，并把复核结论追加到本文件末尾的「审计历史」表。

## 审计历史

| 日期 | 基线 | 事项 |
| :--- | :--- | :--- |
| 2026-09-29 | 0.2.0-rc.1 | 升级 + seam 全量复核（三路源码审计）。必修五项全部落地：M1 source 寄生面 V4 迁移（三形态读取）、M2 jobs API（owner SessionId + JobHandle）、M3 preset 运行时 registry 注册（`.agent-presets` 物化废除）、M4 客户端 Icon Regular/Medium 改名、M5 fork OPEN_TURN 删除适配（审计无需改实现 + 回归测试）。真机暴露三层 V4 校验（写时 turn 序号/迁移 turn-step 匹配/seeded 头一致/surface 受保护头/system source 形态），新增开局头回合 + 一次性修复脚本 `repair-v3-openings.mjs`（31 日志修复 19）。真机验收：宿主零报错启动、preset 组合探测通过、19 个受损历史会话全部恢复加载（含 fork 子线冷读）、标题折叠正确、新开局 V4 原生写入成功（opening=assistant + 宿主 jobs 指示器可见）。**未验证**：真实 LLM 回合与 Chronicler 推演（所有者指示不做）；世界状态页签对冷会话空白（0.1.6 同代码路径，疑似既有边界，待复核） |
| 2026-09-20 | 0.1.6-alpha.2 | 新增消费 `ctx.sessionQuery`（listSessions / readTitleSnapshots），seam 清单加行；rp-dev profile 含 dsh-web-app 包、服务实装已核验（openAt:'never' 只禁全文搜索，精确读可用） |
| 2026-09-18 | 0.1.6-alpha.2 | 遗留清账：peerDependencies 七项 `^0.1.5-rc.1` → `^0.1.6-alpha.2`（旧范围不覆盖本基线预发布），dev 实装同步对齐；typecheck 0 错、145/145 绿 |
| 2026-09-18 | 0.1.6-alpha.2 | 升级 + seam 全量复核 + snapshotEvents 迁移至 rrpTranscript 投影 + 卸载路径清账 |
| 2026-09-17 | 0.1.5-rc.1 | 只读验证轮：DisclosureRow 导出、workspace getSnapshot 缓存、harnessHome 口径三项证据确认 |
