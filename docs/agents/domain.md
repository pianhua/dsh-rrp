# Domain docs

本项目已经有一套稳定的领域文档，不采用 Matt Skills 默认的第二套 `CONTEXT.md` / `docs/adr/` 目录。Agent 必须把下面的文件当作同一套领域模型来消费：

| 目的 | 本项目唯一来源 |
| :--- | :--- |
| 共享术语、定义、禁用词 | `docs/reference/GLOSSARY.md` |
| 产品目标与交互基线 | `docs/DESIGN.md` |
| 宿主能力、接入方式与红线 | `docs/HOST_ALIGNMENT.md`、`docs/dev/host-seams.md` |
| 为什么这样设计、已拍板取舍 | `docs/reference/DECISIONS.md` |
| 模块关系与实现地图 | `docs/dev/architecture.md`、`docs/dev/routes.md` |
| 当前工作区、待决事项、历史结论 | `docs/dev/worklog.md` |

## Read order

1. 先读 `AGENTS.md` 和 `docs/dev/workflow.md`，确定本轮工作档位与开工门。
2. 再读 `docs/reference/GLOSSARY.md`，把用户说法映射到标准术语；发现同词异义时先停在术语层。
3. 涉及设计取舍、状态语义、宿主能力或命名时，分别读取 `DESIGN.md`、`HOST_ALIGNMENT.md`、`DECISIONS.md` 和对应的开发文档。
4. 最后读目标模块与相邻测试；代码里的新命名必须回到术语表。

## Writing rules

- 新概念先进入 `GLOSSARY.md`，再进入需求、票据或代码。
- 难以逆转且有真实取舍的决定进入 `DECISIONS.md`；普通实现选择留在规格或票据中。
- 术语、产品目标、宿主红线和实现细节各有唯一来源，不复制成平行文档。
- Matt Skills 提到 `CONTEXT.md` 或 ADR 时，按本映射读取对应文件；只有先记录迁移决策，才创建新的目录体系。
