# 参考资料索引（reference/README.md）

> 本目录只放**活着的文档**：会被日常开发与决策实际引用的。设计决策、标准术语、宿主接缝
> 与**已完成的真机验收档案**都在这里。被取代的中间轮次、过期项目调研、一次性计划快照
> 一律不进主线——原因与取回方式见文末[「历史内容怎么找」](#历史内容怎么找)。

## 什么时候读什么

| 场景 | 读这里 |
| :--- | :--- |
| **改动任何设计之前** | [`../adr/`](../adr/) — 一条决策一篇 ADR，带状态栏，AI 不得自行推翻 |
| **命名 / 用词拿不准** | [`GLOSSARY.md`](./GLOSSARY.md) — 唯一标准术语表，新增概念先登记再实现 |
| **升级 DSH 宿主之前** | [`HOST_BASELINE.md`](./HOST_BASELINE.md) — 版本基线、seam 清单与升级流程 |
| **排查宿主行为 / 验证红线** | [`HOST_SEAMS.md`](./HOST_SEAMS.md) — 宿主能力勘察与会话事件词表等硬约束 |
| **制作 / 修改卡包** | [`CARDS.md`](./CARDS.md) — 卡包目录格式规范 |
| **动 Skills / 设定集机制** | [`SKILLS.md`](./SKILLS.md) — 技能注册、渐进披露、provider 分层 |
| **想知道以前踩过什么坑** | [`LESSONS.md`](./LESSONS.md) — 旧项目复盘 |
| **查某功能真机验收结论** | [`acceptance/`](./acceptance/) — 已完成的真机验收报告与证据截图 |

## 其他入口

- 产品目标规格：[`../DESIGN.md`](../DESIGN.md)（git 跟踪）
- 宿主能力映射与红线：[`../HOST_ALIGNMENT.md`](../HOST_ALIGNMENT.md)（git 跟踪）
- 开发环境与日常循环：[`../DEVELOPMENT.md`](../DEVELOPMENT.md)
- 真机验收档案：[`./acceptance/`](./acceptance/)（展厅 v2 DEF-02 + 7 张证据截图）
- 外部参考项目（只读克隆）：各机器本地的 `deepseek-harness`（宿主源码 @ dsh-v0.1.6-alpha.2）、
  `dsh-tavern-v2`、`DSH-better-sidebar`；本机绝对路径不写入共享文档

## 历史内容怎么找

仓库**不保留**过程产物。以下三类内容一律不进主线：

- **被取代的测试轮次** —— 曾有六轮 `TEST_REPORT_R2`→`R7` 与 `E2E_BRIEF_ROUND-N` 并存，
  后来者无法判断哪份有效；现在同一功能的复验一律覆盖更新同一份报告。
- **过期项目调研** —— dsh-synapse 已于 2026-09-20 撤装，其 5 份适配/验证记录不再有参考价值。
- **一次性计划快照** —— 完成的票据与规格留在 git 历史，不占用主线目录。

删掉一个目录只是让它离开主线，不是销毁证据——全部内容仍在 git 历史里：

```sh
# 找出这些目录里被删除过什么
git log --diff-filter=D --name-only -- docs/reference/_archive dsh-rrp-test-report
# 取回其中某一份
git show <commit>^:<path>
```

**不要往本目录放新东西，除非它还会被日常开发引用。** 计划、票据走 `.scratch/` 或
[`docs/plans/`](../plans/)，过程结论走 [`docs/dev/worklog.md`](../dev/worklog.md)。
