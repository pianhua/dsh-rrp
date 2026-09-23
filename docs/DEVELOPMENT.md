# 开发环境与日常流程（DEVELOPMENT.md）

> 面向本仓库的开发者（人类与 AI）：Windows 与 Linux 共用同一份版本、分支和验证协议。
> **接手先读 [`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md)**（宿主能力映射与红线）；宿主接缝的证据链见 [`reference/HOST_SEAMS.md`](reference/HOST_SEAMS.md)；契约层是 [`../AGENTS.md`](../AGENTS.md)；协作流程（对齐 → 落盘 → 冲突检查）见 [`dev/workflow.md`](dev/workflow.md)，状态盘点见 [`dev/worklog.md`](dev/worklog.md)。
> GitHub/人类协作者的最短入口是 [`../CONTRIBUTING.md`](../CONTRIBUTING.md)。

---

## 1. 共享工具链基线

| 项 | 共享要求 |
| :--- | :--- |
| `dsh` CLI | 0.1.6-alpha.2 |
| 宿主包（`@deepseek-ai/dsh-*`） | 0.1.6-alpha.2（嵌在全局 dsh 安装内，非顶层包） |
| Node.js | `.node-version` 固定为 `24.16.0` |
| 包管理器 | `package.json` 固定为 `pnpm@10.14.0` |
| 构建 | tsdown 0.23.0 + TypeScript 5.9 |

Node.js 与 pnpm 是**共享代码库的工具链基线**，不是 Windows/Linux 的分支差异。版本声明的唯一机器可读来源是 `.node-version` 与 `package.json`；`pnpm run check:environment` 会在本机和 CI 中检查它们。版本对账的宿主入口是 [`reference/HOST_BASELINE.md`](reference/HOST_BASELINE.md)：安装版本 ↔ 源码 tag ↔ seam 清单 ↔ 废弃债务。**升级宿主先读它。**

### 1.1 首次准备（Windows/Linux 相同）

先用本机已有的 Node 版本管理器加载仓库根目录的 `.node-version`：

```bash
# nvm：nvm use 24.16.0
# fnm：fnm use 24.16.0

corepack enable
corepack prepare pnpm@10.14.0 --activate
pnpm run check:environment
pnpm install --frozen-lockfile
```

Windows PowerShell 和 Linux shell 使用同样的 `pnpm` / `node` / `git` 命令；只有 Node 版本管理器的安装方式和 DSH 本机安装目录可能不同。**不要使用 `--ignore-scripts` 绕过 `preinstall` 环境检查。**

### 1.2 宿主源码与索引

- **源码克隆**：每台机器在自己的任意路径保存 `deepseek-harness`，必须与安装版本同 tag（升级宿主时先 `git fetch && git checkout dsh-v<版本>`）。例如 Windows 可用 `D:\projects\deepseek-harness`，Linux 可用 `~/projects/deepseek-harness`；这些路径不能写进共享源码或规范。
- **codegraph 索引**：只对宿主克隆建索引，本仓库不索引。索引工具和 MCP 配置属于本机开发环境；索引随宿主升级用 `codegraph init` 刷新。
- 图谱负责「谁调用谁 / 影响面」类问题；精确文本与配置仍走 Grep/Glob。
- 宿主问题一律读对应 tag 的源码，不读 Windows `AppData` 或 Linux 缓存目录里的编译产物。

---

## 2. 构建与产物

首次准备完成后，构建命令在 Windows/Linux 相同：

```bash
pnpm run build   # tsc 出 lib/types，tsdown 出 lib/index.js 与 lib/client.js
```

产物：

| 文件 | 面 | 说明 |
| :--- | :--- | :--- |
| `lib/index.js` | host | 纯 ESM；DSH 包保持外部依赖 |
| `lib/client.js` | client | `window.__ModuleLoader__.load({ id, factory })` 闭包工厂 |
| `lib/types/**` | 类型 | `tsc --emitDeclarationOnly` |

---

## 3. 开发用 profile：`rp-dev`

**绝不**把开发中的插件挂进日常 `web` profile。开发统一使用独立的 `rp-dev`（由官方 `web` 模板生成，只含 `dsh-base` + `dsh-web-app`）：

```bash
# 首次生成（--dump-config 只组合并打印，不启动服务器）
dsh --profile rp-dev --from-default-profile web --dump-config

# 链接本仓库并登记为 profile bundle
pnpm run link:dev          # = node scripts/link-dev.mjs [profile]
```

### 为什么不用 `dsh plugin add .`

`dsh plugin` 转发给 pnpm，而 pnpm 的 `link:` 协议把路径**按 profile 目录相对**解析。只要仓库和 `$DSH_HOME` 不在同一可解析路径上，就可能生成断链，并报 `declares no dsh.bundle`。

`scripts/link-dev.mjs` 会在 profile 的 `node_modules/dsh-rrp` 位置创建目录链接，并直接把包登记进 `dsh.profile.bundles`：Windows 使用 junction，Linux 使用符号链接语义。链接后该路径指向当前 checkout，改源码 → `pnpm run build` 即生效。`DSH_HOME`、profile 和链接目标都是本机状态，不提交到 GitHub。

---

## 4. 日常循环

```bash
pnpm run check:environment                      # 先确认 Node/pnpm 与共享基线一致
pnpm run typecheck                              # 类型检查（含 tests）
pnpm run lint                                   # eslint 扁平配置，零告警为准
pnpm run format:check                           # prettier 排版检查（可用 pnpm run format 修）
pnpm test                                       # vitest：以当前输出为准（含 HMR 无残留）
pnpm run build                                  # 构建 host + client
node scripts/host-runner.mjs start              # 真实宿主自动化启动（自动杀冲突进程、剥离代理、捕获 Token 鉴权 URL）
node scripts/host-runner.mjs status             # 查看宿主运行状态、Token URL 与健康检查
node scripts/host-runner.mjs stop               # 停止测试宿主
node scripts/inspect-context.mjs --latest       # 需要时：解码日志、统计上下文与缓存
```

`pnpm publish` 前的 `prepublishOnly` 会串起 typecheck + lint + test + build。排版提交记在
`.git-blame-ignore-revs` 里，克隆后执行一次 `git config blame.ignoreRevsFile .git-blame-ignore-revs`，
`git blame` 即会跳过纯格式化。

启动日志中应出现：

```text
[dsh-rrp] RP preset refreshed at <dshHome>/.agent-presets/rp
[dsh-rrp] WorldState projection registered (key rrpWorldState)
[dsh-rrp] macro-summary projection registered (key rrpSummary)
[dsh-rrp] RP settings projection registered (key rrpSettings)
[dsh-rrp] lore projection registered (key rrpSediment)
[dsh-rrp] active-card projection registered (key rrpCard)
[dsh-rrp] transcript projection registered (key rrpTranscript)
[dsh-rrp] worldline digest projection registered (key rrpWorldlineDigest)
[dsh-rrp] Chronicler armed for preset rp
[dsh-rrp] lore runtime armed (worldline scoping via agent.ctx + Session projection)
[dsh-rrp] lore route armed at /dsh-rrp/lore
[dsh-rrp] RP skills visible (0): (none)
[dsh-rrp] card preset rp-maid-heiress skills (8): maid-apartment, …, maid-world-setting
```

RP 基础模式物化到 `<dshHome>/.agent-presets/rp/`，**每张卡**另有一个 `rp-<card-id>` preset（只含该卡的世界知识技能）——所以基础模式显示 `skills (0)` 是正常的，卡包技能在卡 preset 名下逐条打印。

> 启动后新丢进 `cards/` 的卡：卡列表路由会按需补物化它的 `rp-<id>` preset（`ensureCardPreset`），刷新展厅即可直接开局，无需重载插件。

不启动服务器即可确认组合：

```bash
dsh --profile rp-dev --dump-config
# Linux 需要筛选时：... | grep -A2 dsh-rrp
# PowerShell 需要筛选时：... | Select-String dsh-rrp -Context 2,0
```

带 token 访问 `http://127.0.0.1:3099/?token=<启动日志中的 token>`，页面 boot graph 应含 `dsh-rrp/client.js`。

---

## 5. 红线提醒

- 只改 `rp-dev`，不碰日常 `web`；
- 所有注册必须可逆（返回 disposer）；
- 不新增宿主已有能力（见 HOST_ALIGNMENT 第 4 节）；
- **绝不发明会话事件类型**（会让整个日志不可读）；
- **不在陌生 context 上属性读取服务**（用 `ctx.get(name)`；agent 生命周期监听器整体 try/catch）。

> 这几条的成因、证据与正确写法见 [`reference/HOST_SEAMS.md`](reference/HOST_SEAMS.md) —— 每一条都是真实踩过的坑。
