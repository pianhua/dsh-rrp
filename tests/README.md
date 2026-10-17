# 测试分层

按**测试依赖什么**分层，不按测哪个模块分。改一个模块时，先判断自己该落在哪一层，
再决定要跑哪个子集——这是本目录存在的唯一理由。

| 层 | 判定标准 | 数量 | 入口 |
| :--- | :--- | ---: | :--- |
| `unit/` | 纯函数与纯词汇：投影折叠、条件求值、协议解析、命名规则。**不碰 I/O、不碰 DOM、不碰宿主服务** | 30 | `pnpm run test:unit` |
| `integration/` | 与宿主契约对接：HTTP 路由、存储域、文件系统、宿主 face、happy-dom 下的组件渲染 | 32 | `pnpm run test:integration` |
| `e2e/` | 多轮叙事模拟与真宿主现场：从玩家输入一路走到状态落账 | 3 | `pnpm run test:e2e` |

`stubs/` 是共享夹具（UI primitives stub、transcript projections 等），供两层引用，不算测试。

**e2e 层需要先构建**：`e2e/isolated-host.spec.ts` 会真起一个隔离 DSH 宿主，而插件入口是构建产物
`lib/index.js`——跑这一层前必须先 `pnpm run build`，否则等于在测旧代码（spec 会直接报错提醒）。
CI 已按 build → test 的顺序执行。

## 负向对照（这套测试必须会失败）

```sh
DSH_RRP_E2E_WRONG_GOLD=1 pnpm run test:e2e    # 必须非零退出
```

桩把 Author 正文换成 `E2E_WRONG_GOLD_OUTPUT`，`playthrough.spec.ts` 的
「转录条目必须包含 Author 正文」一项立即失败。一条怎么换输入都绿的链断言nothing——
这条命令就是「它会失败」的可复述证明（play-e2e 票据 03/04 的验收项）。

## B1 回归探针结论（票据 04 第 6 条验收）

对 `src/state-publisher.ts` 的 B1 修复（`82ddf5e`）做过回退仪式：改回旧行为后重跑
`playthrough.spec.ts`，**依旧全绿**。原因不是断言不力，而是该元数据分支（fold 游标 /
timeline 批次推进且 facts 渲染未变 → 发一行面包屑）在自然玩局里**没有生产触发源**：
Chronicler 对空 diff 直接跳过发布（不推进游标），而模型侧渲染是完整切面的无损序列化，
任何真实变更必然改变渲染。该分支由 `tests/unit/state-publisher.spec.ts` 两例失败先行的
单测守护；本链另钉死邻接守卫——真实状态变更必须以全文送达模型（fold 提交的事实车道
文本必须包含新渲染，不得只发面包屑）。**重开条件**：未来出现「渲染未变却推进游标或
批次」的生产调用方时，补驱动级 fold-advance 探针（经受支持的 publishState 出口）。

## 日常怎么用

全量约 6 秒，直接 `pnpm test` 即可。子集入口的价值在于**定位**：改 `projection/` 就跑
`test:unit`，改路由就跑 `test:integration`，不必每次都读全部 63 个文件的输出。

CI 仍跑全量——分层是为了让人改代码时知道自己在动哪一层，不是为了拆 CI 作业。

## 放置纪律

新测试文件放进层之后，它对 `src/` 的引用要相应加深一层（`../../src/...`），
对 `stubs/` 的引用是 `../stubs/...`。这类路径修正最容易漏，
所以移动文件后请立刻跑一次 `pnpm run typecheck`——它比测试更早暴露路径错误。
