# dsh-tavern × dsh-rrp 细节对比（功能 / 代码块 / 内容级）

> 日期：2026-10-13 · 方法：四维度逐项精读双方源码与设计文档，逐项判定优劣。
> A = dsh-tavern（学习对象，C:\Users\10697\Desktop\Dsh-Expand\dsh-tavern）
> B = dsh-rrp（本项目，D:\projects\dsh-rrp）
> 判定只写有代码/文档证据的项；证据不足标「未覆盖」，不采信推断。

---

## 一、正文生成与上下文编排

| 维度 | 判定 | 理由与证据 |
| --- | --- | --- |
| 系统提示词结构 | 平 | A 分层更细（卡/卡系统提示/常驻世界书/偏好分段+版本化快照，`docs/design/foreground-story-prompt.md`、`lib/domain/session-stable-prefix.js`）；B 契约化更强（统一六层接口、类型化单一事实源，`src/agents/contract.ts`、`src/agents/author.ts`） |
| 缓存友好上下文组装 | **A 优** | 双方都有"静态前缀+易变尾部"意识，但 A 有开局快照复用/版本迁移、系统提示同值不重复追加、失败重放原样保前缀（`foreground-story-prompt.md` §2/§5、CONTEXT.md `Failed Turn Replay`）；B 只有约定级 M1（`contract.ts`） |
| 世界知识激活 | 平（互补） | B 的 `when:` 确定性裁决块"保下限"更可靠（`src/lore/lore-condition.ts`）；A 的关键词+BM25+召回日志+后台筛选+Skill 按需加载"抬上限"更灵活（`worldbook-search.js`、`worldbook-bm25.js`、`tavern-skills.js`） |
| 防 AI 腔/写作质量 | **B 优** | B 有 14 条具体中文反套路词库（"同义替换仍算违规、见即重写"）+情绪外化+报幕式收尾禁令（`src/agents/author.ts` Banned Patterns/Output Discipline）；A 侧写作 Skill 仅确认存在，细节未覆盖 |
| 上下文预算控制 | **A 优** | B 只有 128K 仪表估算且自声明"不含 system/技能/转录、无裁剪"（`src/runtime/prompt-budget.ts`）；A 有 token meter 与分页历史/压缩专项（`tavern-token-meter.js`、CONTEXT.md 分页存档；meter 代码未覆盖） |
| 防代打（puppeteering） | **B 优** | B 编号铁律显式契约化：禁代决玩家言行思、决策点留白、锚定玩家视角（`src/agents/author.ts` Iron Rules 1/3/6）；A 规则为文档级默认 |
| 卡片 preset 物化 | 平 | B"每卡一 preset"+卡技能目录+内容哈希清理（`src/host/preset.ts`、`src/host/preset-id.ts`）；A 共享编排+每卡快照带版本迁移（`play-card-snapshots.js`）——两种取舍各自自洽 |

## 二、状态结算系统

| 维度 | 判定 | 理由与证据 |
| --- | --- | --- |
| 状态模型表达力 | **B 优** | B 的对象/字段/关系/事件/目标/矛盾 + 可见性分层（`src/world-state*.ts`、`src/projection/world-state.ts`）；A 的 MVU 是扁平变量+规则（CONTEXT.md `Tavern MVU Core`）。RP 长局 B 的模型更贴剧情结构 |
| 结算可靠性 | **A 优** | A 的结算效果绑定 branch/revision，正文过期则拒绝提交；pendingSubmission/effect 保存点可恢复；迟到结果被拒（CONTEXT.md `MVU Delivery`/`MVU Settlement Effect`）。B 有并发标记+指纹去重+discard 重跑（`src/runtime/chronicler.ts` INFERENCE_IN_FLIGHT/DISCARD_RETRIES），但结算结果没有剧情版本绑定——B 的 `isCancelled()` 检查弱于 A 的"正文仍是当前版本"检查 |
| 正文与状态解耦 | **A 优** | A 有显式契约："Foreground Turn 成功后结算失败不撤销正文也不阻止下一轮"（CONTEXT.md `Foreground Turn`/`Background Cycle`）。B 实现上是异步的，但语义没有写成可测试的不变式 |
| 状态栏 UI 一致性 | 平 | A 状态栏由固定模板按变量渲染"绝对不掉格式"；B 世界状态页签同样从结构化投影渲染（`src/client/world-state-tab.tsx`）——双方都做到了，A 多了 MVU 生态兼容 |
| 玩家矫正 | **B 优** | B 无锁 Last-Write-Wins + 就地修改 + safe-write diff 预览 + actor provenance（`src/publish/correction.ts`、worklog 2026-09-24 Phase 5）；A 无直接对应物（改卡走调试 Agent，路径更长） |
| 状态变更可审计 | **B 优** | B 每次变更带 evidence 列表 + timeline actor（chronicler/player/copilot）+ 活动账本（`src/runtime/chronicler.ts` recordActivity、`src/publish/activity.ts`）；A 有 Settlement Receipt 但较薄 |
| 结算确定性兜底 | **A 优** | A 规则引擎结算 + 模板渲染，模型只在需要解释剧情时参与；B 纯模型推演（zod 校验+一次修复重试，`src/runtime/chronicler.ts` 327-359 行）——"保下限"A 更稳 |

## 三、记忆与长程连续性

| 维度 | 判定 | 理由与证据 |
| --- | --- | --- |
| 记忆架构 | **A 优** | A"完整保存正文 + `tavern_recall_history` 检索工具 + 渐进式披露"，显式不预测需求、不预灌摘要（`docs/design/agent-memory-retrieval.md`）；B 靠投影折叠重算 + 脉络罗盘，没有"按需找回原文"的能力——长线只能靠宿主压缩硬扛 |
| 上下文压缩 | **A 优** | A 前后台 Session 分别压缩、契约独立、权威状态不动（CONTEXT.md `Tavern Compaction`）；B 依赖宿主压缩，自己的 prompt-budget 仅是估算 |
| 分支回档 | 平 | A 的 Checkpoint/Game Fork 语义完整（绑 branch/revision + 待执行操作，CONTEXT.md `Checkpoint`）；B 的世界线树完全映射宿主 fork，"分支免费正确"靠日志重放（`src/worldline/worldline-tree.ts`，客户端零存储）——B 实现更省，A 产品语义更全 |
| 检索机制 | **A 优** | A Agent 自主检索（recall 模块，radius/limit 参数化）；B 无检索，纯 Push |
| 存档性能 | **A 优** | A 原生分页存档：头部读取 O(1)、普通结算不构造完整 Chat（`docs/design/current-state-and-paged-history.md`）；B 继承宿主日志与投影缓存，自身没有长档专项 |
| 防漂移 | 平 | B 的四维宏观罗盘（主线目标/核心矛盾/重大转折/伏笔危机，提示词与硬校验同源，`src/publish/macro-summary.ts` SUMMARY_LIMITS）紧凑实用；A 靠 Guide+剧本模式+检索——机制不同，B 的罗盘值得保持 |

## 四、工程与错误处理细节

| 维度 | 判定 | 理由与证据 |
| --- | --- | --- |
| 错误路径显式建模 | **A 优** | 每个并发结构都写明丢消息/迟到/重试语义（CONTEXT.md `Background Operation`/`Session Signal`/`Tavern Script Dispatch`）；B 修复 collectText 后大幅改善，但并发语义仍散落在代码注释 |
| 测试分层 | **A 优** | A 有 Playwright 真实玩局 E2E + 负向对照（`tests/e2e/README.md`）；B 484 单元测试全绿但无 E2E（E2E 已列入第一阶段计划） |
| 领域词汇表 | **A 优** | A 的 CONTEXT.md 是绑定契约（含 `_Avoid:` 禁用词），代码/测试/commit 共用一套语言；B 的 GLOSSARY+DECISIONS 更重（D25），维护成本偏高 |
| 流程重量 | **A 优** | A 的 AGENTS.md 一页纸纪律（提交粒度/推送/测试策略）；B 的双 Agent 门禁流程对单人玩具过重（worklog 2026-10-13 已记录瘦身意向） |

---

## B 值得移植清单（按优先级）

### P0 — 直接补 dsh-rrp 的短板
| # | 学什么 | A 的证据 | 落到 B | 收益 |
| --- | --- | --- | --- | --- |
| 1 | 历史检索工具（完整保存正文 + Agent 按需 recall + 渐进披露） | `docs/design/agent-memory-retrieval.md` | 新增 `src/runtime/recall.ts` + Author/Chronicler 提示词挂工具 | 长线不再靠压缩硬扛，几百轮仍记得开局细节 |
| 2 | 结算结果绑定剧情版本：提交前检查"正文仍是当前版本"，过期即拒绝/作废 | CONTEXT.md `MVU Settlement Effect` | `src/runtime/chronicler.ts` runInference 提交路径 | 杜绝迟到结算覆盖新剧情 |
| 3 | 把"正文提交与结算解耦"写成可测试的不变式（结算失败不回滚正文、不阻塞下轮） | CONTEXT.md `Foreground Turn` | `src/runtime/chronicler.ts` + 新增 invariant 测试 | 失败路径可回归，不再靠口头约定 |
| 4 | Playwright 真实玩局 E2E（开局→玩一轮→断言状态变化→刷新不丢） | `tests/e2e/README.md`、`gameplay.mjs` | 新增 `tests/e2e/` + 固定模型桩 | 替代人工"真机验收"，消除烂尾卡点 |

### P1 — 上下文与缓存
| # | 学什么 | A 的证据 | 落到 B | 收益 |
| --- | --- | --- | --- | --- |
| 5 | 开局稳定前缀快照 + 版本迁移 | `session-stable-prefix.js`、`play-card-snapshots.js` | `src/publish/state-publisher.ts` 或新增 snapshot 模块 | 跨轮前缀逐字稳定，缓存命中 |
| 6 | 卡系统提示变更检测：同值不追加、变化追加完整版 | `card-system-prompt.js` | B 的卡包注入层 | 杜绝陈旧指令幽灵生效 |
| 7 | 每轮注入"当轮生效"语义：旧轮快照不累积进后续请求 | CONTEXT.md `Per-Turn Injection` | `src/lore/lore-application.ts` | 上下文长度有界 |
| 8 | 种子对话轨迹：程序写入 user→assistant→user 示范 | `session-seed-trajectory.js` | `presets/rp/` 或 author 初始化路径 | 零模型调用建立互动方式预期 |

### P2 — 质量与流程
| # | 学什么 | A 的证据 | 落到 B | 收益 |
| --- | --- | --- | --- | --- |
| 9 | 词汇表瘦身：合并 GLOSSARY+DECISIONS 为单一 CONTEXT 式契约，只记"最终共识+禁用词" | CONTEXT.md | `docs/reference/` 重构 | 文档维护成本减半 |
| 10 | 流程门禁替换为一页纸纪律（提交粒度/测试子集/推送流程） | `AGENTS.md` | `AGENTS.md` + `docs/dev/workflow.md` | 单人项目流程不再反噬 |

## B 已经更优、保持不动

1. **反 AI 腔词库与输出纪律**（`src/agents/author.ts`）——比 A 的文档级约定更硬。
2. **防代打铁律**（同文件 Iron Rules）——A 无对应契约。
3. **玩家无锁矫正 + safe-write 预览**（`src/publish/correction.ts`）——A 无直接对应物。
4. **WorldState 对象模型 + 可见性分层 + actor 审计时间线**（`src/world-state*.ts`）——表达力高于 A 的扁平变量。
5. **四维宏观罗盘的"提示词与硬校验同源"**（`src/publish/macro-summary.ts` SUMMARY_LIMITS）——issue #32 对齐规则，值得保留。
6. **世界线完全映射宿主 fork、客户端零存储**（`src/worldline/worldline-tree.ts`）——比 A 自管存档分叉更省。
7. **`when:` 确定性条件注入**（`src/lore/lore-condition.ts`）——"保下限"比 A 的纯检索可靠。

## 未覆盖（证据不足，勿据此决策）

- A 的 `writing-style-skills.md`、`prompts/story.md` 正文、`tavern-token-meter.js` 实现细节。
- B 的 `lore-condition.ts`/`lore-application.ts` 内部实现（仅机制级判断）。
- A 的候选项生成/剧本模式/Guide 未做细节级对比（属功能面，非本轮四维度）。
