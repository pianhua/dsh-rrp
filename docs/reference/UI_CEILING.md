# UI_CEILING.md — DSH 原 UI 的改装上限（RP 视角）

> 问题：`dsh-rrp` 到底能把 DSH 原生 UI 改装到什么程度？现有 UI 偏「编码助手」，不适配 RP。
> 结论先行：**上限很高**——颜色/排版、会话视图、正文节点、输入区、主区面板、全屏浮层
> 都有**官方、可逆**的接缝；真正做不到的只有「换掉三栏骨架」和「任意注入全局 CSS」。
> 证据以已装宿主 0.1.5-rc.2 为准，细节见 [HOST_SEAMS.md](HOST_SEAMS.md)。

---

## 1. 分三档看「能插到什么程度」

### A 档：官方支持、可逆、推荐用

| 能力 | 宿主接缝 | 能做到什么 |
| :--- | :--- | :--- |
| **全局主题** | `ctx.theme`（`@deepseek-ai/dsh-client-ui-theme`）· `register(ThemeDefinition)` / `overrideTokens(source,tokens)` / `setTheme(id)` | 覆盖 `--dsw-alias-*` token（明/暗两套）。改配色、衬线字体、行距、圆角、背景——**整站观感 RP 化** |
| **自定义会话视图** | `conversation.view`（list）+ `ctx.uiConversation.views.register({target,create})` | 新增一个视图 Tab（和 Chat / Trajectory 并列），用**自己的渲染目标**把整段会话按小说排版呈现 |
| **替换正文节点** | `conversation.chat.node`（keyed，按 kind 注册，`priority` 是 shadowing rank） | 以更高 priority 注册同 key（如 `assistant-step`）**阴影掉宿主渲染**，不动宿主代码就换正文气泡/排版 |
| **接管输入区** | `conversation.composer`（chain） | 把输入框换成 RP 输入（说话/行动/继续/导演指令等） |
| **主区面板 + 左栏导航** | `main`（keyed）+ `sidebar.panellist`（list，id=main key）+ `ctx.layout.selectPanel(id)` | 卡片展厅 / 编年史 / 全屏场景页 |
| **全屏浮层** | `shell.overlay`（list，root） | 沉浸模式、场景大图、选项浮窗（需自开 `pointer-events`） |
| **右栏 Tab** | `sidebarRightTabs.register` + `sidebar.right.pane.tab`（keyed）+ `ctx.sidebarRight.openTab/focus` | 世界状态 / 人物卡 / 大纲（**已在用**） |
| **会话头部** | `conversation.session.header.*`（single/list/chain） | 标题、动作按钮、工具入口 |

### B 档：有，但要绕路或有限制

| 限制 | 变通 |
| :--- | :--- |
| **没有全局顶栏 slot**（帧只有 sidebar/main/rightbar/shell.overlay） | 用会话头部 `conversation.session.header.*`，或用主区面板充当「编年史」 |
| **改不了三栏骨架** | `ctx.layout` 只有 `selectPanel` / `toggleSidebar` / `openRightbar` / `closeRightbar`；不能增删列、不能换布局 |
| **主题只能覆盖 `--dsw-alias-*`**，不能任意全局 CSS | 主题 token 覆盖是官方路径；想更细就走「自定义视图 Tab」而非改宿主 |
| **非 surface 自定义事件默认不可见** | 要进正文必须 `ctx.uiConversation.events.register(...)` + 在 `conversation.chat.node` 注册组件 |
| **槽位冲突** | 同一 cell 同 priority 二次注册会 throw；阴影必须**更高 priority**。`single`/`keyed`/`list` 是 shadowing，`chain` 由 `select` 路由 |

### C 档：技术上能做，但属于红线/不建议

| 做法 | 为什么不做 |
| :--- | :--- |
| 直接操作 DOM / 注入全局 `<style>` | 违反 HOST_ALIGNMENT「自制整站前端/样式栈」红线；宿主升级即碎 |
| 用 `root` 槽覆盖整个 AppFrame | 单例，二次注册会**阴影掉侧栏+会话+右栏**，整站变白 |
| 大面积 shadow 宿主关键组件 | 与宿主版本强耦合；应逐点、可降级地想清楚再 shadow |

> **共同纪律**：一切注册都必须返回 disposer、随插件 fiber 释放（HMR 干净）；只对带某卡/某模式的会话生效，
> 不污染宿主其他模式；个人玩具定位，按需而做，不因「能做」就全做。

---

## 2. 给 RP 的改装路线（从轻到重）

| 优先级 | 动作 | 用到的接缝 | 效果 |
| :---: | :--- | :--- | :--- |
| **P0** | 注册 `rrp` 主题（暖色/衬线/大行距/低对比边框） | `ctx.theme.register` + `overrideTokens` | 全局观感立刻从「编码工具」变「阅读器」 |
| **P1** | 正文节点 shadow：`conversation.chat.node` 的 `assistant-step` | keyed + 高 priority | ⏸️ **评估后不做**：等于重新实现宿主的 Assistant 渲染器，做错会让聊天直接不显示；主题已覆盖字体/行高/配色，收益低风险高。改走 P3 增量视图 |
| **P2** | 卡片展厅 + 开卡新会话 | `main` + `sidebar.panellist` + `ctx.sessions`/`ctx.remote` | 从卡包开局（当前正在做） |
| **P3** | 「沉浸」视图 Tab（全屏、无干扰、正文+右栏状态） | `conversation.view` + 订阅 `chat` 目标快照 | ✅ **已实现** `src/client/story-view.tsx`（纯增量，不替换宿主渲染） |
| **P4** | 输入区接管（说话/行动/继续/OOC/导演） | `conversation.composer`（chain） | 不再是「给 coding agent 派活」的输入框 |

> 建议按 P0 → P2 → P1/P3 推进：P0 改动最小、收益最直观；P2 是功能闭环；P1/P3 是观感深化。

---

## 3. 一句话结论

- **能做到**：换主题配色与排版、加自定义视图 Tab、替换正文渲染、接管输入区、加主区面板与全屏浮层、加右栏 Tab。
- **做不到/受限**：换掉三栏骨架、加全局顶栏、任意注入全局 CSS。
- **因此**：现有 UI 不适配 RP **不是插件能力不够**，而是我们还没用这些接缝去改；从「注册一个 RP 主题」开始，就能立刻见效。
