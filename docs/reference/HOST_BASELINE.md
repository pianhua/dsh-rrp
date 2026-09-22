# 宿主基线（HOST_BASELINE.md）

> **本文档是宿主版本的唯一对账点。** 升级宿主、怀疑宿主行为变化、或接入新宿主能力前，先读这里。
> 契约层仍是 [`HOST_ALIGNMENT.md`](../HOST_ALIGNMENT.md) 与 [`HOST_SEAMS.md`](HOST_SEAMS.md)；本文件只记录「我们基线在哪个版本、消费哪些接缝、审计过什么」。

---

## 当前基线

| 项 | 值 |
| :--- | :--- |
| 安装宿主 | `@deepseek-ai/dsh@0.1.6-alpha.2`（npm 全局，`dsh --version` 核验） |
| 源码克隆 | `D:\projects\deepseek-harness`，tag `dsh-v0.1.6-alpha.2`（commit `ddefc45fbc`） |
| 索引 | codegraph（仅索引宿主克隆；`codegraph telemetry off` 已执行） |
| peerDependencies | 7 个 `dsh-*` peer 全部 `^0.1.6-alpha.2`（dev 实装同版；npm semver 下旧 `^0.1.5-rc.1` 不覆盖本基线的预发布） |
| 升级日期 | 2026-09-18 |

源码克隆与安装版本必须**严格同 tag**。升级宿主后第一件事：在克隆里 `git fetch && git checkout dsh-v<新版本>`，然后更新上表。

## Seam 清单（我们消费的全部宿主能力）

每次升级宿主后逐项对照源码复核（签名、语义、废弃标记）：

| 接缝 | 消费位置 | 0.1.6-alpha.2 状态 |
| :--- | :--- | :--- |
| `ctx.sessionProjections`（含 wire-less 单元的 register 重载） | `src/index.ts` 注册 7 个投影单元 | 未变化 |
| `session.append` + `user/message` 的 `source.rrp` 寄生 | `state-publisher.ts` 等 | 未变化；surface 事件必须带 `surfaceOp`（我们全部 append） |
| `ctx.jobs`（attachController + start） | `chronicler.ts` / `summarizer.ts` / `lore-route.ts` | 仅内部改名，公开面未变 |
| `ctx.llm.stream` | 三个推演智能体 | 未变化 |
| `agent/created` / `agent/disposed` 生命周期 | `lore-runtime.ts` / `index.ts` | `agent/session-start` 已废弃改为此名（我们本就使用新名） |
| `ctx.webServer` 路由注册 | correction / cards / activity / lore / start | 未变化 |
| `ctx.commands` | `/lore`、`/summary` | 未变化 |
| agent presets（`USER_PRESET_DIR`、DSH_HOME 约定） | `preset.ts` / `home.ts` | 发现逻辑未变；新增 `modeSelectionEnabled` 配置（未消费） |
| skills（scoped catalog） | `lore-provider.ts` / `preset.ts` | 仅 `path` 字段上移到基接口 |
| `Session.fork` | 世界线分支（设计层） | 签名未变；边界校验更严（拒绝切在回合中间，错误码 `OPEN_TURN`） |
| ui-slots（`slots.register` / `slots.inject`） | `src/client/**` | 纯增量；InjectParams 按声明 scope 决定（见下） |
| `sidebarRightTabs.register` | 三个右栏页签 | 签名未变；新增 `multiple`/关闭回调等可选项（未消费） |
| Workspace 投影（getSnapshot/subscribe） | gallery 选取器 | 增量新增 unarchive；getSnapshot 有 snapshotDirty 缓存（引用稳定） |
| `dsh-client-ui-primitives` | 客户端原子 | 纯增量；`DisclosureRow` 等导出仍在 |
| `ctx.sessionQuery`（`listSessions` / `readTitleSnapshots`；web-app 包以 `openAt: 'never'` 注册 session-query-sqlite） | `worldline-route.ts` 冷支线骨架（issue #29） | **0.1.6-alpha.2 新增消费**：`listSessions` 返回 live+persisted 全集、`readTitleSnapshots` 不解正文折标题；升级时断言这两条语义仍在（缺失时我们降级为 live-only 图，不报错） |
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

- **源码克隆**：`D:\projects\deepseek-harness`（与安装版本同 tag）。所有宿主问题先查源码，不读 npm 发布产物（客户端尤其只有压缩 bundle）。
- **codegraph 索引**：只索引宿主克隆（`.codegraph/codegraph.db`，6,601 文件约 10s 建完；本仓库不索引）。
  - CLI：`codegraph query <symbol> --json` / `callers` / `callees` / `impact` / `affected <file>`。
  - MCP：`mcp__codegraph__*` 已配进 `~/.kimi-code/mcp.json`（stdio 起 `codegraph serve --mcp`）。**MCP 服务器只加入配置后新建的会话**——会话中途配置需新开会话生效。
  - 升级宿主后 `codegraph init` 刷新索引。
- 图谱答「谁调用谁 / 影响面」；精确文本、locale、配置仍走 Grep/Glob。

## 升级流程

1. `npm i -g @deepseek-ai/dsh@<目标版本>`（宿主若在运行先关闭，Windows 会锁安装目录）。
2. 克隆切到对应 tag；`codegraph init` 刷新索引。
3. 对照上表逐 seam 复核（重点看「状态」列有无变化）。
4. `grep -rn "snapshotEvents\|eventAt\|ownEvents" src/` 必须为空。
5. `pnpm run typecheck && pnpm test && pnpm run build`。
6. 更新本表「当前基线」与日期，并把复核结论追加到本文件末尾的「审计历史」表。

## 审计历史

| 日期 | 基线 | 事项 |
| :--- | :--- | :--- |
| 2026-09-20 | 0.1.6-alpha.2 | 新增消费 `ctx.sessionQuery`（listSessions / readTitleSnapshots），seam 清单加行；rp-dev profile 含 dsh-web-app 包、服务实装已核验（openAt:'never' 只禁全文搜索，精确读可用） |
| 2026-09-18 | 0.1.6-alpha.2 | 遗留清账：peerDependencies 七项 `^0.1.5-rc.1` → `^0.1.6-alpha.2`（旧范围不覆盖本基线预发布），dev 实装同步对齐；typecheck 0 错、145/145 绿 |
| 2026-09-18 | 0.1.6-alpha.2 | 升级 + seam 全量复核 + snapshotEvents 迁移至 rrpTranscript 投影 + 卸载路径清账 |
| 2026-09-17 | 0.1.5-rc.1 | 只读验证轮：DisclosureRow 导出、workspace getSnapshot 缓存、harnessHome 口径三项证据确认 |
