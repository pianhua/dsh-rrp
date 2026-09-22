# WORKFLOW.md — Vibe Coding 协作流程

> 面向本仓库的维护者与 AI 协作者。本文是日常执行契约：它把 Matt Skills 的灵活主流程与 Superpowers 的质量闸门按本项目“个人玩具、Host-First、拒绝过度工程”原则组合起来。
> 领域来源不是另起一套 `CONTEXT.md` / ADR，而是 [`docs/agents/domain.md`](../agents/domain.md) 列出的现有文档。

## 0. 接手与分工

人和 Agent 的权限、提问、控制词、进度汇报与交接细则见 [`docs/agents/human-agent-contract.md`](../agents/human-agent-contract.md)；本节只规定每项工作的最小接手动作。

每个新任务先完成以下动作，完成后才进入任务档位判断：

1. 查看 `git status --short --branch`、近期提交和当前工作日志。
2. 读取 `AGENTS.md`、本文件、`docs/reference/GLOSSARY.md`、`docs/reference/DECISIONS.md`；涉及宿主时再读 `docs/HOST_ALIGNMENT.md` 与 `docs/dev/host-seams.md`。
3. 把当前目标写成一句用户可验证的结果，并列出未知事实、待决选择和不能触碰的范围。
4. 已确认的术语、决策、规格和待决事项立即写入对应文件；不把上下文记忆当作持久记录。

**人负责**产品目标、取舍、不可逆决策和最终集成。**Agent 负责**事实查找、冲突列举、选项草案、实现和验证；Agent 可以自行解决常规实现选择，但不能把推测伪装成已确认需求。

## 1. 档位选择

| 情形 | 主流程 | 质量闸门 |
| :--- | :--- | :--- |
| 文案、测试补漏、局部样式或一处机械改动 | 直接处理 | 冲突检查 + 相关验证 |
| 已知范围的普通 Bug | `tdd` 或 `grilling` → `implement` | 失败测试先行；完成前验证 |
| 根因不明、间歇性或跨层 Bug | `diagnosing-bugs` | 先建立能稳定失败的 tight loop，再修复 |
| 新特性或跨多个模块的改动 | `grill-with-docs` → `to-spec` → `to-tickets` → `implement` | 术语、30+20、自检、冲突门、TDD、双轴 review |
| 一次会话容纳不下的模糊工程 | `wayfinder` → `to-spec` → `to-tickets` → `implement` | 每次只解决一个决策票据 |
| 架构维护与可导航性调查 | `improve-codebase-architecture` | 先产出候选，不把调查变成无边界重构 |

Matt Skills 是日常主流程。Superpowers 只在新子系统启动、隔离工作区、系统性调试、TDD、完成验证和分支收尾等明确场景介入。每项工作选择一条主流程；`implement` 已包含 TDD 约束和收尾 code review，不再叠加完整的 Superpowers 计划链。

## 2. 术语先行

需求澄清前，把核心名词逐一对照 `docs/reference/GLOSSARY.md`：确认定义、范围、拥有者、生命周期和容易误解的相邻概念。前十个问题优先用于术语统一；同一概念的不同说法先归并，真正不同的概念才分别命名。

如果新概念确实缺失：先提出标准名和至少一个反例，得到确认后写入术语表，再继续需求边界。涉及硬取舍时同时检查 `DECISIONS.md`，不要在规格里悄悄推翻已有决策。

## 3. 拷问节奏「30 + 20」

- 一轮只问当前 frontier 上的问题；事实由 Agent 查找，选择由人回答。
- 问题优先给出推荐选项，允许人改写；已被前置规则排除的边界不换说法重复询问。
- 累积 30 个问题后暂停，检查：核心业务是否仍有未明确项、关键边界或异常是否仍未确认、描述是否互相矛盾。
- 三项都清楚就停止并输出需求确认文档；仍有缺口时每增加 20 个问题重复检查。
- 如果 frontier 在检查点前已经为空，直接停止，不为了凑数量制造问题。

## 4. 确认即落盘

| 内容 | 唯一去向 |
| :--- | :--- |
| Matt 规格 | `.scratch/<feature-slug>/spec.md` |
| Matt 实现票据 | `.scratch/<feature-slug>/issues/<NN>-<slug>.md` |
| 既有设计计划与历史方案 | `docs/plans/`（不与新票据重复维护） |
| 术语 | `docs/reference/GLOSSARY.md` |
| 产品或架构决策 | `docs/reference/DECISIONS.md` |
| 工作区盘点、轮次结论、待决事项 | `docs/dev/worklog.md`，追加且带日期 |
| 真机缺陷与抽查结论 | `dsh-rrp-test-report/`，DEF 编号连续 |

规格和票据先写用户可验证的行为、阻塞关系、范围与验收条件，再写实现提示。不要在多个文件复制同一条规则；需要共享时使用指针。

## 5. 编码前冲突检查（强制门）

实现前逐项对照规格与：

- `AGENTS.md`
- `docs/DESIGN.md`
- `docs/HOST_ALIGNMENT.md`
- `docs/reference/DECISIONS.md`、`GLOSSARY.md`、`HOST_SEAMS.md`、`HOST_BASELINE.md`
- `docs/dev/architecture.md`、`docs/dev/routes.md`

把冲突写成清单，说明冲突双方、影响和需要谁决定；先解决清单，再动 `src/`、`tests/` 或构建配置。宿主能力问题先查证据链，优先接入宿主已有 seam。

## 6. Ready-to-code gate

只有下面各项都能指向磁盘上的证据，才允许开始实现：

- 用户目标和成功行为已经用标准术语写清楚；
- 规格或票据已落盘，包含范围、验收条件和 out-of-scope；
- 关键异常、边界和矛盾已经确认或明确记录为阻塞；
- 规格与项目规则、术语、决策和宿主约束没有未解决冲突；
- 测试 seam 已选定，优先使用现有最高 seam；
- 任务能在一个新鲜上下文中完成，或已经拆成带 `Blocked by` 的垂直切片；
- 工作区基线和分支策略已记录。

门的完成标准是：任意新 Agent 只读 `AGENTS.md`、相关领域文档、规格和票据，就能说出要交付什么、不能做什么、如何验证，以及哪些选择仍需人决定。

## 7. 实现与验证

实现从最高可用 seam 的失败测试开始，按红→绿→重构推进；每个垂直切片都要有独立的用户可验证结果。遇到异常先回到 `diagnosing-bugs` 的复现、最小化、假设和证据循环，不叠加猜测式修复。

完成前必须运行与改动匹配的验证：至少包含相关测试、`pnpm run typecheck`、`pnpm run lint`；进入发布或集成前再跑 `pnpm test` 与 `pnpm run build`，真机改动按最新 brief 抽查。没有本轮命令输出，不声称“完成”“修复”或“全绿”。

## 8. 收尾与文档养护

- 把实际结果、未完成项、发现的冲突和下一步追加到 `docs/dev/worklog.md`。
- 受影响的术语、决策、架构图和路由说明跟随更新；不保留已经失效的临时解释。
- 新特性收尾后检查 `GLOSSARY`、`DECISIONS`、`HOST_ALIGNMENT` 是否互相一致。
- 当前项目的完成定义是：代码验证通过、文档跟随、真机结论归档、确认内容全部落盘、工作区状态可解释。
