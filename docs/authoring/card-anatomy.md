# 卡包解剖学

> 一张卡 = 一个目录。半小时做出能玩的第一张卡。

## 目录形态

```text
cards/<card-id>/
├── card.md          # 必需：frontmatter（元数据）+ 正文（世界核心）
├── openings/
│   └── default.md   # 必需：开场白（成品正文，故事直接从这开始）
├── state.json       # 可选：初始世界状态
├── skills/          # 可选：世界知识（标准 DSH Skill 目录）
│   └── <skill-id>/SKILL.md
└── avatar.png       # 可选：卡面
```

放哪：用户卡放 `<dshHome>/.dsh-rrp/cards/`，随包示例卡在仓库 `cards/`（同名时用户卡优先）。放好文件、重启宿主（或热重载），卡片展厅里就会出现。

## card.md：frontmatter

| 字段 | 必填 | 说明 |
| :--- | :---: | :--- |
| `id` | ✅ | 小写 kebab-case，**必须等于目录名** |
| `name` | ✅ | 显示名（也是会话标题「卡名·主线」的来源） |
| `summary` | | 展厅一句话简介 |
| `tags` | | 分类标签数组 |
| `player` | | `{ name, description }` 玩家角色——解决「执笔不知道你是谁」；开局时玩家可覆写 name |
| `persona` | | 追加给执笔的世界规则/文风/称呼约定 |
| `opening` | | 默认开场白文件名，缺省 `default` |

## card.md 正文 = 世界核心

正文是**始终被执笔看到**的常驻设定：世界基调、硬性规则、玩家处境、关键 NPC 一览。**越短越好**（建议 1500 字内）——细的势力史、地理志、功法谱全部拆进 `skills/` 按需调取。

一条经验法则：**「漏看一次就会写崩世界」的放正文，「看到才算」的放技能。**

## openings/：开场白

一段**成品第三人称正文**（不是提示词！），新会话直接以它开幕——玩家不用先说「你好」。

- 支持 <code v-pre>{{player.name}}</code> / <code v-pre>{{player.description}}</code> 插值（card.md 的正文与 persona 同样支持）；
- 玩家覆写了主角名，开场白在**写入日志前**就用覆写值定稿；
- 未知变量原样保留，skill 文件里不要用变量。

## state.json：初始状态

严格对齐世界状态 schema（characters / inventory / scene / flags，可加自定义字段）。开局即写入，右侧栏从第一秒就有内容。建议把玩家角色也放进 `characters`（以主角名为键），方便状态推演追踪。

最小可用示例：

```json
{
  "characters": {
    "老板娘": { "affinity": 0, "mood": "滴水不漏" },
    "无名客": { "affinity": 0 }
  },
  "scene": { "location": "孤灯客栈 · 大堂", "time": "入夜", "weather": "暴雪" },
  "flags": { "暴雪封关": "至少三日，谁也走不了" }
}
```

## persona：给执笔立规矩

基调、视角、信息纪律写在这。参考官方卡「雪夜雁门客栈」的写法：悬疑核心三条 + 铁律三条，每条都是可执行的禁令而不是形容词。**信息差是卡的核心玩法**——「玩家角色未知的秘密不得写进正文」这类规则值得每卡都有。

## 最小骨架（10 分钟版）

只写 `card.md` + `openings/default.md` 就能开局（状态从零长、知识靠模型即兴）。跑通感觉后，再补 `state.json` 和第一个 skill。

## 下一步

- 关键剧情分支要「绝不漏注入」→ [技能与 when: 条件注入](/authoring/skills-when)；
- 手上是旧酒馆卡 → [酒馆卡迁移清单](/authoring/tavern-migration)。
