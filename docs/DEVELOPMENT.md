# 开发环境与日常流程（DEVELOPMENT.md）

> 面向本仓库的开发者（人类与 AI）：一条命令构建，一条命令挂到真实 DSH 验证。
> 契约层仍是 [`../AGENTS.md`](../AGENTS.md) 与 [`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md)。

---

## 1. 本机基线（实测）

| 项 | 值 |
| :--- | :--- |
| `dsh` CLI | 0.1.5-rc.1 |
| 宿主包（`@deepseek-ai/dsh-*`） | 0.1.5-rc.2（嵌在全局 dsh 安装内，非顶层包） |
| Node | v24.16.0 |
| 包管理器 | pnpm 10.14.0 |
| 构建 | tsdown 0.23.0 + typescript 5.9 |

> `docs/reference/dsh-plugin-development-research.md` 基于 **0.1.6-alpha.1** 编写，比本机宿主新一档；涉及宿主细节时以本机实测为准。

---

## 2. 一次性准备

```bash
pnpm install     # devDependencies：cordis / typescript / tsdown / vitest / @types/node
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

`dsh plugin` 转发给 pnpm，而 pnpm 的 `link:` 协议把路径**按 profile 目录相对**解析。本仓库在 `D:\`、`$DSH_HOME` 在 `C:\` 时跨盘相对路径不存在，于是生成断链，并报 `declares no dsh.bundle`。

`scripts/link-dev.mjs` 改用 **NTFS 目录联接（junction）**（跨盘可用、Node 解析器可跟随），并直接把包登记进 `dsh.profile.bundles`。链接后 `node_modules/dsh-rrp` 指向本仓库，改源码 → `pnpm run build` 即生效。

---

## 4. 日常循环

```bash
pnpm run typecheck                              # 类型检查
pnpm test                                       # vitest：HMR 安全（挂载/卸载无残留）
pnpm run build                                  # 构建 host + client
dsh --profile rp-dev --port 3099 --no-open      # 真实宿主验证
```

启动日志中应出现：

```
[dsh-rrp] host half active (stage 1 skeleton)
...
[dsh-rrp] host half disposed
```

不启动服务器即可确认组合：

```bash
dsh --profile rp-dev --dump-config | grep -A2 dsh-rrp
```

带 token 访问 `http://127.0.0.1:3099/?token=<启动日志中的 token>`，页面 boot graph 应含 `dsh-rrp/client.js`。

---

## 5. 红线提醒

- 只改 `rp-dev`，不碰日常 `web`；
- 所有注册必须可逆（返回 disposer）；
- 不新增宿主已有能力（见 HOST_ALIGNMENT 第 4 节）。
