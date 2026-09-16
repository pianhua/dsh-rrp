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
| [`SKILLS.md`](SKILLS.md) | Skills 是什么？我们如何用它替代 Lorebook？ | 做知识体系前 |
| [`dsh-plugin-development-research.md`](dsh-plugin-development-research.md) | DSH 插件开发的完整技术机制 | 需要宿主细节时查阅 |

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
