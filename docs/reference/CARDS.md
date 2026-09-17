# 原生卡包（Cards）规格提案 · v0

> **状态：v0 已落地。** 所有者以一张真实酒馆卡（`女仆大小姐.json`）触发转译，据此采用**目录形态**；
> 首个原生卡包见 [`../../cards/maid-heiress/`](../../cards/maid-heiress/)，加载器见 `src/cards.ts`。
> 宿主接缝已勘察（见 [HOST_SEAMS.md](HOST_SEAMS.md)）。
> 关联：D7（Skills 替代 Lorebook）· D14（不兼容酒馆卡，靠 AI 单向转译）· HOST_ALIGNMENT 第 4 节红线。

---

## 1. 为什么现在必须做卡包

真机二测暴露的不是 bug，而是**形态缺失**：目前的 RP 模式只是一个「通用执笔人设」，
没有任何角色卡 / 世界卡。由此产生一连串连锁问题：

| 现象 | 根因 |
| :--- | :--- |
| 发「你好」后作者自行铺开山谷、猎人、木屋 | 没有卡包提供世界；人设只能自造或空转 |
| 作者自称「纪事者 / 作者」并询问「想把故事开在哪」 | 没有开场白，也没有玩家角色，作者不知道自己在演谁 |
| 右侧状态从空开始 | 没有卡包提供初始 WorldState |
| `RP skills visible (0)`（基础 `rp`） | 基础模式不带卡包设定；世界知识挂在派生 preset `rp-<card-id>` 上（见 §12） |
| 「不像 RP，像 coding agent」 | 没有卡面、开场白、文学排版这些 RP 的可见骨架 |

**结论：卡包是 RP 的地基。** 它同时承载：人设、开场白、玩家角色、初始状态、世界知识、卡面。

---

## 2. 设计原则

1. **目录形态**：一张卡 = 一个目录。与现有 `presets/rp/`、DSH Skill 目录同构，天然容纳
   多文件（开场白、技能、头像、初始状态），且可被 git/压缩包/未来转译工具直接处理。
2. **零酒馆字段**（D14）：卡包只认我们自己的字段；酒馆卡由未来独立转译 Skill 处理。
3. **不新增基建**（D15 + HOST_ALIGNMENT）：卡包读取只做「读目录 → 映射到宿主既有接缝」，
   不自建数据库、不自建 HTTP、不自建索引引擎。
4. **Skills 优先**（D7）：卡包的大段世界设定走 DSH Skills；只有必须始终遵守的「核心」才常驻注入。
5. **可演进**：frontmatter 只声明**已知字段**；未来字段由 Chronicler 按 D5 演进，不锁死。

---

## 3. 卡包目录结构（提案）

```text
cards/<card-id>/
├── card.md                 # 必需：frontmatter（元数据）+ 正文（世界核心设定）
├── openings/
│   ├── default.md          # 必需：默认开场白（首条 in-world 叙述）
│   └── <name>.md           # 可选：备选开场，玩家可切换
├── state.json              # 可选：初始 WorldState（严格对齐现有 schema）
├── skills/                 # 可选：本卡专属世界知识（标准 DSH Skill 目录）
│   └── <skill-id>/SKILL.md
└── avatar.png              # 可选：卡面（png/jpg/webp）
```

> 卡包根目录：用户卡放 `<dshHome>/.dsh-rrp/cards/`；随包示例卡放本仓库 `cards/`。
> 同名时用户卡优先（与 preset 物化的「用户可覆盖」策略一致）。

---

## 4. `card.md` 规范（提案）

### 4.1 frontmatter 字段

| 字段 | 必填 | 类型 | 含义 |
| :--- | :---: | :--- | :--- |
| `id` | ✅ | string | 唯一 id，须等于目录名 |
| `name` | ✅ | string | 显示名（卡面标题、会话标题来源） |
| `summary` | | string | 一句话简介（展厅列表用） |
| `tags` | | string[] | 分类标签 |
| `player` | | `{ name, description }` | **玩家角色**（解决「作者不知道你是谁」） |
| `persona` | | string | 追加到 Author 人设的世界规则 / 文风 / 称呼约定 |
| `opening` | | string | 默认开场白文件名；缺省取 `openings/default.md` |
| `version` | | string | 卡包版本 |
| `author` | | string | 作者署名 |

### 4.2 正文 = 世界核心

`card.md` 的 Markdown 正文是该卡的**世界核心设定**（越短越好，建议 < 1500 字）：
世界基调、硬性规则、玩家处境、关键 NPC。它必须**始终被作者看到**，因此常驻注入（见 §7）。
更细的设定（势力、地理、功法、历史）放进 `skills/`，由模型按需调取。

### 4.3 示例

```markdown
---
id: rainy-inn
name: 雨夜客栈
summary: 一个雨夜，你推开客栈的门。
tags: [武侠, 悬疑]
player:
  name: 顾青
  description: 一个负伤赶路的剑客，身上带着一封不能拆的信。
persona: |
  低武江湖。没有飞剑与真气，只有刀、雨、人心。
  NPC 一律用第三人称描写；称呼玩家角色用「你」。
opening: default
---

连绵三日的大雨把官道泡成了泥。天黑透时，你终于望见山坳里一盏摇晃的灯——
那是间没有招牌的客栈。门是虚掩的。
```

---

## 5. 开场白（Openings）

- 每个 `openings/*.md` 是一段**成品正文**（第三人称、in-world），作为新会话的
  **首条 assistant 消息**注入，让故事从开场就直接开始，而不是等玩家说「你好」。
- 玩家在展厅可预览并选择其一；会话内可用命令切换（如 `/opening`，待定）。
- 开场白写入后，Chronicler 照常对该轮推演初始状态。

---

## 6. 初始状态（`state.json`）

- 严格对齐 `worldStateSchema`（`characters/inventory/scene/flags`）。
- 新会话启动时以一条 facts 上下文消息（`user/message` 的 `source.rrp.worldState`）写入，右侧面板立即有内容。
- 玩家角色建议同时进入 `characters`（以 `player.name` 为键），便于 Chronicler 追踪。

---

## 7. 与现有体系的映射

| 卡包资产 | 落到的宿主/插件接缝 | 说明 |
| :--- | :--- | :--- |
| `persona` + 正文世界核心 | `rrpCard` 投影 + `src/state-publisher.ts` 注入 | 只在带该卡的会话生效，不污染 preset；模型可见、面板不显示 |
| `skills/` | `mountSkillsForCard` 拷入**该卡专属 preset** (`rp-<id>`) 的技能根 → DSH Skill | 实测启动日志 `card preset 'rp-maid-heiress' skills (6): maid-apartment, …` |
| `state.json` | `user/message` 的 `source.rrp.worldState` + 现有投影 | 无需新投影 |
| 开场白 | 新会话的首条消息 | 需宿主「以预设新建会话 + 注入首条消息」接缝（见 §9 待勘察） |
| 卡面/列表 | 卡片展厅 UI | 复用 Slots / 右侧栏 / 顶栏入口（见 §9） |
| 会话标题 | 宿主 session-title | 由 `name`/开场首句派生 |

---

## 8. 卡片展厅（Chronicle 入口，DESIGN §2.3）

- 一个原生入口（顶栏或侧栏 Tab），列出可用卡包：卡面、名称、简介、标签、开场白预览。
- 点「开始」→ 按 §9 的接缝新建会话（preset=`rp`）、写入初始状态与开场白。
- 纯读列表来自两个目录 + 宿主 storage（如需记录最近使用）。

---

## 9. 宿主接缝（已勘察，详见 [HOST_SEAMS.md](HOST_SEAMS.md)）

1. **卡片展厅**：没有全局顶栏 slot。正统入口 = `main` 主区面板（keyed）+ 同名
   `sidebar.panellist` 导航图标（list id 必须等于 main key），切换用 `ctx.layout.selectPanel(id)`。
2. **新建会话 + preset**：`ctx.sessions.create({ workspaceId?, cwd? })` **没有 preset 参数**；
   建后立即 `ctx.remote.agentPresets.select(sessionId, presetIdForCard(card.id))`（仅空会话可切换）；POST `/dsh-rrp/start` 之后再 `ctx.sessions.open(id)`。
3. **开场白**：**没有「建时带首条消息」的 API**。做法是建后
   `ctx.sessions.binding(id).session.prompt([{type:'text',text}], 'queue')`。注意这会写成一条
   **user/message**（需带 `source` 才能与玩家发言区分）；`system/message` 会进入模型可见历史，RP 慎用。
4. **正文可见化**：非 surface 的自定义事件默认不可见；要让卡片进正文，需
   `ctx.uiConversation.events.register(...)` + `conversation.chat.node` 注册组件（右栏投影方案最省事，已用）。
5. **preset 目录**只认 `agent.cordis.yml` + 可选 `preset.yml{name,description,order}`，**没有开场白/图标字段**。

---

## 10. 已采用的 v0 决策

| 问题 | 采用 |
| :--- | :--- |
| 载体 | **目录** `cards/<id>/`，零新依赖 |
| 开场白 | **首条起笔消息**（`session.prompt`） |
| 世界核心 | `persona` + `card.md` 正文**常驻注入**；细节走 `skills/` 按需调取 |
| 玩家角色 | `player` → 进入初始 `characters` |
| 卡 vs preset | 卡**不**自带 `agent.cordis.yml`；preset 仍唯一（`rp`） |
| 根目录 | 用户 `<dshHome>/.dsh-rrp/cards/`，随包 `cards/`；用户同名覆盖 |

> 这些是 v0 默认，仍可随所有者意见调整（D13 的「可演进」精神）。

## 11. 首个原生卡包：`女仆大小姐`（酒馆卡转译）

来源 `女仆大小姐.json`（SillyTavern V2）。该卡 `description/personality/scenario` 为**空**，
全部人物与世界观都在 `character_book`（世界书）的 10 条词条里。

| 酒馆字段 | 我们的落点 |
| :--- | :--- |
| `name` / `creator` / `character_version` / `tags` | `card.md` frontmatter 的 `name` / `author` / `version` / `tags` |
| `first_mes` | `openings/default.md`（`{{user}}` → 你，`名字:` 对白前缀改写为叙述） |
| 世界书 · 世界设定 | `skills/world-setting/SKILL.md` |
| 世界书 · 米娅 / 女仆长设定 | `skills/mia`、`skills/cecilia` |
| 世界书 · 家族势力 | `skills/family` |
| 世界书 · 平民公寓 | `skills/apartment` |
| 纯爱基调 / 心理 / 伪装 / 暗中解决 / 生病 | `skills/tone` |
| （无对应，我们新增） | `state.json` 初始 WorldState |
| **丢弃** | `extensions`（`regex_scripts`、`tavern_helper` 等旧引擎私有字段，按 D14）；世界书 `keys/constant` 的**正则触发语义**降级为 Skill 的自然语义检索 |

> **秘密可见性（待实机确认）**：米娅的真实身份是核心秘密，只能进「模型可见、玩家不直接看到」的层
> （`card.md` 的 persona/world core 常驻注入 + `skills/`）。`state.json` 只放玩家已知事实。
> 当前 persona 走 `agent/pre-step` 注入（正文里显示为 context 节点）——**这一点必须实机确认是否会剧透**。

## 12. 实现现状（2026-09-17）

- 加载器 `src/cards.ts`：纯目录解析（frontmatter 子集 / 开场白 / `state.json` / `skills`），无 HTTP、无 DB、无索引；`mountSkillsForCard()` 把**一张卡**的 `skills/*` 挂进**它自己的** preset 技能根。
- 卡面类型 `src/card-types.ts`：依赖为零，宿主与浏览器共享。
- **卡包设定投影** `rrpCard`（`src/projection/card.ts`）+ `renderCardContext`：Author 每步基线按「卡包设定 → 实时状态 → 大局编年」注入（`src/state-publisher.ts`，追加式去重）。
- 只读路由 `src/cards-route.ts`：`GET /dsh-rrp/cards`、`GET /dsh-rrp/cards/one?id=<id>`。
- 开卡路由 `src/start.ts`：`POST /dsh-rrp/start` → 发布卡包 + 初始状态上下文（`source.rrp`；actor `card` 记入内存账本），**最后**追加开场白。
- 卡片展厅 `src/client/gallery-panel.tsx`：`main` 主区面板 + 同名 `sidebar.panellist` 导航；开始流 = create → `agentPresets.select(presetIdForCard(card.id))` → POST start → open。UI 用宿主原子库（搜索/封面/标签/技能卡/开场白 + 底部主操作条）。
- **主题（已撤回 P0）**：暖纸 `overrideTokens` 层观感被所有者否决，改用 **DSH 原版亮暗**；面板自身靠 `@deepseek-ai/dsh-client-ui-primitives` 原子 + `--dsw-alias-*` token 保持原生观感（见 [UI_CEILING.md](UI_CEILING.md) §A4）。
- 测试：`tests/cards.spec.ts`、`tests/start.spec.ts`、`tests/client.spec.ts` 等——全套 **66 用例**（`pnpm typecheck` / `build` 全绿）。
- **已实机确认**：开场白被宿主原生接受为**正文第一条**；卡包 persona 注入**零剧透**（见 [MANUAL_TEST.md](MANUAL_TEST.md)）。
- ✅ **技能作用域（已修）**：每张卡一个 `rp-<card-id>` preset（`src/preset-id.ts`），绑定卡包开局时 `agentPresets.select` 选它；基础 `rp` 无卡包设定。宿主启动日志会逐个打印各 preset 的技能表。
- **待优化**：P4 输入区接管；多卡体系下的卡面封面图；第二张官方测试卡。
