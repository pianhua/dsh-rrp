# WORKFLOW.md — Vibe Coding 协作流程

> 面向本仓库的维护者与 AI 协作者。方法论来源：社区实践（Matt Skills / Superpowers）按本仓库
> 「个人玩具、拒绝过度工程」原则裁剪后的最小可用版。
> 本仓库没有 CONTEXT.md / ADR，其等价物：**共享语言 = `reference/GLOSSARY.md` + `DESIGN.md`**，
> **决策记录 = `reference/DECISIONS.md`**。

---

## 0. 档位选择（按改动规模，不要一刀切）

| 情形 | 流程 |
| :--- | :--- |
| 小改：文案、测试补漏、样式微调 | 直接做，但仍过第 3 节的冲突检查 |
| 修 Bug | 先定位根因（红→绿：先写复现/失败测试），再修；禁止边猜边改 |
| 新特性 / 复杂改动 | 完整流程：术语对齐 → 拷问(30+20) → 落盘 → 冲突检查 → 任务分解 → 实现 |

## 1. 术语先行

澄清需求之前，先把需求里的核心名词与 `reference/GLOSSARY.md` 逐一对表：定义、范围、易歧义处。
说法不一致但指同一事物的，先统一术语（必要时更新 GLOSSARY），再谈需求边界。
**拷问的前 10 个问题大概率都该花在术语上。**

## 2. 拷问节奏「30 + 20」

- 每累积 30 个问题就暂停自检三问：
  1. 是否还有**核心业务需求**未明确？
  2. 是否还有**关键边界或异常**未确认？
  3. 是否存在**相互矛盾**的描述？
- 三问皆无 → **停止提问**，输出需求确认文档（见下）。仍有 → 继续，每 +20 个问题再做一次同样的自检。
- 已被前置规则排除、不可能出现的边界，不换个问法重复拷问。
- 提问时给维护者**备选项**（选择题优于开放题），由其挑选或补充。

## 3. 确认即落盘（不信任上下文记忆）

每确认一项立即写入对应文件；上下文压缩后只认磁盘：

| 内容 | 去向 |
| :--- | :--- |
| 需求确认 / 实现计划 | `docs/plans/<特性>.md` |
| 工作区盘点、轮次结论、待决事项 | `docs/dev/worklog.md`（**追加**，带日期） |
| 术语 | `docs/reference/GLOSSARY.md` |
| 设计决策 | `docs/reference/DECISIONS.md`（编号 D\<n\>） |
| 真机缺陷 / 抽查结论 | `dsh-rrp-test-report/`（DEF 编号连续） |

## 4. 编码前冲突检查（强制门）

实现前，把需求确认文档与下列规则/约束/术语文档对照，**列出并解决冲突后才动手**：

- `AGENTS.md`（铁律与编码协议）
- `docs/DESIGN.md`（唯一产品目标规格）
- `docs/HOST_ALIGNMENT.md`（宿主映射与红线）
- `docs/reference/DECISIONS.md`、`GLOSSARY.md`、`HOST_SEAMS.md`、`HOST_BASELINE.md`
- `docs/dev/architecture.md`、`docs/dev/routes.md`

发现文档之间互相矛盾或已过期的内容：提出确认项清单请维护者拍板，不默默改写。
涉宿主能力的问题先查 `reference/HOST_SEAMS.md` 的证据链，再动手。

## 5. 文档养护

- 每个特性**收尾时**顺手刷新受影响的文档（含 AGENTS.md 目录树与本文引用）。
- 改动设计前必读 `reference/DECISIONS.md`（AGENTS.md 既有规定）。
- 定期（每轮抽查后）让 AI 检查 GLOSSARY / DECISIONS / HOST_ALIGNMENT 是否有过期或互相冲突的段落。

## 6. 完成定义（DoD）

- `pnpm run typecheck && pnpm run lint && pnpm test` 全绿；
- 受影响文档已跟随；
- 真机验证按 `dsh-rrp-test-report/` 最新 brief 轮次执行并归档报告；
- 工作区不遗留未落盘的「已确认内容」。
