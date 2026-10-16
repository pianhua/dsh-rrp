# 票据 02：舞台客户端重写（布局 / 桥 v2 接线 / 写面 / 质量债）

> Status: ready-for-agent · 依赖：票据 01（契约已落盘） · 分支：`feat/stage-v2`
> 规格真源：[`spec.md`](../spec.md) · 决策：D25（1/2/4/5/7/8 条）

## 目标

重写 `stage-tab.tsx` / `stage-frame.tsx`：app 全幅优先布局、官方三态、桥 v2 握手、代拟发言与 RiskConfirmation 接线、P0–P2 质量债清零、开发模式热重载。

## 范围

### 1. 宿主接缝声明（P0）

- `src/client/context-types.ts` + `src/client/index.ts`：把舞台用到的宿主服务全部显式声明（`sidebarRight` 当前裸取——按其真实形态补类型与 inject；`useProjection`/`inputActions` 属会话标准 props 的，走组件 props 类型显式化，不做 ctx 级假设）。开工第一步先在宿主源码核实 `conversation.view` slot 组件实际收到的 props 面（`SessionStandardProps`，`ui-conversation/contract/slots.ts:241`），用 spike 测试钉住。

### 2. stage-frame.tsx v2

- iframe 由 srcdoc 改 **src**（`RRP_ROUTES.cardUi + '?card=…&file=…'`，票据 01 已伺服多文件）；CSP 经路由/meta 注入形态与票据 01 对齐（保持 `assembleSandboxDoc` 仅用于 legacy 回退或直接退役，代码里选干净的一刀）。
- 桥 v2：监听 `rrp:hello` → 回 `rrp:ready`（协议号+动词表）→ 推全量；v1 子侧兼容（hello 无版本号直接推全量）。
- 状态推送节流 100ms（requestAnimationFrame/microtask 级实现即可）；`event.source === contentWindow` 校验维持。
- 修 P1：`response.text()` 双读；加载失败=错误卡+重试按钮；换卡重置高度；effect 依赖补 `sessionId`。
- `correct_state` / `send_message` / `draft_lore` 的调用全部检查响应与异常，错误显示在框架错误卡内。

### 3. stage-tab.tsx 重写

- **布局**：app 面板全幅优先（首个 app 面板占主区，其余 L1 面板进右侧/底部抽屉，抽屉可展开回网格）；卡包无 app 面板时维持 L1 网格。
- **主题**：宿主 token 打底，读 manifest 可选 `theme`（CSS 变量覆盖，小范围词表）。
- **三态**：统一骨架屏（加载）、错误卡（manifest 失败/路由失败，含重试+详情折叠）、空态（卡未声明 UI 的引导文案）。
- **入口记忆**：会话内记住上次停留的子视图（store 或 sessionStorage 级，选与现有代码一致的最简实现）。
- **热重载**：开发模式（沿用仓库现有 dev 判定惯例）下 window focus / 页签重进时带 ETag 重校验 manifest；修复 `MANIFEST_ERRORS` error→absent 脏读；「重新读取」按钮行为修对。
- **send_message**：按钮/桥调用 `inputActions.setDraft(trigger)` + `submit()`；执行前读设置投影 `allowSendMessage`，关闭时按钮禁用并提示；执行后按钮短暂成功态（busy/sent 按现有风格）。
- **RiskConfirmation**：`correct_state` patch 超过阈值（变化字段数 >8 或序列化 >2KB）与 `draft_lore` 弹确认层。
- **P2 修复**：`characterCard` 只列在场（`presence` 字段）对象，标题与实现一致；按钮无对应字段时渲染禁用+原因 tooltip；manifest 缓存 key 加会话维度或提供失效钩子（选最简正确方案）。
- 删除 `as never` / 可选 prop 硬转：slot 注册与 `StageApi` 的类型按宿主真实 props 面收紧。

### 4. 测试

- 桥 v2 握手与动词端到端（mock fetch + inputActions spy）。
- 三态渲染：加载/错误+重试/空态各至少一行为断言。
- 旧卡兼容：maid-heiress / yanmen-inn manifest 渲染冒烟（现有发布门测试更新而非删除）。
- hooks 顺序测试（`tests/stage-hook-order.spec.ts`）更新维持。
- 新错误路径：路由 500、manifest 网络失败、send_message 被设置关闭。

## 验收

- [ ] P0–P2 债逐项修复且有对应回归测试。
- [ ] 桥 v2 全链路单测绿；v1 兼容测试在。
- [ ] 布局：app 全幅 + 抽屉交互有组件级断言。
- [ ] 旧卡兼容测试过；hooks 顺序测试过。
- [ ] 全量质量门绿。
- [ ] 真机冒烟（host-runner + 内置浏览器）：两张旧卡舞台照常、eg 卡骨架加载（eg 本体是票据 03，此处至少验证路由/桥联通）。

## 备注

- `send_message` 若 spike 发现 `inputActions` 未注入 `conversation.view` 组件（文档与实现有出入），**停止实现并回报**——备选 = 降级为「预填月停+提示」，须用户裁决，不得自行绕路（如模拟键盘事件）。
