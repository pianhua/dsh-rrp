# 票据 03：eg 改编测试卡 + 真机验收 + 文档

> Status: ready-for-agent · 依赖：票据 01+02 · 分支：`feat/stage-v2`
> 规格真源：[`spec.md`](../spec.md) · 决策：D25（9 条）

## 目标

把酒馆前端卡 eg.png（pjsk 天马咲希）改编为官方测试卡 `cards/pjsk-saki/`：状态栏 HUD 完整复刻、资产全本地化、mvu 变量映射 WorldState、原语测试条验收四原语；真机 e2e + authoring 文档改写。

## 范围

### 1. 卡包骨架 `cards/pjsk-saki/`

- `card.md`（persona：天马咲希单人向，改编自 eg 描述与 lorebook 精选）、`openings/`（开场白保留 eg 的公园夜遇开局）、`state.json`（26 角色追踪对象声明：id 用 eg 内部名规范化后的中文名/原名，动态字段 `affinity` number -100..100，**初始不预建全部对象**——按剧情涉及由 Chronicler 渐进建档）、`skills/`（世界观精选，从 456 条 lorebook 挑 ~30 条核心：五团设定、sekai 概念、奏坂相关）。
- `ui/manifest.json`：`title: 天马咲希 · 现场`；app 面板「status」→ `src: "status.html"` 全幅；buttonRow「ask」两个 ask_copilot 按钮（沿用 eg 的提问位）；**原语测试条**（`test.html` 小面板或并入 status）：四按钮分别触发 correct_state / ask_copilot / send_message / draft_lore，附 resize 调用示例。
- 卡归属注册：走现有卡包扫描惯例（参照两张官方卡），卡名 `pjsk-saki`。

### 2. 状态栏 HUD 复刻（L2 多文件）

- 从 `eg-script1.html`（已解出在桌面 `eg-script1.html`）改写为 `ui/status.html` + `ui/css/status.css` + `ui/js/status.js`：
  - 保留：角色卡面板网格（立绘+名+团徽+affection 进度环）、拖拽滚动、背景幻灯片、`window.rrp.onState` 数据驱动（原 mvu 变量读取改为 `onState` 推送的 WorldState 快照，按追踪对象 id 取 affinity）。
  - 去除：一切 `<UpdateVariable>` 解析、mvu 依赖、ST API（getContext 等本就没有直连）。
  - 立绘点击 → `rrp.correctState` 微调的示例（+5/-5 好感，归因 player）。
- 观感对齐 eg 原版（粉蓝 sekai 主题），主题色经 manifest `theme` 变量注入。

### 3. 资产本地化

- 写一次性脚本 `scripts/fetch-pjsk-assets.mjs`：解析改写后的 `status.html/css/js` 实际引用的 URL 子集 → 下载到 `cards/pjsk-saki/ui/assets/`（统一转 `.webp` 可用现成工具则转，没有就保留原格式）→ 改写引用为相对路径。
- 不引用的 62 个 URL 不下载；下载失败的清单列报告。
- 体积红线：卡包总大小超 30MB 时暂停并报告用户裁决。

### 4. Chronicler 提示词约束

- `src/agents/chronicler.ts` 增 pjsk 卡适配段（或卡包 skills 内约束，选与现有适配机制一致处）：affection 仅在剧情明确涉及该角色时更新，幅度 ±1~5；**非必要不新建追踪对象/字段**（沿用 world-state 债务纪律）。

### 5. lore 精选改编

- 从 `eg-ccv3.json`（桌面）的 `character_book.entries` 挑 ~30 条核心条目，改写为卡包 skills 的世界观技能（Markdown 叙述式，非酒馆触发器式）。

### 6. 真机 e2e 验收（host-runner + 内置浏览器）

- 状态栏：开卡 → 面板加载 → 推进两回合 → Chronicler 建档后角色卡/affinity 刷新可见；拖拽流畅；幻灯片背景轮换。
- 断网验收：关网（或路由级断外网）刷新页面仍完整。
- 原语四连：correct_state 落账（activity 归因 player）、ask_copilot 预填不发送、send_message 以玩家身份进对话流且归因 player、draft_lore 进设定集待确认（确认后 sediment）。
- 旧卡回归：maid-heiress / yanmen-inn 舞台冒烟。
- 记录进 `dsh-rrp-test-report/`（沿用既有 E2E brief 格式）+ worklog。

### 7. 文档

- `docs/authoring/card-ui.md` 全面改写：多文件资产、stage-kit、四原语、eg 卡作范例教程。
- `docs/dev/worklog.md` 记 stage-v2 交付。

## 验收

- [ ] `pnpm test` 中卡包发布门：pjsk-saki manifest 可加载、status.html 存在、资产引用全部本地（测试里断言无 `https?://` 外链）。
- [ ] 真机 e2e 清单全过（上面第 6 节）。
- [ ] Chronicler 约束生效实测：无关角色不建档。
- [ ] 全量质量门绿。
- [ ] 交付报告：内容表 + 验收证据 + 遗留。
