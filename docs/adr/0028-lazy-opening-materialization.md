# 懒开局：开局零日志写入，首回合物化（R1 / issue 06，2026-10-17 拍板）

> 状态：接受
> 原编号：新增
> 最后复审：2026-10-17 · 复审周期 180 天

**决策**：start 路由不再预写任何会话事件（受保护头回合、开场白回合全部退役）；
开局内容（卡事实 + 初始世界状态 + 时间线基线 + 开场白）存入宿主存储域 pending 记录，
首回合物化——**事实**经 `agent/pre-step` waterfall 改写 decision.messages 由 loop 自己
追加（受保护头之后、玩家消息之前）；**开场白**（必须保持 assistant 角色）在首个
system commit 后由微任务追加进仍开着的 step 1（玩家消息之后、正文之前）。
最终日志顺序：system 头 → 事实 → 玩家消息 → 开场白 → Author 正文，turn 1 严格连续。

**理由**（issue 06 根因，三层各自合法叠加）：

1. 宿主 loop 回合计数器在 preset 组合时快照 `turnBoundary`（画廊顺序里组合早于 start），
   首个玩家回合永远是 turn 1——**预写任何闭合回合都与之相撞**；
2. 宿主 v4 关系断言要求 `turn/start` 严格开启 nextTurn（`dsh-session-format-v3-to-v4`），
   碰撞日志冷读被拒（票据 04 实测）；0.2.0-rc.1 的部分冷读入口虽宽容，但严格断言栈
   被持久层/格式目录引用，宿主升级随时全面硬化；
3. 开局 surface 内容（事实发布是 surface user/message）必须先于 system commit 存在
   又会踩「受保护头必须为首面事件」——所以头之外，事实与开场白也必须等到头之后。

**接受的代价（语义变化）**：

- 开局后、首条玩家消息前，会话日志与投影为空；画廊不再有“预写开场白立即可见”。
  开场白在首回合内位于**玩家消息之后、Author 正文之前**（宿主两条硬约束的合力：
  事件监听内禁止追加——「session append cannot reenter」；decision 只收用户消息，
  assistant 角色进不去——角色错会污染转录/小说导出）。模型在生成正文前已看到全部
  开局内容，叙事完整性不受影响。
- `StartResponse.openingWritten` 新增 `'deferred'`，`cardWritten/stateWritten` 在 deferred
  路径为 `false`（响应仅测试与契约消费，客户端不读）。
- HEAD_TEXT 占位头退休：受保护头由 loop 的 system prompt 机制供给（实测其落在
  surface node 0，机制原生活，占位纯属补丁）。

**含义**：

- pending 记录按 sessionId 存宿主存储域（重启可续），session/disposed 清除；
  不发明会话事件类型、不写 surface、不进转录投影。fork 子线不继承（同月停历史语义）。
- pending 记 `factsInjected`：事实经 pre-step 注入后标记，宿主重启不再重复注入；
  开场白重新 arm（OPENING_DUE 每步重 arm 直至落盘）。无玩家输入的 step 不物化。
- 验收门 = `assertReleasedV4Relationships` 直接断言最终日志（不依赖任何冷读入口的宽容），
  外加 readSession 200、重启数据面一致、负向对照。

## 被否决方案

- **B 回合号让位**：开局回合编号从 loop 冻结计数器推导——宿主计数器不可控，此路不通。
- **C 修宿主 loop**：vendor 代码，越界；若宿主某版本改为现读投影（reopen 条件），本 ADR 重估。
- **开局只写头回合**：预写闭合 turn 1 → 冷读 nextTurn=2 与 loop 的 turn 1 相撞，同因否决。
- **事实非 surface 化**：投影虽可折，但模型历史可见性依赖 surface（runtime-context
  投影以 surface 成员判定可见快照），风险大于收益。
