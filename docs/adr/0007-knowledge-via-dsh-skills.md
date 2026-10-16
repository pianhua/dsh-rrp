# 知识体系全面 Skills 化

> 状态：接受
> 原编号：D7 · 索引见 [README.md](./README.md)


**决策**：世界典籍 / 酒馆世界书（Lorebook）这一层，**改用 Skills 概念实现**。

**理由**：
1. 最新一代模型在训练阶段就认识 Skills 这种形态；
2. Skills 天然契合「按需索引、渐进披露」，正好治酒馆「上下文硬塞」的病。

**权威参考**：[Claude Code Skills 文档](https://code.claude.com/docs/zh-CN/skills) · [Agent Skills 开放标准](https://agentskills.io)  
**DSH 实现**：`ctx.skills` 注册表 + `@deepseek-ai/dsh-skill-filesystem` 提供方。详见 [`SKILLS.md`](../reference/SKILLS.md)。
