# 让卡包自带界面

> 卡不只是文字：它可以带自己的仪表盘、控制台，甚至一整页自定义界面。

## 一句话原理

你在卡包里放一份声明，插件在会话里开一个**「舞台」页签**把它画出来。舞台读的是**实时世界状态**，所以每推一轮、每改一次数值，界面自己就跟着变——你不用写一行代码，也不用管刷新。

## 目录

```
cards/<你的卡>/
└── ui/
    ├── manifest.json    ← 界面声明
    └── console.html     ← （可选）你自己的页面
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
      "bind": "characters.米娅.affinity", "min": 0, "max": 100 },
    { "id": "cast", "component": "characterCard", "title": "在场人物" },
    { "id": "ties", "component": "relationTable", "title": "关系" }
  ]
}
```

改完不用重开局——舞台页签右上角的刷新按钮会重新读盘。

## 六种组件

| 组件 | 干什么 | 要填什么 |
|---|---|---|
| `gauge` | 数值进度条（好感、警戒、时间余量） | `bind` 指向一个数值；`min` / `max` |
| `characterCard` | 人物卡：名字 + 好感 + 情绪/状态/外貌 | `bind` 指定某个角色，省略=全部 |
| `relationTable` | 关系网 `A × B · 标签` | 无 |
| `timeline` | 此刻：时间 · 地点 · 天气 | 无 |
| `buttonRow` | 一排按钮 | `buttons`，最多 8 个 |
| `app` | 你自己的整页界面 | `src` 指 `ui/` 下的 html |

`bind` 的路径写法和[技能的条件注入](./skills-when.md)完全一致：`characters.米娅.affinity`、`inventory.旧剑.quantity`、`flags.暴雪封关`、场景 `scene.location`，以及 Chronicler 后来自己加的顶层字段。

## 让面板「到点了才出现」

任何面板都可以加 `when`，语法和技能的条件注入一模一样：

```json
{ "id": "warm", "component": "gauge", "title": "升温阶段",
  "bind": "characters.米娅.affinity", "min": 40, "max": 100,
  "when": "characters.米娅.affinity >= 40" }
```

不成立时这一格直接不渲染。目前支持数值与布尔比较（`> >= < <= == !=`）；字符串比较刻意没开，因为自由文本词表会漂移，那样保底的显示会悄悄失效。

## 按钮能做什么（以及不能做什么）

按钮只有两种动作，这是刻意的：

```json
{ "id": "ask", "component": "buttonRow", "span": 2, "buttons": [
  { "label": "现在谁最可疑", "action": "ask_copilot",
    "question": "按当前状态，谁最可疑？给我依据。" },
  { "label": "记一笔：已摊牌", "action": "correct_state",
    "patch": { "flags": { "米娅已摊牌": true } } }
]}
```

- `ask_copilot`：打开副驾驶、把你的问题填进输入框，**不会替你发送**；
- `correct_state`：以**玩家矫正**的身份写进世界状态（账本上记的是你，不是 AI）。

界面再复杂也开不出第三条写路径——这样你随时能在右侧栏看到并改回来，AI 推演也不会被旁路。

## 想要一整页自己的界面

放一个 `ui/console.html`，然后：

```json
{ "id": "console", "component": "app", "src": "console.html", "span": 2 }
```

它会跑在**真沙箱**里：能写自己的样式和脚本，但读不到宿主页面、上不了网、弹不了窗。你只用注入好的四个方法：

```js
window.rrp.onState(function (msg) {
  // msg.state 是当前世界状态（只读），每轮自动推给你
  var mia = (msg.state.characters || {})['米娅'] || {};
  document.getElementById('aff').textContent = mia.affinity ?? '—';
});

document.querySelector('#thanks').onclick = function () {
  window.rrp.correctState({ characters: { '米娅': { affinity: 85 } } });
};

document.querySelector('#ask').onclick = function () {
  window.rrp.askCopilot('我下一步该怎么走？');
};
```

三条约定：

1. **别外链 CDN**（沙箱的 CSP 会拦，而且这是离线单机游戏）；
2. **高度自己报**：内容变了调一次 `window.rrp.resize()`，宿主会照着调，不用写 `vh`；
3. **状态会推给你，但你的页面不会被重建**——所以刷新、滚动、表单草稿都留着。

## 官方两张卡的现成示范

- `cards/maid-heiress/ui/`：纯声明 + 一个「现场控制台」页面（好感读数、快捷行动、问管家）；
- `cards/yanmen-inn/ui/`：纯声明的悬疑案头（三条人物好感、在场住客、关系与猜忌、两个出戏求助按钮）。

照着改最快。

## 常见问题

**界面会被模型看到吗？会影响剧情吗？**
不会。界面完全不进模型上下文，它是给你看的呈现。想让模型配合某个呈现，请把要求写进卡的人设或技能里。

**改了 manifest 要重开局吗？**
不用，点舞台右上角刷新即可。

**写错了会怎样？**
整份界面作废、舞台显示提示、控制台有一条带卡名的错误日志，但**卡照常能玩**。面板 id 重复、`gauge` 忘了 `bind`、`app` 指向不存在的文件、`when` 语法错——都会明确报出来。

**为什么没有背包/物品栏组件？**
刻意只留六种。表达不了的用 `app` 自己画，而不是把声明语言长成一台小机器——那样反而更难写。
