# 舞台 v2 重做规格（stage-v2）

> Status: ready-for-agent（决策已落盘 D25，2026-09-26 拷问访谈 40 题全按建议锁定）
> 分支：`feat/stage-v2`（开工时创建）；决策真源：[`docs/reference/DECISIONS.md`](../../docs/reference/DECISIONS.md) D25

## 1. 概述

舞台从「卡包 HUD 渲染器」升级为**卡包前端应用平台**。一期交付：多文件资产政策、桥协议 v2、代拟发言/设定集草稿两新原语、官方 stage-kit、舞台客户端重写（布局+三态+质量债）、eg 改编测试卡（pjsk-saki 状态栏）。

## 2. 目标 / 非目标

**目标**
- `ui/` 多文件资产目录（html/css/js/图片/字体，类型白名单，路径穿越防护，`ACAO:*`），iframe src 化，CSP `default-src 'self'`。
- 桥协议 v2：版本握手+能力协商；v1 卡兼容。
- 写面：状态写唯一通道 `correct_state`（大 patch 弹 RiskConfirmation）；叙事动作 `ask_copilot` / `send_message`（inputActions.setDraft+submit，RP 设置可关）/ `draft_lore`（PENDING 暂存，过 D8 确认环）。
- 官方 stage-kit（css+js runtime，主题 token 对齐宿主）。
- 舞台客户端：app 全幅优先、L1 侧栏抽屉、主题变量、官方三态（骨架屏/错误卡+重试/空态）、入口记忆。
- 质量债清零：P0 宿主接缝声明、P1 静默失败/类型洞/双读、P2 缓存/在场过滤/按钮校验。
- author-time 校验激活（`when` 路径警告补传初始状态、绑定路径、资产存在性）。
- 开发模式热重载（manifest/资产变更即重校验，修 error→absent 脏读）。
- `cards/pjsk-saki/` 测试卡：状态栏 HUD 完整复刻 + 原语测试条 + 资产全本地化 + lore 精选改编。

**非目标（一期不做，二期视实测再排）**
- L1 四新组件（image/progressRing/tagList/richText）与 tab 布局（D25 决策 6 二期）。
- 建团页级复杂交互、stage-kit 组件扩充。
- 聊天流内渲染（D21 维持）、外链放行、卡包持久存储。

## 3. 架构与数据流

```
卡包 ui/（manifest.json + app.html + style.css + app.js + assets/*）
   │  ① 插件只读路由 /dsh-rrp/card-ui 整树伺服（白名单类型 + ACAO:*）
   ▼
StageFrame（iframe src=…/app.html, sandbox=allow-scripts, CSP default-src 'self'）
   │  ② postMessage 桥 v2：rrp:hello(ver) ⇄ 能力集；rrp:state 推送（节流 100ms）
   ▼
window.rrp：onState / correctState / askCopilot / sendMessage / draftLore / resize
   │
   ├── correct_state ──→ POST /dsh-rrp/world-state（玩家矫正通道，归因 player）
   ├── ask_copilot ────→ 月停预填（不发送）
   ├── send_message ───→ 宿主 inputActions.setDraft+submit（会话标准 props）
   └── draft_lore ─────→ POST /dsh-rrp/lore { action:'stage' }（仅 PENDING 暂存）
```

stage-kit：`/dsh-rrp/stage-kit/kit.css` + `kit.js` 随插件伺服，卡页面 `<link>/<script>` 引用（self 内）。

## 4. 契约摘要（票据 01 落盘为代码真源）

- **路由** `/dsh-rrp/card-ui`：manifest 查询兼容旧参数；文件伺服 `?card=&file=` 扩展为整树相对路径（`..` 拒绝、白名单扩展名、Content-Type 映射、ETag）。`/dsh-rrp/stage-kit/`：插件自带静态资产。
- **ui-schema v2**：`UiActionKind` 增 `send_message | draft_lore`；`UiButton.sendMessage` 用预写 `trigger: string`；按钮校验 = `patch`/`question`/`trigger` 按动词必填 + label 唯一。
- **桥 v2**：`UI_BRIDGE_PROTOCOL = 2`；`rrp:hello { protocol }` → 父回 `{ t:'rrp:ready', protocol, verbs:[…] }`；`UiCall` 增 `send_message { text }` / `draft_lore { entry }`；`UiPush` 维持 v1 字段。CSP 常量改 `'self'` 族。
- **lore-route**：新增 `action:'stage'`——request.draft 直存 PENDING（不过 LLM、不追加、不 sediment），响应 `{ ok:true, drafting:false }`。
- **设置投影**：RP 设置增 `allowSendMessage: boolean`（默认 true）。

## 5. 票据

| # | 票据 | 范围 | 依赖 |
| :- | :--- | :--- | :--- |
| 01 | [01-server-contract.md](tickets/01-server-contract.md) | 路由多文件+stage-kit、ui-schema v2、桥 v2、lore stage、设置投影、HOST_SEAMS 增补 | 无 |
| 02 | [02-client-rewrite.md](tickets/02-client-rewrite.md) | stage-tab/stage-frame 重写、inputActions、RiskConfirmation、三态、质量债、热重载 | 01 |
| 03 | [03-eg-card-e2e.md](tickets/03-eg-card-e2e.md) | cards/pjsk-saki 改编、资产本地化、Chronicler 约束、真机 e2e、authoring 文档 | 01+02 |

## 6. 验收标准（一期完工门）

1. eg 改编卡真机游玩：状态栏实时刷新、拖拽面板流畅、幻灯片背景正常、**断网可用**。
2. 原语测试条四连：correct_state 落账归因 player、ask_copilot 预填不发送、send_message 以玩家身份进对话流（归因 player，设置关闭后失效）、draft_lore 暂存进设定集待确认不过 LLM。
3. 旧卡零改动兼容：maid-heiress / yanmen-inn 舞台照常渲染（src 化后 console.html 走新路由）。
4. 全量质量门绿：`check:environment → format:check → typecheck → lint → test --silent → build → git diff --check`。
5. 报告 + worklog + 推送合并（须用户明示）。

## 7. 风险与对策

| 风险 | 对策 |
| :--- | :--- |
| opaque origin + src 的 subresource 细节（字体/fetch/ESM 需 CORS） | 路由统一 `ACAO:*`；票据 01 单测 + 真机早验（eg 卡即覆盖） |
| inputActions 在 conversation.view slot 的实际注入形态与文档有出入 | 已在宿主源码核实 `SessionStandardProps.inputActions`；票据 02 开工先写 spike 用例验证 |
| 17MB 卡 + 本地化 62 个图床资源体积 | 只本地化状态栏实际引用子集；webp 压缩；超 30MB 报告用户裁决 |
| Chronicler 维护 26 角色 affection 的积极性失控 | 提示词显式约束「非必要不新建/不更新未涉及角色字段」（沿用 world-state 债务纪律） |
