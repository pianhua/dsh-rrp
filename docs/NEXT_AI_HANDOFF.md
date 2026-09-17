# 后续 AI 执行交接（2026-09-17）

> 本文是当前重构完成后的唯一执行队列。当前接手者只整理交接，不再继续写功能或执行验证。下一位 AI 必须先读 [`HANDOFF.md`](HANDOFF.md) 第 4 节、[`DESIGN.md`](DESIGN.md)、[`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) 与 [`reference/DECISIONS.md`](reference/DECISIONS.md)，然后按本文顺序推进。

## 0. 当前停点

本轮架构收敛、文档同步与对应测试**已提交**于 `815c883`（`refactor: isolate RP saves on native sessions`）；本文件记录的是该提交后的停点。不要 `reset`、`checkout` 或回退它；如需继续，只在其之上追加提交。

| 主题 | 已落地事实 | 主文件 |
| :--- | :--- | :--- |
| 卡包隔离 | card id 只接受 canonical kebab-case；每张卡物化为 `rp-<card-id>` preset，避免 Skills 跨卡泄漏 | `preset-id.ts`、`cards.ts`、`preset.ts` |
| 存档与世界线 | Card、WorldState、Summary、Settings、Sediment 都是 Session 投影；同卡重开是新 Session，fork 继承前缀后分流 | `projection/*`、`state-publisher.ts` |
| D8 典籍 | 确认/删除追加已知 `user/message.source.rrp.sediment`；旧 sidecar 仅一次迁移并改名 `.legacy.bak` | `sediment-state.ts`、`projection/sediment.ts`、`sediment-*.ts` |
| 每局摘要 | `/summary` 写 `rrpSettings`，不再用进程全局开关；新存档独立，fork 继承切点设置 | `settings.ts`、`projection/settings.ts`、`summarizer.ts` |
| Workspace | 展厅只读宿主原生 Workspace，并把 `workspaceId` 传给 `sessions.create`；它不是 RP 状态库 | `client/gallery-panel.tsx` |
| 失败传播 | 开卡、矫正、D8、纪事官、编年官都会暴露 `publishState()` 失败 | `start.ts`、`correction.ts`、`sediment-route.ts`、`chronicler.ts`、`summarizer.ts` |

### 不可回退的宿主时序事实

展厅开局顺序为 `sessions.create({})` → `agentPresets.select(sessionId, "rp-<card>")` → `POST /dsh-rrp/start`。`Session.header.agentPreset` 只是创建事实，通常为空；当前 preset 的唯一真源是：

`ctx.sessionProjections.stateOf(session, 'agentPreset')`

- `start.ts` 必须以该投影验证卡与 preset 是同一张卡。
- `sediment-runtime.ts` 必须同时处理 `agent/created` 与 `agent-preset/selected`，才会为展厅新局挂载 D8 provider。
- 离开 RP preset 或 agent 销毁时必须卸载 provider；绝不能放进全局或 preset standing 层。

不要为了“简化”退回 header 判断或只监听 `agent/created`。这会造成卡/Skills 错配，并让新开局的典籍失效。

### 验证责任

`815c883` 上的基线已由接手者在 2026-09-17 独立复跑确认：`pnpm test` 21 文件 / 117 用例通过，`pnpm run typecheck`、`pnpm run build`、`git diff --check` 全部通过，工作树干净。这仍是**提交 `815c883` 的证据**；下一位 AI 不应把它当作任何新改动的证据，而应为自己引入的改动重新取证。

真实宿主验收仍待完成，见 [`reference/MANUAL_TEST.md`](reference/MANUAL_TEST.md) §8-§10。只能使用 `rp-dev:3099`，绝不碰日常 `web:3080`。

## 1. 严格执行顺序

1. 外部测试者完成 `815c883` 的自动回归和 `rp-dev` 手工验收（自动回归已由接手者复跑通过，见 §0「验证责任」；手工验收仍未完成）。
2. 若发现回归，只修该回归，交回测试者；不趁机扩展功能。
3. 验收稳定后，先取得所有者对 D5 的明确设计决定。
4. D5 完成或正式收窄后，处理 D6 自然时序。
5. 最后才处理轮询、生命周期、YAML 解析与可选产品增量。

在 D5/D6 明确前，不增加 P4 输入区接管、典籍草稿编辑、记忆系统、酒馆兼容或新的卡包格式。

## 2. P0：外部验收与回归处理

**责任人**：测试者。下一位 AI 只根据可复现失败修复。

测试者应执行：`pnpm run typecheck`、`pnpm test`、`pnpm run build`、`git diff --check`。期望测试仍为 21 文件 / 117 用例；数量变动必须说明新增/删除原因。

`rp-dev` 至少验证以下链路，并留下复现步骤、Session id、日志/轨迹、预期和实际：

1. 展厅选择 Workspace 后，新 Session 出现在该原生 Workspace；未选择时未分组。
2. 同卡连续开两局：WorldState、`/summary off`、D8 典籍互不影响。
3. 已选 `rp-<card>` 后 `/start` 只接受同卡；开场白、初始状态和卡包 Skill 正常出现。
4. D8 确认后下一轮出现动态 Skill；同卡另一存档不可见。
5. 从 D8 写入后的切点 fork：子局继承；父/子随后新增或删除互不影响。
6. 旧 sidecar 成功时写一条 `snapshot` 并留下 `.legacy.bak`；故意追加失败时源目录仍在。
7. 宽/窄窗口、亮/暗主题下，展厅、Workspace 选择器、世界状态和典籍均无溢出、遮挡或控制台错误。

## 3. P1：D5 动态世界状态，先设计后编码

**状态**：设计决策要求“可受控动态演进”，当前仍固定为 `characters / inventory / scene / flags`。这是最大规格缺口。

AI 不得自行选数据模型。先向所有者确认二选一：

| 选择 | 含义 | 必须后果 |
| :--- | :--- | :--- |
| A. 兑现 D5 | 保留四域易用入口，同时支持受控自定义维度/字段 | 改领域词汇、投影 schema、Chronicler 契约、渲染、测试和迁移策略 |
| B. 收窄 D5 | 四域固定结构即第一版产品规格 | 更新 `DESIGN.md` 与 `DECISIONS.md`，移除可任意新建结构/公式的承诺 |

若选 A，先单独做设计回合，至少回答：动态字段稳定 id、展示名和值类型；卡包与 Chronicler 各自的扩展权限；公式是否只是文本说明（默认）还是可计算表达式；旧四域如何映射；fork、旧 Session 与 wire schema 如何兼容；右栏如何可读可编辑而不退化成裸 JSON。

预计涉及：`world-state.ts`、`projection/world-state.ts`、`agents/chronicler.ts`、`chronicler.ts`、`state-publisher.ts`、`client/world-state-tab.tsx`、`contracts.ts`、相关测试与设计文档。

禁止：动态 `any` 黑洞、任意代码执行、通用公式引擎、单独数据库、CAS/锁、每维度新建事件类型。

验收：新增维度在同一 Session 可显示/编辑/被 Author 消费；fork 正确继承/分流；无效变更不污染投影；四域体验不倒退。

## 4. P2：D6 自然时序封口（不引入锁）

**问题**：Chronicler 后台推演旧状态时，玩家仍可保存；若旧推演随后追加，可能覆盖玩家值。

不变约束：不使用 CAS、版本比较、分布式锁、永久禁用或后台重试矩阵；不让玩家等待正文；Author 和 Chronicler 保持异步；下一轮始终读取当时最新投影。

推荐最小方向：Chronicler 推演开始到 committed/failed 期间，右栏把“保存矫正”改为不可提交，并显示等待纪事官落账；完成后从最新投影重载，玩家再保存。这是引导自然顺序的 UI gate，不是数据锁。

编码前先查宿主 Jobs/活动状态是否可直接在 client 消费。不要为此再加轮询或平行持久化；若没有可用 client seam，保留现有活动账本作为过渡时必须记录理由。

预计涉及：`chronicler.ts`、`activity.ts`、`client/world-state-tab.tsx`，必要时 `activity-route.ts`；不应改变 Session 投影的整值规则。

验收：推演中 UI 不会提交；完成后显示最新状态；玩家保存后下一轮 Author 使用玩家值；推演失败/取消自动恢复；刷新和 fork 不留下永久禁用状态。

## 5. P3：轮询和 Map 生命周期收敛

### 5.1 两条轮询

`world-state-tab.tsx` 轮询活动账本，`sediment-tab.tsx` 轮询草稿/典籍路由。处理顺序：先查当前 DSH client Jobs、Session projection wire 和 UI seam；持久的 WorldState/Sediment 直接使用宿主 projection 推送；临时 Scribe 草稿和活动状态优先挂宿主 Jobs UI；如果仍要历史账本，再单独设计投影归属。删除 timer 后同步更新 `HOST_ALIGNMENT.md`、`HANDOFF.md` 与手工验收表。

### 5.2 Map 生命周期

| Map | 现状 | 目标 |
| :--- | :--- | :--- |
| `RETAINED`（`state-publisher.ts`） | Session 销毁后可能残留发布指纹 | 在 Session/agent 生命周期结束时移除，或确认宿主替代 |
| `LEDGERS`（`activity.ts`） | 仅进程内，按 Session id 累积 | 明确短期 UI 状态，在 Session 结束时释放；若要持久化，另做设计 |
| `PENDING`（`sediment-route.ts`） | Scribe 草稿短暂驻留进程 | job 完成、确认、丢弃、失败、Session 结束都释放 |
| `ARMED`（`sediment-runtime.ts`） | provider 生命周期 | 当前已在 preset 退出/agent disposed 时释放，后续必须保持 |

不得用磁盘扫描、定期 GC timer 或自建全局 store 替代清理。

## 6. P4：正式 YAML 与卡包健壮性

`cards.ts` 的 YAML-like frontmatter parser 不得继续扩展。改用受维护 YAML parser，但不要依赖宿主的 transitive dependency。parser 只把 frontmatter 转普通对象；Card/WorldState 仍由本项目 schema 校验。覆盖无 frontmatter、无效 YAML、多行标量、数组、嵌套 player、引号和注释。完成后删除旧 parser，不能两套语义并行；仍不兼容酒馆卡字段。

## 7. P5：可选产品增量

P1-P4 完成后才按序考虑：第二张有意义的官方测试卡；D8 草稿就地编辑（确认前不写 Session）；以 `conversation.composer` seam 做 P4 输入区适配；多语言、文案与可访问性精修。

记忆系统、酒馆卡 AI 转译、正文节点 shadow、独立地图、数据库、多用户能力均不在当前队列。

## 8. 下一位 AI 首轮清单

1. 只读确认 `git status --short`，阅读本文和 `HANDOFF.md` §4；不清理或回退 `815c883`。
2. 等待或读取测试者的 P0 结果；失败先最小修复。
3. 向所有者确认 D5 选 A 还是 B；未确认不得编码 D5。
4. D5 有结论后单独设计并实现；随后才处理 D6。
5. 每完成一个切片，同步 `ACTIVE_TASK.md`、`HANDOFF.md` 与必要的 `reference/` 决策文档；测试继续交由外部测试者执行。
