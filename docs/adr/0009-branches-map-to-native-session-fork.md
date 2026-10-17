# 分支映射原生 Session.fork

> 状态：接受
> 原编号：D9 · 索引见 [README.md](./README.md)
> 最后复审：2026-10-17 · 复审周期 180 天


**决策**：重新生成 / 分支一律使用 DSH 原生会话 fork（做法 A）。

**理由**：
- 旧项目的自定义分支结构是复杂度与幽灵状态的来源
- 原生 fork 天然保证历史不丢
- 状态由会话投影纯数学折叠，切分支自动得到正确切面

**实现范围（2026-09-17）**：上述保证覆盖 Card、WorldState、Summary、Settings 与 Sediment。前四者采用整值事件；Sediment 采用有界、可校验的 `snapshot/add/remove` 操作，但同样只依赖继承事件前缀做确定性重放。
