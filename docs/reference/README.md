# 参考资料索引（reference/README.md）

> **这里的文档回答「为什么」，不是契约。**  
> 契约在上一层：[`DESIGN.md`](../DESIGN.md) · [`HOST_ALIGNMENT.md`](../HOST_ALIGNMENT.md) · [`ACTIVE_TASK.md`](../ACTIVE_TASK.md) · [`../../AGENTS.md`](../../AGENTS.md)。

---

## 为什么需要这一层

`dsh-rrp` 是**推翻重来**的项目。上一代实现从几百行膨胀到近 5 万行，核心原因是**多代实现者在没有对齐记录的情况下各自发挥**，设计意图逐代漂移。

这一层的作用：**把「我们当初为什么这么决定」固定下来**，让后续任何人（包括未来的 AI）在改动前能读到原始决策与理由，而不是重新发明或误改。

---

## 文档清单

| 文档 | 回答的问题 | 什么时候读 |
| :--- | :--- | :--- |
| [`DECISIONS.md`](DECISIONS.md) | 本项目做过哪些关键决策？为什么？ | **动任何设计前必读** |
| [`GLOSSARY.md`](GLOSSARY.md) | 标准术语是什么？哪些旧词禁用？ | 命名/写文档/写代码前 |
| [`HOST_ALIGNMENT`](../HOST_ALIGNMENT.md) | 宿主有什么？我们不许造什么？ | 实现前（契约层） |
| [`LESSONS.md`](LESSONS.md) | 旧项目为什么失败？哪些资产值得留？ | 想「参考旧实现」前 |
| [`COMMUNITY_PLUGINS.md`](COMMUNITY_PLUGINS.md) | 社区成熟插件长什么样？ | 建工程骨架前 |
| [`HOST_SEAMS.md`](HOST_SEAMS.md) | 宿主接缝实测细节（slot / preset / 事件词表 / 原子库） | 接宿主能力前 |
| [`SKILLS.md`](SKILLS.md) | Skills 是什么？如何替代 Lorebook？D8 沉淀怎么控？ | 做知识体系前 |
| [`CARDS.md`](CARDS.md) | 卡包格式、目录契约与开卡流 | 做卡包/开卡前 |
| [`WORLDLINES.md`](WORLDLINES.md) | 为什么 fork 后状态不穿帮？与 synapse 的边界 | 涉及分支/重放时 |
| [`SYNAPSE_RP_ADAPTATION.md`](SYNAPSE_RP_ADAPTATION.md) | dsh-synapse 改造成 RP 剧情地图是否可行？改哪里？ | 动剧情地图前 |
| [`SYNAPSE_RP_CHANGES.md`](SYNAPSE_RP_CHANGES.md) | 我们实际改造了什么？如何安装与验证？ | 维护/同步 fork 时 |
| [`SYNAPSE_RP_VERIFICATION.md`](SYNAPSE_RP_VERIFICATION.md) | 实机验证结果？还留了哪些隐患与建议？ | 接手剧情地图前 |
| [`MEMORY.md`](MEMORY.md) | 记忆放哪？外部记忆插件如何接入？我们绝不做什么 | 涉及记忆/检索时 |
| [`UI_CEILING.md`](UI_CEILING.md) | DSH 原始 UI 能改装到什么程度？ | 做界面改造前 |
| [`MANUAL_TEST.md`](MANUAL_TEST.md) | 实机验收清单与历史结果 | 每次涉及 UI/宿主行为后 |
| [`LONG_PLAY_TEST.md`](LONG_PLAY_TEST.md) | 长线（15 轮）测试清单与量化结论 | 做长线回归前 |
| [`CONTEXT_PUBLISHER_VERIFY.md`](CONTEXT_PUBLISHER_VERIFY.md) | 上下文发布与缓存命中的核验方法 | 动注入/发布时 |
| [`dsh-plugin-development-research.md`](dsh-plugin-development-research.md) | DSH 插件开发的完整技术机制 | 需要宿主细节时查阅 |

> 交接总入口在上一层：[`../HANDOFF.md`](../HANDOFF.md)。

---

## 阅读纪律

1. **契约层优先**：实现细节以 `DESIGN.md` / `HOST_ALIGNMENT.md` 为准；本层只解释理由。
2. **冲突时以契约层为准**，并回头修正本层，不要两份都留着互相矛盾。
3. **本层不追求完整**：只记录「会影响后续判断」的内容；流水账与逐次讨论过程不进这里。

---

## 外部资料

- [DeepSeek Harness 仓库](https://github.com/deepseek-ai/deepseek-harness) — 宿主源码与官方文档
- [Claude Code Skills 文档](https://code.claude.com/docs/zh-CN/skills) — Skills 机制的权威参考实现
- [Agent Skills 开放标准](https://agentskills.io) — Skills 的跨工具标准
