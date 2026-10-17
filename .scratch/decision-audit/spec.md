# 决策审计与文档清理（decision-audit）

## Goal

所有者委托：对 27 篇 ADR、worklog 悬挂待决、docs/ 全文档做一次彻底审计，清除无关无用内容。
裁决规则沿用仓库复审机制（README §复审机制）：复审只回答「这条决策的前提今天还成立吗」；
退役决策必须新增 ADR 标注（本次结论：无退役项）。所有者在 auto 模式下把裁决笔委托给本次会话，
每条裁决附证据，本 spec 即裁决记录。

## ADR 裁决（27/27 接受面成立，0 退役）

| 组 | 裁决 | 证据 |
| :--- | :--- | :--- |
| 0001/0003/0004/0006/0009/0011/0015/0017/0021/0022（架构基座） | reaffirm | 生产代码与 548 用例仍按这些决策形状运转；e2e 玩局链就是 0003/0004 的活证据 |
| 0005（动态结构） | reaffirm + 正文同步注 | 文中「WorldState v2 待实现」已被 0023 Phase 1–9 交付接管，补一行同步注（该文本自身就有「实现状态同步」惯例，非改写决策） |
| 0007/0008（Skills/沉淀） | reaffirm | lore-runtime/sediment 投影与 D8 确认环在跑 |
| 0010（部分取代） | reaffirm 现状 | 0024 已接管地图职责，状态栏已正确标注；无新动作 |
| 0012（记忆外置，未实施） | reaffirm | `runtime/recall.ts` 是会内历史召回（issue #38），与 D12 的长期记忆外置是两层；EverOS 方向未动也不冲突 |
| 0013/0014/0026（卡包格式三步） | reaffirm | card-import 存在、CARDS.md 为规范、DEF-02 验收过 |
| 0016/0018/0020（文风与契约） | reaffirm | agents-contract.spec 守护；B2（R4）是「生产消费五对象」，不推翻 0018 的工程结构决策 |
| 0019（月停） | reaffirm | copilot 运行时与 steward-proposals 在跑 |
| 0023/0024/0025/0026（v2 三件套） | reaffirm + 0025/0026 正文「实现状态」同步 | 状态栏已标已实现，但两篇正文末尾仍写「待实现」——内部不一致，同步正文状态行（不改决策内容） |
| 0027（文档真源） | reaffirm | 本次审计就是按它的机制跑的 |

结论：**没有需要推翻的决策**。所有者的不放心没有在职 ADR 层面得到证实——这本身就是审计的最大产出。

## 悬挂待决裁决（worklog 2026-10-16/17 的 5 条）

1. **易变内容放哪**（追加+买断 vs systemPrompt.section）：维持现状，section 路线降级为「真机测量后再评估」，登记进 roadmap R3 #5 注记。理由：无测量数据，不改生产。
2. **P1 #6 卡提示变更检测**：**关闭**。指纹去重 + 状态侧已覆盖生产路径（worklog 2026-10-16 待决 2 自述），无剩余工作面。
3. **P1 #8 种子对话轨迹**：**裁决不做**。与 D21 正面冲突（伪造宿主呈现面），重开须先改 D21。roadmap R3 #8 标注。
4. **术语登记**（稳定前缀快照/当轮生效注入/种子对话轨迹）：按 GLOSSARY 规则「先登记再实现」——#8 已死，#5/#7 转正时随实现登记，本次不预支。
5. **前缀缓存双重语义**：写进 CONTEXT.md Stable Prefix 词条——「转录前缀字节稳定（我们强）」与「上下文长度有界（我们弱，归 P1 #7）」是两个维度，不矛盾。

## 文档清除裁决

| 文档 | 裁决 | 理由 |
| :--- | :--- | :--- |
| `docs/plans/conditional-injection-v1.md` | **删除** |  shipped 特性的一次性计划（P0 纪律：过程产物退出主线）；决策归 0017，机制归 CONTEXT+测试。git 历史可检索 |
| `docs/reference/TAVERN_V2_COMPARISON.md` | **删除** | reference/README 自己的规则：「过期项目调研不进主线」。其 P0/P1 建议已全部落地或折进 R2–R5；「不采纳清单」由 HOST_ALIGNMENT + ADR 0015 承接 |
| `docs/reference/TAVERN_SANITIZATION.md` | **删除** | authoring/tavern-migration.md 已覆盖同一份清洗清单（含类 A 宏与语义陷阱），且更完整；0 引用 |
| `docs/reference/examples/return-inn.SKILL.md` | **删除** | 自声明「格式示例」、0 引用、无人可达；SKILLS.md 与 authoring 两文已 carrying 格式规范 |
| `docs/reference/TAVERN_DETAIL_COMPARISON.md` | **保留**（附清理条件） | R2/R3 的未结证据基；roadmap 注明「R2/R3 收口后按死研规则移除」 |
| `docs/agents/issue-tracker.md` / `triage-labels.md` | **保留 + 接链** | 它们是 `.scratch` 票据 Status 词汇的规范定义（workflow §4 的实际依据），0 引用是断裂不是无用——从 workflow.md §4 补一行链接 |
| `docs/dev/routes.md` / `CONTRIBUTING.md` / `LESSONS.md` / `HOST_*` | 保留 | 活着的导航/契约/证据文档 |

## Acceptance

- 27 篇 ADR 最后复审日期更新为 2026-10-17；0005/0025/0026 内部状态同步；README 索引与到期日同步。
- 4 个文档删除、无死链（hygiene 链接检查绿）；workflow.md 补票据词汇链接；CONTEXT.md 补前缀语义区分。
- roadmap R3 表 #6/#8 裁决落盘 + 死研清理条件；worklog 记录本次审计结论。
- 质量门全绿（548 用例不变，纯文档改动）。
