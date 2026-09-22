# 参考资料索引（reference/README.md）

> 本目录只放**活着的文档**：会被日常开发与决策实际引用的。一次性测试报告、调研快照、
> 历史方案全部归档在 [`_archive/`](./_archive/)（保留备查，不再维护）。
> 权威测试档案在仓库根的 `dsh-rrp-test-report/`。

## 什么时候读什么

| 场景 | 读这里 |
| :--- | :--- |
| **改动任何设计之前** | [`DECISIONS.md`](./DECISIONS.md) — 每条决策都有拍板依据，AI 不得自行推翻 |
| **命名 / 用词拿不准** | [`GLOSSARY.md`](./GLOSSARY.md) — 唯一标准术语表，新增概念先登记再实现 |
| **升级 DSH 宿主之前** | [`HOST_BASELINE.md`](./HOST_BASELINE.md) — 版本基线、seam 清单与升级流程 |
| **排查宿主行为 / 验证红线** | [`HOST_SEAMS.md`](./HOST_SEAMS.md) — 宿主能力勘察与会话事件词表等硬约束 |
| **制作 / 修改卡包** | [`CARDS.md`](./CARDS.md) — 卡包目录格式规范 |
| **动 Skills / 设定集机制** | [`SKILLS.md`](./SKILLS.md) — 技能注册、渐进披露、provider 分层 |
| **想知道以前踩过什么坑** | [`LESSONS.md`](./LESSONS.md) — 旧项目复盘 |
| **参考 tavern-v2 的可用资产** | [`TAVERN_V2_COMPARISON.md`](./TAVERN_V2_COMPARISON.md) — 对标分析（B 系列 backlog 的出处） |

## 其他入口

- 产品目标规格：[`../DESIGN.md`](../DESIGN.md)（git 跟踪）
- 宿主能力映射与红线：[`../HOST_ALIGNMENT.md`](../HOST_ALIGNMENT.md)（git 跟踪）
- 开发环境与日常循环：[`../DEVELOPMENT.md`](../DEVELOPMENT.md)
- 真机测试档案：`../../dsh-rrp-test-report/`
- 外部参考项目（只读克隆）：`D:\projects\deepseek-harness`（宿主源码 @ dsh-v0.1.6-alpha.2）、
  `D:\projects\dsh-tavern-v2`、`D:\projects\DSH-better-sidebar`

## 归档说明

`_archive/` 内的 31 份文档（验收清单、测试计划/报告、synapse 调研、酒馆预设分析等）
是 2026-09-16 ~ 09-19 各波工作的历史快照，内容已被实现代码、DECISIONS 或
dsh-rrp-test-report 吸收。**不要往 _archive 里放新东西，也不要从中恢复设计**；
确需翻旧账时按文件名检索即可。
