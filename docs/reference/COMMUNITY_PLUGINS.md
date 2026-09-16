# 社区插件经验（COMMUNITY_PLUGINS.md）

> **为什么读这个**：`dsh-synapse` 只是「能挂上 web」的**局部参考**，不是开发 DSH 插件的唯一标杆。  
> 本文件记录我们从若干**社区成熟插件**中提炼的通用工程规范，作为 `dsh-rrp` 的建仓依据。

---

## 1. 研究对象

| 插件 | 版本 | 定位 | 学到什么 |
| :--- | :--- | :--- | :--- |
| [DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) | 0.19.1 | 原生右侧栏框架 + 工作台 | **迁移到宿主原生侧边栏**；对外暴露扩展服务 |
| [dsh-market](https://github.com/dsh-market/dsh-market) | 1.47.0 | DSH 内插件市场 | 深度接入 Settings；宿主能力探测 + 优雅降级 |
| [dsh-web](https://github.com/zhu1090093659/dsh-web) | 0.1.1 | Web GUI 插件全家桶 | **聚合包（aggregate bundle）** 的组织方式 |
| [dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams) | 0.1.18 | 多 Agent 团队协作 | 基于 `subagent` 的多智体编排；**极重验证** |
| [dsh-mnemon](https://github.com/omdsh-dev/dsh-mnemon) | 0.5.10 | 三层记忆控制面 | 对外暴露 contracts / extension-sdk 的扩展设计 |

---

## 2. 一致的工程形态（可直接照抄的规范）

### 2.1 `package.json` 清单

```jsonc
{
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".":              { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client":       { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
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

**观察结论**：

- `dsh.bundle.patch` 声明服务端插件层；
- `dsh.client.inject` + `platform: "web"` 声明客户端依赖的宿主包 —— **这是客户端接入的声明式契约**；
- DSH 相关包一律进 `peerDependencies`（可选能力配 `peerDependenciesMeta.optional`），**绝不进 `dependencies`**；
- 客户端产物单独导出（`./client`）。

### 2.2 构建与测试

| 项 | 社区共识 |
| :--- | :--- |
| 构建 | **`tsdown`**（+ `tsc` 出 `.d.ts`）几乎全员采用 |
| 语言 | Pure ESM + TypeScript |
| 测试 | `vitest` 或 `node --test` |
| 类型检查 | 独立 `typecheck` 脚本，分 server / client 两份 tsconfig |
| 发布前 | `prepublishOnly` 跑 build + verify |

### 2.3 客户端接入形态

**两种并存形态**：

| 形态 | 说明 | 出现于 |
| :--- | :--- | :--- |
| **声明式 inject（现代）** | `dsh.client.inject` 列出宿主包，client 产物由 `tsdown` 打包 | better-sidebar、market、agent-teams、mnemon |
| **运行时 ModuleLoader** | `window.__ModuleLoader__.load({ id, factory })` 手工装载 | synapse |

**`dsh-rrp` 选择**：现代声明式形态，与主流社区插件一致。

---

## 3. 关键经验（逐条）

### 3.1 UI 必须长进宿主，而不是旁边

`DSH-better-sidebar` 在 **v0.19.0 做了一次重要重构**：废弃自绘浮动面板，全面改为注册 DSH **原生右侧栏**（`ctx.sidebarRightTabs` / `ctx.sidebarRight`），聊天内打开文件统一走 `ctx.sidebarRight.openResource(...)`。

**对我们的意义**：直接印证 D1/D10 的方向 —— WorldState 看板应做**原生右侧栏 Tab**，而不是自绘面板或独立网页。

### 3.2 对外暴露「服务」，让生态可扩展

- better-sidebar 暴露 `ctx.betterSidebar`，提供 `registerTab` / `registerFileViewer` / `registerFileIcon`
- mnemon 导出 `./contracts`、`./extension-sdk`、`./testing` 三个公共入口

**对我们的意义**：卡包格式（D13）未来可考虑提供**扩展 SDK**，但**不作为第一版目标**；先可用，再可扩展。

### 3.3 宿主能力探测与优雅降级

`dsh-market` 明确写了：宿主过旧时**自我禁用并在控制台说明原因**，而不是在缺失的 primitives 上硬渲染。

**对我们的意义**：`dsh-rrp` 应声明最低宿主版本，并在能力缺失时给出清晰诊断而非崩溃。

### 3.4 聚合包（Aggregate Bundle）的组织方式

`dsh-web` 的根 `package.json` 几乎是空的，只依赖一个 `@linxin666/dsh-web-all`，并让 `dsh.bundle.patch` 指向聚合包内的 patch：

```jsonc
{
  "dsh": { "bundle": { "patch": "./packages/dsh-web-all/cordis.patch.yml" } },
  "dependencies": { "@linxin666/dsh-web-all": "0.3.23" }
}
```

**对我们的意义**：这正是 **D1「插件组合成一个自定义 RP 模式」** 的成熟先例 —— 未来 `dsh-rrp` 也可以是「聚合包 + 若干子包」结构，把 RP 模式一次装好。

### 3.5 多智体用官方 `subagent`

`dsh-agent-teams` 的多 Agent 团队协作建立在官方 `@deepseek-ai/dsh-subagent` 之上，没有自研进程编排。

**对我们的意义**：**D4 的 Chronicler / D11 的 Summarizer** 应优先考虑官方 subagent 机制，而不是自建编排流水线（对照旧项目 `src/runtime` 的教训）。

### 3.6 验证要硬

`dsh-agent-teams` 的 `verify` 脚本包含：`harness-contract`、`compatibility`、`doctor`、`capabilities`、`http-body`、`lifecycle`、`stress`，并有 `compatibility.json` 声明兼容矩阵。

**对我们的意义**：个人玩具**不需要**全套重型验证（D15），但**需要**：
- 宿主挂载能真的跑起来（真实 `dsh web` 加载）
- 注册可干净卸载（HMR 安全）
这两条必须保留。

---

## 4. 对 `dsh-rrp` 的落地结论

| 维度 | 决定 |
| :--- | :--- |
| 语言/构建 | TypeScript + ESM + `tsdown` |
| 客户端形态 | 声明式 `dsh.client.inject`，产物单独导出 `./client` |
| UI 落点 | 原生 Slot + 原生右侧栏，**零自绘整站** |
| 宿主依赖 | 全部 `peerDependencies`，声明最低版本 |
| 多智体 | 优先官方 `subagent` / `agents` |
| 验证 | 只保留「能挂载 + 可卸载 + 域逻辑单测」，拒绝重型矩阵 |
| 未来形态 | 可演进为聚合包（参考 dsh-web 全家桶） |

---

## 5. 版本基线

社区活跃插件当前共同锚定在：

```text
@deepseek-ai/dsh  >= 0.1.5-rc.1   （部分已适配 0.1.6-alpha）
@deepseek-ai/cordis  ^4.0.2
```

`dsh-rrp` 采用同一基线；若必须兼容更旧宿主，走 3.3 的「探测 + 降级」路径，而不是写兼容层。
