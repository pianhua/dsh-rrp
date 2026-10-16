# 测试分层

按**测试依赖什么**分层，不按测哪个模块分。改一个模块时，先判断自己该落在哪一层，
再决定要跑哪个子集——这是本目录存在的唯一理由。

| 层 | 判定标准 | 数量 | 入口 |
| :--- | :--- | ---: | :--- |
| `unit/` | 纯函数与纯词汇：投影折叠、条件求值、协议解析、命名规则。**不碰 I/O、不碰 DOM、不碰宿主服务** | 30 | `pnpm run test:unit` |
| `integration/` | 与宿主契约对接：HTTP 路由、存储域、文件系统、宿主 face、happy-dom 下的组件渲染 | 32 | `pnpm run test:integration` |
| `e2e/` | 多轮叙事模拟：从玩家输入一路走到状态落账 | 1 | `pnpm run test:e2e` |

`stubs/` 是共享夹具（UI primitives stub、transcript projections 等），供两层引用，不算测试。

## 日常怎么用

全量约 6 秒，直接 `pnpm test` 即可。子集入口的价值在于**定位**：改 `projection/` 就跑
`test:unit`，改路由就跑 `test:integration`，不必每次都读全部 63 个文件的输出。

CI 仍跑全量——分层是为了让人改代码时知道自己在动哪一层，不是为了拆 CI 作业。

## 放置纪律

新测试文件放进层之后，它对 `src/` 的引用要相应加深一层（`../../src/...`），
对 `stubs/` 的引用是 `../stubs/...`。这类路径修正最容易漏，
所以移动文件后请立刻跑一次 `pnpm run typecheck`——它比测试更早暴露路径错误。
