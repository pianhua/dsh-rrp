---
name: steward-cards
description: 卡包规范：目录结构、card.md、state.json、openings、skills（SKILL.md frontmatter、when 条件）的格式与写作要求。当起草或评审卡包改动提案（propose_card_edit）时必调。
---

# 卡包规范速查

卡包 = 一个目录，纯文本构成，零代码。官方卡位于 `cards/<id>/`。

## 目录结构

```
cards/<card-id>/
├── card.md            # 核心：frontmatter + 世界核心正文
├── state.json         # 初始世界状态（可选）
├── openings/
│   └── default.md     # 开场白（可多份，default 为缺省）
└── skills/
    └── <skill-id>/
        └── SKILL.md   # 按需调取的世界知识
```

## card.md

frontmatter 字段：`id`（kebab-case，与目录名一致）、`name`（展示名）、`description`、`player`（玩家角色名）。正文是「世界核心」：世界观、基调、铁律、NPC 关系——写给执笔端看的稳定事实。

## state.json

初始 WorldState：`characters`（角色名 → affinity/mood/appearance/condition）、`inventory`、`scene`（location/time/weather）、`flags`。只放开局为真的状态。

## openings

第二人称开场白，把玩家直接放进场景；结尾停在一个等待玩家行动的张力点上。可携带少量初始状态说明。

## skills（SKILL.md）

- frontmatter：`name`（kebab-case 标识符）、`description`（一句话说清"这是什么 + 什么时候该加载"）、可选 `when`（条件注入：number/boolean 字面量比较，命中即确定性注入）；
- 正文只写稳定事实（设定、人物、地点），**用陈述句描述世界，不用命令句指挥模型**——"米娅面对玩家时会耳尖泛红"，而非"回复时必须描写内心"；
- 一个技能一个主题；不重复卡包基准已覆盖的内容。

## 写作红线

- 严禁酒馆式模板宏（{{user}} 等）与隐藏通道指令；
- 情感与性格一律外化为可观察事实，与 Author 的白描铁律兼容；
- 卡包间技能按 preset 隔离，不串味。

## 改动提案（propose_card_edit）格式纪律

- `file` 写相对卡包根的路径（如 `card.md`、`skills/tone/SKILL.md`）；
- `content` 必须是目标文件的**完整替换内容**，不是 diff 片段；
- 改 skills 目录后提醒玩家：对应 preset 需重载才生效。
