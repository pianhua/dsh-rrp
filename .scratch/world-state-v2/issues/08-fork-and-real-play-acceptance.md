Status: resolved

# WorldState v2 fork、双入口与真机验收

## Scope

在全部前置切片完成后，验证真实 DSH 会话中的新建卡、状态推演、双入口草稿、时间线、fork、父线/子线历史、秘密可见性和两张官方卡。补齐必要的宿主集成 seam 测试和真机验收报告。

## Acceptance

- `maid-heiress` 与 `yanmen-inn` 均可新建会话并使用新 schema/初始状态。
- 浏览器中主会话页签与右侧栏显示同一草稿；保存、取消、切换 Session 和推演合并符合规格。
- 真实 Chronicler 变化进入 timeline；无变化/失败不进入；状态预算和主要占用可见。
- 真实 fork 后父线历史、继承历史和子线本地历史边界正确；迟到推演不伪造进子线。
- 运行项目标准质量门及 host/browser 真机验证，输出结果后才可关闭规格。

## Blocked by

01-domain-model-and-projection
02-card-schema-and-official-cards
03-persistent-worldstate-timeline
04-chronicler-and-author-contract
05-player-correction-and-safe-writes
06-worldstate-dual-ui-and-shared-draft
07-visibility-and-secret-boundary

## Automated acceptance added

- `tests/fork-replay.spec.ts` now models a parent fork prefix, a parent-late Chronicler batch, and a child-local batch. The child fold consumes only the physical prefix plus child events, excludes the late parent batch, and asserts `origin: 'inherited'` / `origin: 'local'` are preserved exactly rather than inferred from sequence numbers.
- `tests/world-state-timeline-route.spec.ts` verifies the read-only timeline route disposer unregisters the host route.
- `tests/host-mount.spec.ts` verifies the v2 timeline projection registration is released by the plugin unload effect.
- `tests/cleanup.spec.ts` verifies the existing v2 draft reset seam removes a dirty session draft; existing session/agent/plugin cache cleanup coverage remains green.
- 真机验收期间新增回归测试：hidden 内容恢复语义（world-state-references.spec）、Chronicler 信封修复（definition 词表/裸名引用/非有限数，chronicler.spec）、校验失败一次引导重试（chronicler.spec runner）、diff 省略 undefined 侧（world-state.spec）。

## Verification

- Passed targeted acceptance: `pnpm exec vitest run tests/fork-replay.spec.ts tests/world-state-timeline-route.spec.ts tests/host-mount.spec.ts tests/cleanup.spec.ts --reporter=dot` — 4 files / 19 tests.
- Passed `pnpm run typecheck` / `pnpm run lint` / `pnpm run format:check` / `git diff --check`.
- After the automated acceptance follow-up, the primary agent reran the full gate on this branch: environment, format, typecheck, lint, Vitest (55 files / 410 tests), build and `git diff --check` all passed.

## 2026-09-25 real host + browser acceptance（内置浏览器，宿主 0.1.6-alpha.2 @ 127.0.0.1:3099）

环境处置：本机全局 npm 宿主确认为基线 `0.1.6-alpha.2`（与 HOST_BASELINE 一致，用户亦在桌面备好同版本 tarball）；发现 `~/.dsh/.dsh-rrp/cards/maid-heiress` 存在 9/20 的 v1 时代用户目录残留卡，优先于随包卡导致 `when` 条件注入报旧路径语法错误——已移出为 `maid-heiress.v1-stale-20260920` 备查，启动日志恢复干净。host-runner 经直接 node 启动 + 手工补登 runner 元数据完成验证（PID/token/cookie 均核验，`.scratch/dsh-host.json`）。

真机验收结果（全部通过）：

- 双卡新建会话：`女仆大小姐·主线4`（session-c9006c21）与 `雪夜雁门客栈·主线2`（session-4a6c698f）均正确发布 v2 初始状态基线；追踪对象/卡包字段/hidden 占位提示渲染正常；雁门卡无好感字段，字段随卡包 schema。
- 双入口共享草稿：主区页签改 `好感 6→7`，右侧栏同会话草稿同步显示「未保存」徽标与数值；反向改 `7→8` 两侧同步。
- 玩家矫正：预览摘要 → 确认 → 提交成功；timeline 出现 `actor: player, origin: local` 批次（affinity 6→8）。
- 真实 Chronicler：正文回合后异步推演成功提交 13 项变化（场景时间/天气推进、好感 8→9、外貌/情感/穿搭更新、新增认知与 4 项当前事件）；失败轮次不产生 timeline 批次。
- fork：`主线4 (1)`（session-2788a04e）从末条 assistant 消息分叉；子线 timeline 只含物理前缀（baseline + 父线 player 批次），父线在其后提交的 chronicler 批次被正确排除；子线本地矫正生成新 `actor: player, origin: local` 批次，父线 3 批次不受影响。
- hidden 边界：`mia_identity`（visibility: model）不进入玩家视图，UI 显示「部分世界信息不公开」占位。

真机验收期间修复的缺陷（代码级，均含回归测试）：

1. **玩家矫正全灭**：投影 wire 即 player 过滤视图，玩家候选态天然不含 hidden 内容，而 `preserveAndCheckHiddenContent` 对缺失一律拒绝——任何带秘密的卡保存必失败。改为：缺失→从 prior 恢复；携带但被改写→仍拒绝；新建 hidden→仍拒绝。
2. **Chronicler 值漂移**（flash 模型）：`definition` 自造词、裸名字符串引用、非有限数（1e999→Infinity，宿主事件日志拒绝负零/非有限数）——解析前确定性信封修复。
3. **Chronicler 结构漂移**：空集合无样例可抄，模型自造键名——user prompt 增加「v2 结构样例」块；校验失败增加一次带 issue 列表的引导重试。
4. **diff 带 undefined 侧**：added/deleted 变更的 before/after 显式 undefined，宿主 append 拒绝——变更记录省略缺失侧（方向由 type 表达）。
5. 可观测性：校验失败日志附带 zod issue 路径；`DSH_RRP_DEBUG_DUMP` 环境变量可落盘畸形回复；`appendLane` 拒绝时报首个不可序列化路径。

已知遗留（非本分支功能缺陷，记录备查）：

- ~~主区世界状态页签在**左侧栏折叠为图标轨**时内容左侧被裁约一栏宽~~（已在同日修复：`S.root` 补 `width/minWidth:0`，`S.scroll` 显式 `overflowX:'hidden'`，消除焦点触发的持久横向滚动与 flex 最小宽溢出；图标轨/展开侧栏两种形态真机复验均渲染正常。）

最终质量门（本分支工作区）：format / typecheck / lint / Vitest 55 files·416 tests / build / git diff --check 全绿。
