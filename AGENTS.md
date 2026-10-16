# AGENTS.md — dsh-rrp 协作准则

> DSH-Chronicle：挂在 DeepSeek Harness 上的**正统薄插件**，个人单机沉浸式角色扮演引擎。
>
> **领域词义见 [`CONTEXT.md`](CONTEXT.md)。** 动代码前先读相关词条——本文件只讲纪律，
> 不重复文档里已有的定义、架构和流程。

## 铁律

违反会真机爆炸，任何改动前必读（背景与接缝清单见 [`CONTEXT.md`](CONTEXT.md) 与
[`docs/dev/host-seams.md`](docs/dev/host-seams.md)）：

1. **绝不发明会话事件类型** —— 状态一律寄存在已知 `user`/`message` 的 `source.rrp` 上；
2. **不在陌生 context 上属性读取服务** —— 能力用 `ctx.get(name)` 取；智体生命周期监听器整体 `try/catch`；
3. **注入上下文只追加、绝不 replace** —— 前缀缓存是性能命脉。

## 定位：个人玩具，拒绝过度工程

开源后仍是单人单机部署形态。**不引入**分布式锁、多进程租约锁、冷备加密、CAS 乐观锁防冲突矩阵、
并发压力测试、多租户鉴权。

发现准备写 `http.createServer`、自建 SQLite 连接池、自制整站弹窗时，立即停手去找对应的宿主能力。
代码追求精炼透明，每一行都直接服务于游玩体验。

## 提交

每完成一个较大的功能点或修复，立即单独提交一次，提交只包含该功能点，避免混入无关改动。
纯文本、按钮位置这类琐碎改动不必自动提交。

## 质量门

改完必须全绿，CI 跑的是同一组：

```sh
pnpm run format:check && pnpm run typecheck && pnpm run lint && pnpm test
```

发布前再加 `pnpm run build`。

## 真机验收

**一个功能一份报告**：落 `docs/reference/acceptance/<FEATURE>_ACCEPTANCE.md`，截图存同目录
`screenshots/`，报告用相对路径引用。**复验与回归覆盖更新原文件并追加「复验轮次」小节，
禁止 `R2`/`R3`/`ROUND-N` 平行文件**——并行多份报告只会让后来者猜哪份有效。

仓库不保留过程产物：被取代的测试轮次、过期项目调研、一次性计划快照一律不进主线。
翻旧账走 git 历史。

## 文档真源

| 要回答的问题 | 去哪 |
| :--- | :--- |
| 这个词是什么意思、**边界在哪** | [`CONTEXT.md`](CONTEXT.md) |
| 中文 UI 名对应哪个英文标识符、哪些旧词禁用 | [`docs/reference/GLOSSARY.md`](docs/reference/GLOSSARY.md) |
| 为什么是这个设计、动它要付出什么 | [`docs/adr/`](docs/adr/) — 一条决策一篇 ADR，带状态栏 |
| 产品目标规格与交互基线 | [`docs/DESIGN.md`](docs/DESIGN.md) |
| 宿主能力映射与红线 | [`docs/HOST_ALIGNMENT.md`](docs/HOST_ALIGNMENT.md) · [`docs/dev/host-seams.md`](docs/dev/host-seams.md) |
| 数据往哪流、模块怎么切 | [`docs/dev/architecture.md`](docs/dev/architecture.md) |
| 需求流程、票据落点与开工门 | [`docs/dev/workflow.md`](docs/dev/workflow.md) |
| 玩家怎么玩 / 作者怎么做卡 | [`docs/guide/`](docs/guide/) · [`docs/authoring/`](docs/authoring/) |
| 真机验收结论与证据 | [`docs/reference/acceptance/`](docs/reference/acceptance/) |

人、primary Agent 与 delegated Agent 之间的权限、提问与交接，见
[`docs/agents/human-agent-contract.md`](docs/agents/human-agent-contract.md)。
