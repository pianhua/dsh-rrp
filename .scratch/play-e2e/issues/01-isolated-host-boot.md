# 票据 01：隔离宿主现场（一次性 profile + 端口 0 + 跑完即焚）

> Status: resolved（2026-10-17）· 依赖：无 · 规格真源：[`spec.md`](../spec.md) §2 §3

## 定位升级（开工前必读）

勘察发现：**本机 `rp-dev` profile 已不存在**——`~/.dsh/profiles/` 下只剩 `desktop`，其
`cordis.patch.yml` 是空数组 `[]`（未插 `dsh-rrp`），全盘搜不到 `rp-dev` 目录；而
`scripts/host-runner.mjs` 默认 `--profile rp-dev`（`:39`）且**不设置 `DSH_HOME`**（继承 env）。
后果：worklog 2026-10-13 记录的那条真机验收路径**今天已不可复现**，照原命令起只会得到一个
没加载插件的空 profile。

所以本票据不只是"给测试用"：它是**唯一还能从源码重建运行现场的入口**。做完后，
`rp-dev` 这类机器本地状态就不再是验收前提。

## 目标

提供一个测试专用启动器，能在**不碰开发用 `rp-dev`/3099** 的前提下，起一个只加载本次所需插件、模型指向桩、跑完自动销毁的宿主现场。

## 现状与缺口

`scripts/host-runner.mjs` 是面向人工开发的：端口固定 3099（`:38`）、profile 固定 `rp-dev`（`:39`）、`resolveDshBin()` 解析顺序 repo→`~/.dsh-rrp/host`→全局（`:70-96`）、spawn 参数 `--profile --port --no-open`（`:386-395`）、**继承 `process.env` 且没有 `--home`/隔离模式**。`src/home.ts:10-12` 的 home 取 `DSH_HOME ?? ~/.dsh`。

参照做法（已核实可行）：`dsh-tavern/tests/e2e/gameplay.mjs:132-153` 写一次性 profile 目录——软链 `node_modules/@deepseek-ai`、生成 `package.json` bundles、写 `cordis.patch.yml` 选择 provider 并插入桩插件绝对路径——再以 `DSH_HOME`/`DSH_CWD` + `--port 0` 启动（`:178-180`）。

## 已核实的现场配方（照此实现，勿再猜）

- **profile 落点**：`$DSH_HOME/profiles/<name>/`（实测 `~/.dsh/profiles/desktop/` 内含 `package.json` + `cordis.yml` + `cordis.patch.yml` + `pnpm-workspace.yaml`）；
- **插件从构建产物加载**：`dsh-rrp` 的 `main` 是 `lib/index.js`，故 E2E 前**必须先 `pnpm run build`**——改 `src/` 不重构建等于在测旧代码；
- **env 白名单**（照抄 `gameplay.mjs:186`）：只透传 `PATH/HOME/TMPDIR/LANG/LC_ALL/SYSTEMROOT`，**故意不继承凭据**——这样"桩在服务"是被证明的而不是被假设的；配 `--host 127.0.0.1 --port 0 --no-open`；
- **取 URL**：轮询 stdout 正则 `https?://(?:127\.0\.0\.1|localhost):\d+[^\s\u001b]*`，子进程提前退出即刻报错（`gameplay.mjs:199-203`）；
- **重启套路**（票据 04 的"重启不丢"要用）：`SIGTERM` → 等 `exit` 事件 → 断言 `exitCode !== null` → 再启（`gameplay.mjs:206-213`）。

## 范围

- 新增 `tests/e2e/support/isolated-host.mjs`（或 `.ts`，与 vitest 配置一致）：
  - 建临时目录（`os.tmpdir()` 下，测试结束 `rm -rf`，失败也清）；
  - 软链 `@deepseek-ai` 作用域目录（Windows 下用 junction 或 `mklink /J`，失败即明确报错，不静默降级）；
  - 生成 `cordis.patch.yml`：插入 `dsh-rrp` 本体 + 桩插件，设 `agent-default-model` 为桩 provider；
  - 以 `DSH_HOME=<tmp>`、`DSH_CWD=<tmp>`、`--port 0` 启动，**显式清空代理环境变量**（沿用 `host-runner.mjs:299-308` 的剥离逻辑，勿重写第二套）；
  - 解析实际监听端口并暴露 `baseUrl`；返回 `close()` disposer。
- **不改** `scripts/host-runner.mjs` 的人工开发行为；若可复用其函数，抽成共享模块而不是复制粘贴。

## 验收

- 一个 spec 起→停一次隔离宿主，断言：端口非 3099、`DSH_HOME` 指向临时目录、退出后临时目录不存在；
- 连跑 3 次无残留、无端口冲突；
- 开发用 `rp-dev`/3099 的现场与 `.scratch/dsh-host.json` **零改动**（用 `git status` 与文件 mtime 证明）；
- `pnpm run typecheck && pnpm run lint && pnpm run test:e2e` 通过。

## out-of-scope

不加载真实模型、不断言任何 RP 业务事实（票据 04 的活）。

## Comments

**2026-10-17 交付**：`tests/e2e/support/isolated-host.ts` + `tests/e2e/isolated-host.spec.ts`。
公共逻辑抽成 `scripts/host-runtime.mjs`（配 `host-runtime.d.mts`，沿用本仓库
`host-runner-ownership.d.mts` 的声明文件套路），`host-runner.mjs` 改为引用同一份
`resolveDshBin` / `getCleanEnv`，人工开发行为不变。

实测结论，三条都是开工前不知道的：

1. **隔离现场真的能起来**：单宿主冷启动约 3.9 秒，`/dsh-rrp/cards` 返回 200 + JSON；
   连起连停三次端口各异、临时目录全部销毁。`rp-dev` 失踪后这是第一次从源码重建出现场成功。
2. **插件路由不需要登录**：`webServer` 路由确实不在宿主鉴权门内（勘察时只是推断，现在有了证据）。
   票据 04 因此可以直接 `fetch` 断言后端事实，不必处理 cookie。
3. **CI 顺序是错的**：`quality.yml` 原本 Test 在 Build 之前，而本层依赖构建产物 `lib/index.js`
   —— 干净检出上必然红。已把 Build 提到 Test 之前（独立提交）。顺带说明：此前 `pnpm test`
   与 `build` 从未在同一 CI 作业里按依赖顺序校验过，只有 `prepublishOnly` 会碰。

**Windows 细节**：目录链接必须用 `junction` 而非 symlink（后者要开发者模式）；
临时目录里 1900+ 条链接用 `rm -rf` 与 PowerShell 都会因长路径失败，
`maxRetries` + `force` 的 `rmSync` 在本场景可用（残骸只出现在被外部工具占用的 worktree 里）。
