# 票据 01：隔离宿主现场（一次性 profile + 端口 0 + 跑完即焚）

> Status: ready-for-agent · 依赖：无 · 规格真源：[`spec.md`](../spec.md) §2 §3

## 目标

提供一个测试专用启动器，能在**不碰开发用 `rp-dev`/3099** 的前提下，起一个只加载本次所需插件、模型指向桩、跑完自动销毁的宿主现场。

## 现状与缺口

`scripts/host-runner.mjs` 是面向人工开发的：端口固定 3099（`:38`）、profile 固定 `rp-dev`（`:39`）、`resolveDshBin()` 解析顺序 repo→`~/.dsh-rrp/host`→全局（`:70-96`）、spawn 参数 `--profile --port --no-open`（`:386-395`）、**继承 `process.env` 且没有 `--home`/隔离模式**。`src/home.ts:10-12` 的 home 取 `DSH_HOME ?? ~/.dsh`。

参照做法（已核实可行）：`dsh-tavern/tests/e2e/gameplay.mjs:132-153` 写一次性 profile 目录——软链 `node_modules/@deepseek-ai`、生成 `package.json` bundles、写 `cordis.patch.yml` 选择 provider 并插入桩插件绝对路径——再以 `DSH_HOME`/`DSH_CWD` + `--port 0` 启动（`:178-180`）。

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
