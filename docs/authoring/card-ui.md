# 让卡包自带界面

> 卡不只是文字：它可以带自己的仪表盘、控制台，甚至一整页自定义界面。

## 一句话原理

你在卡包里放一份声明，插件在会话里开一个**「舞台」页签**把它画出来。舞台读的是**实时世界状态**，
所以每推一轮、每改一次数值，界面自己就跟着变——你不用写一行代码，也不用管刷新。

## 目录

```
cards/<你的卡>/
└── ui/
    ├── manifest.json    ← 界面声明
    ├── console.html     ← （可选）声明式面板不够用时，你自己的页面
    ├── css/ js/         ← （可选）页面可以拆成多文件
    └── assets/          ← （可选）图片、字体等本地资产
```

没有 `ui/` 就是普通文字卡，什么都不显示，也不会报错。

## 最小例子

`ui/manifest.json`：

```json
{
  "version": 1,
  "title": "我的卡 · 现场",
  "layout": "grid",
  "panels": [
    { "id": "now", "component": "timeline", "title": "此刻", "span": 2 },
    { "id": "hero", "component": "gauge", "title": "女主好感",
      "bind": "trackedObjects.mia.character.affinity", "min": 0, "max": 100 },
    { "id": "cast", "component": "characterCard", "title": "在场人物" },
    { "id": "ties", "component": "relationTable", "title": "关系" }
  ]
}
```

改完不用重开局——舞台页签会在重新进入时重读 manifest。

## 面板一览（L1 声明式）

| 组件 | 干什么 | 关键字段 |
| :--- | :--- | :--- |
| `gauge` | 数值条（好感、进度） | `bind` 数值路径、`min`/`max` |
| `characterCard` | 在场角色卡片区 | — |
| `relationTable` | 关系列表 | — |
| `timeline` | 当前场景（时间/地点/天气） | — |
| `buttonRow` | 按钮行，最多 8 个 | `buttons[]` |
| `app` | 整页自定义页面 | `src` = `ui/` 下的 html 文件 |

所有面板都可以有：`title`、`span`（1 或 2 列宽）、`order`（排序）、
`when`（显示条件，语法与技能条件注入完全同一套，例如
`"when": "trackedObjects.mia.character.affinity >= 40"`）。

## 四个动作原语（按钮和页面共用）

这是卡界面**唯一**能对游戏做的事，多一件都没有：

| 原语 | 干什么 | 必填字段 |
| :--- | :--- | :--- |
| `correct_state` | 就地修改世界状态（走玩家矫正通道，账本归因玩家） | `patch`（WorldState v2 部分切面） |
| `ask_copilot` | 打开月停并预填问题（**不自动发送**） | `question` |
| `send_message` | 代拟一条玩家发言发送（走宿主输入机；玩家可在 RP 设置里关掉） | `trigger`（预写好的消息文本） |
| `draft_lore` | 起草一条设定集条目进**待确认**（玩家确认后才落盘） | `entry`（`{name, description, body}`，name 用 kebab-case） |

示例：

```json
{ "id": "ask", "component": "buttonRow", "title": "出戏求助", "buttons": [
  { "label": "下一步做什么", "action": "ask_copilot",
    "question": "按当前状态给我三条可选路线。" },
  { "label": "好感 +5", "action": "correct_state",
    "patch": { "trackedObjects": { "mia": { "character": { "affinity": 13 } } } } }
] }
```

## 自定义页面（L2 沙箱应用）

`app` 面板指向 `ui/` 下一个 html 文件，插件会把它装进**真沙箱 iframe**：

- `sandbox="allow-scripts"`（不给 `allow-same-origin`）——页面摸不到宿主、摸不到网络外链；
- CSP `default-src 'self'`——**只允许加载本卡 `ui/` 目录里的文件**，外链一律被拦；
- 页面是**多文件**的：`<link href="css/x.css">`、`<script src="js/x.js">`、`<img src="assets/x.webp">`
  都会从卡包伺服，相对路径照常写。

页面与插件之间只有一座窄桥 `window.rrp`：

```js
window.rrp.onState(function (msg) {
  // msg.state = 实时世界状态（只读）；msg.card = 当前卡；msg.transcript = 最近正文尾段
})
window.rrp.correctState(patch)   // 同 correct_state 原语
window.rrp.askCopilot(question)  // 同 ask_copilot
window.rrp.sendMessage(text)     // 同 send_message
window.rrp.draftLore(entry)      // 同 draft_lore
window.rrp.resize()              // 页面高度变了就调用，宿主自动跟随
```

桥协议 v2：页面加载后 shim 会自动发 `rrp:hello`（带协议号），宿主回 `rrp:ready`（能力集）并开始推状态。
`window.rrp` 不存在时（理论上不会）轮询等待即可，参考 `cards/pjsk-saki/ui/js/status.js` 的 `boot()`。

## 官方工具包 stage-kit

`/dsh-rrp/stage-kit/kit.css` + `kit.js` 提供与宿主观感一致的样式类和助手：

```html
<link rel="stylesheet" href="/dsh-rrp/stage-kit/kit.css" />
<script src="/dsh-rrp/stage-kit/kit.js"></script>
```

## 主题变量

manifest 可以声明主题，舞台会以 `--rrp-*` CSS 变量注入你的页面：

```json
"theme": { "accent": "#FF6699", "paper": "#FFF7FA" }
```

```css
.my-card { color: var(--rrp-accent, #ff6699); }
```

## 资产与离线

- 所有图片/字体必须放在卡包 `ui/assets/` 里本地化引用，**不要写外链**——离线必须可玩；
- 一次性下载大量图可用脚本范式参考 `scripts/fetch-pjsk-assets.mjs`（拉取 → 落盘 → 改写相对路径）；
- `assetRefs` 字段可声明资产清单（≤64 条），加载时会校验存在性，帮你提前发现写错的路径。

## 完整范例

`cards/pjsk-saki/`（世界计划 · 天马咲希）是官方范例卡：多文件状态栏 HUD、本地立绘、
四原语测试条、主题变量、Chronicler 纪律文件 `chronicler.md`（控制好感建档节奏），可整包照抄改。

## 红线（别踩）

- 界面**不进模型上下文**——模型不知道你画了什么；需要模型配合的呈现写进 persona 或技能；
- 沙箱里 `fetch` 只能打本卡路由，出网会被 CSP 拦；
- 卡页面没有持久存储（localStorage 不可用）——状态一律进世界状态投影，读档/分支自动正确；
- `correct_state` 大改动会弹玩家确认层，这是特性不是故障。
