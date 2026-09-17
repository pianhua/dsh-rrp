# dsh-synapse 改造为 RP 剧情地图 — 可行性评估

> 评估依据：`/d/projects/dsh-synapse-new` 真实源码（v0.4.1）
> 测试回报：[实测结论](#)（fork 拓扑闭环 + 系统消息污染）

---

## 结论先行

**三项改造全部可行，且成本远低于预期。**

| 任务 | 可行性 | 改动量 | 关键依据 |
|:---|:---:|:---:|:---|
| 1. 节点降噪 | ✅ 极易 | ~10 行 | 单一过滤点 `projectableEvent` |
| 2. 卡片轻量化 | ✅ 可行 | ~50 行 | 模板函数独立，改 `threadMessage` / `cardHtml` |
| 3. 一键回溯 | ✅ **已存在** | ~0 行 | `open-dsh` 已带 `seq` 参数 |
| 3. 从此分叉 | ✅ **已存在** | ~0 行 | `open-branch` 已完整实现 |
| 3. 世界线命名 | ✅ 易 | ~20 行 | thread 已有 `title` 字段 |

---

## 任务 1：节点降噪（最高价值，成本最低）

### 现状代码

`index.js:645` 的 `projectableEvent`：

```javascript
function projectableEvent(event) {
  switch (event.type) {
    case 'user/message': {
      const text = contentText(event.data.content)
      return isRuntimeContextText(text) ? null : noteProjection('user', text)
    }
    // ...
  }
}
```

### 关键发现

**这里已经有过滤机制**，只是只过滤了 runtime context：

```javascript
function isRuntimeContextText(text) {
  return typeof text === 'string' && text.trimStart().startsWith(
    'Current runtime context. This snapshot supersedes earlier runtime-context snapshots.')
}
```

### 改造方案

**只需扩展这个判断**（约 10 行）：

```javascript
function projectableEvent(event) {
  if (event.type === 'user/message') {
    // 新增：过滤插件注入
    if (event.data?.source?.kind === 'plugin') return null
    const text = contentText(event.data.content)
    if (isRuntimeContextText(text)) return null
    // 新增：过滤 rrp 状态注入与技能目录
    if (text.includes('【世界状态 · 事实基准】')) return null
    if (text.trimStart().startsWith('<system-reminder>')) return null
    if (text.includes('<available_skills>')) return null
    return noteProjection('user', text)
  }
  // 其余不变
}
```

### 评估

- **风险**：极低（只加过滤条件，不改结构）
- **副作用**：无（这些消息本来就不该上画布）
- **验证**：开一局 RP，看画布是否只剩玩家输入 + 正文

---

## 任务 2：卡片轻量化

### 现状代码

卡片渲染在 `app.js`，关键函数：
- `threadMessage()`（行 1075-1086）：单条消息渲染
- 行 1153-1157：卡片详情（inspector）
- 行 1166：详情视图（detail-view）

### 关键发现

**卡片已经带有 `sourceSeq`**：

```javascript
const branch = message.kind === 'assistant' && Number.isInteger(message.sourceSeq)
  ? `<button data-action="open-branch" data-seq="${message.sourceSeq}">分支</button>`
  : ''
```

这意味着**每个节点都能精确定位到会话事件**，回溯和分叉的锚点已经存在。

### 改造方案

**A. 卡片摘要化**（改 `threadMessage` 或卡片模板）：
```javascript
// 玩家输入：原文展示（短）
// 正文：前 40-50 字 + "..."
function summarizeProse(text, limit = 50) {
  const flat = text.replaceAll(/\s+/g, ' ').trim()
  return flat.length > limit ? flat.slice(0, limit) + '…' : flat
}
```

**B. 世界状态高亮**（可选增强）：
我们的 `diffWorldState()` 已经产出人类可读的变更摘要：
```
"地点 平民公寓·门口 → 平民公寓·室内；角色「米娅」好感 6 → 7"
```
这个数据在 `activity` 账本里（`detail` 字段）。Synapse 可以直接读。

### 评估

- **风险**：低（模板改动，有测试覆盖）
- **工作量**：~50 行
- **注意**：需要保持 `data-seq` 属性不丢（回溯依赖它）

---

## 任务 3：回溯与分叉（基本已存在！）

### 3.1 一键回溯 — ✅ 已实现

**代码**（`app.js:1631`）：
```javascript
if (button.dataset.action === 'open-dsh' && thread?.dshSessionId !== null) {
  post('synapse:open-session', {
    sessionId: thread.dshSessionId,
    seq: Number(button.dataset.seq)   // ← 已经带 seq 锚点！
  })
}
```

**「在 DSH 中打开」按钮已经支持跳转到指定 seq。**

**需要做的**：把这个按钮的文案/位置调整得更像「回溯至此」，或在节点悬浮操作里暴露它。

### 3.2 从此分叉 — ✅ 已实现

**代码**（`app.js:1623`）：
```javascript
if (button.dataset.action === 'open-branch' && thread !== undefined) {
  // 创建草稿 → 调用 synapse:fork-session
}
```

**完整的 fork 链**（`app.js:372-374`）：
```javascript
const session = await dshRpc('synapse:fork-session', {
  sessionId: parent.dshSessionId,
  atSeq: draft.atSeq        // ← 切点
})
await api(`/synapse/api/threads/${parent.id}/branch`, { ... })
```

**已有入口**：
- 卡片右下角 `graph-branch-button`
- 卡片详情底部「创建分支」
- 单条消息头部「分支」按钮（`message-branch`）
- 详情视图头部「创建分支」

**需要做的**：文案改为「从此处开辟新世界线」，加世界线命名。

### 3.3 世界线命名 — 需要小改

**现状**：thread 有 `title` 字段（`titleFromText()` 从首条消息生成）。

**改造**：
- 分支创建时弹输入框让玩家命名（现在已有 `draft-branch-form`）
- 或创建后允许在卡片上重命名
- 存储：已有的 workspaces.json

**工作量**：~20 行。

---

## 血缘机制确认（关键）

测试 Agent 说"fork 完整继承"，代码验证如下：

**`app.js:746-752`**：
```javascript
// A fork inherits every parent event before DSH's durable seed boundary.
// The latest parent question below that boundary is the exact Turn where
// this child was born. Canvas coordinates never participate in lineage.
const inheritedTurn = Number.isSafeInteger(seedLength)
  ? parentCards?.filter(c => c.sourceSeq < seedLength).at(-1)
  : undefined
card.parentId = state.branchAnchors.get(card.dshThreadId) ?? inheritedTurn?.id ?? null
```

**确认**：血缘来自 `seedLength`（DSH 的 fork 切点），不是画布坐标。**健壮。**

---

## 三条路线对比

| 路线 | 说明 | 优点 | 缺点 |
|:---|:---|:---|:---|
| **A. Fork synapse 源码改造** | 改 3 处，本地维护 | 完全可控 | 上游更新难合并 |
| **B. 提 PR 给上游** | 改造后提交 PR | 社区受益 | 等待周期长 |
| **C. 装包 + 我们的补丁层** | 不改源码，用 profile patch 注入 | 干净 | synapse 未暴露扩展点 |

**我的建议：路线 A**，理由：
- 改动极小（~80 行）
- synapse 是 MIT 协议，允许 fork
- 上游面向通用场景，我们的 RP 定制未必适合合并
- 可以定期 rebase 上游

---

## 建议的执行顺序

**第一批（立刻可做，高价值低成本）**：
1. ✅ 任务 1：节点降噪（~10 行）
2. ✅ 任务 3 文案调整：把「在 DSH 中打开」改为「回溯至此」

**第二批（需要设计）**：
3. 任务 2：卡片轻量化 + 世界状态高亮
4. 任务 3.3：世界线命名

**第三批（可选）**：
5. 视觉：场景背景、分支颜色区分、关键抉择标记

---

## 与 dsh-rrp 的协同点

| 我们的能力 | Synapse 可以怎么用 |
|:---|:---|
| `diffWorldState()` | 节点上显示"本轮发生了什么变化" |
| activity 账本 | 归因：谁改的（纪事官/玩家）|
| WorldState 投影 | 节点间状态对比 |
| 卡包名称 | 地图分组维度（按卡分路线）|

---

**评估完成。三项改造全部可行，核心能力已存在，主要是"接线"和"改文案"。**
