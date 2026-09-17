# Skills 机制与本项目用法（SKILLS.md）

> **背景**：决策 D7 —— 世界典籍 / 酒馆世界书（Lorebook）这一层，**改用 Skills 实现**。  
> 本文件记录 Skills 的标准定义、DSH 侧实现机制，以及 `dsh-rrp` 的使用约定。

---

## 1. 为什么用 Skills 替代 Lorebook

| 维度 | 酒馆 Lorebook（旧） | Skills（新） |
| :--- | :--- | :--- |
| 激活方式 | 正则/关键词硬匹配 | 模型语义判断 + 用户显式调用 |
| 上下文成本 | 命中即整条塞入，易堆积 | **渐进披露**：默认只加载名称+描述 |
| 模型认知 | 老一代拼接式提示词 | 现代模型训练阶段即认识该形态 |
| 可维护性 | JSON 条目，难写难读 | Markdown 文件，可版本化、可审阅 |
| 组合方式 | 单一世界书文件 | 目录化，可分层、可扩展 |

**关键收益**：默认只把「名称 + 简短描述」放进上下文；**正文只在真正用到时才加载**。这正是治「上下文硬塞」的药。

---

## 2. 标准定义（Agent Skills 开放标准）

来源：[Claude Code Skills 文档](https://code.claude.com/docs/zh-CN/skills) · [agentskills.io](https://agentskills.io)

### 2.1 基本形态

一个 Skill = **一个目录 + 一个 `SKILL.md`**：

```text
<skill-name>/
└── SKILL.md        # YAML frontmatter + Markdown 正文
```

```markdown
---
name: return-inn
description: 塞北归离客栈的地理、规矩与常客。当剧情涉及该客栈、掌柜毓忻或塞北驿路时使用。
---

# 归离客栈

## 地理
...

## 规矩
...
```

- **`description` 是灵魂**：模型靠它判断「什么时候该加载这个 skill」。
- **正文按需加载**：不激活就不进上下文。
- 支持**附属文件**（脚本、参考文档），Skill 正文可以引用它们。

### 2.2 关键设计原则

| 原则 | 说明 |
| :--- | :--- |
| **描述决定触发** | 写清楚「何时使用」；描述模糊 = skill 不触发 |
| **渐进披露** | 主体内容只在需要时加载，长参考几乎零成本 |
| **单一职责** | 一个 skill 解决一件事，别做大杂烩 |
| **可附脚本** | 可捆绑任意语言脚本，扩展模型能力边界 |
| **调用策略** | 可控制「模型可调用」与「用户可调用」两个维度 |

### 2.3 调用策略（两维）

| 策略 | 模型可调用 | 用户可调用 |
| :--- | :---: | :---: |
| 默认 | ✅ | ✅ |
| 仅模型 | ✅ | ❌ |
| 仅用户 | ❌ | ✅ |
| 隐藏 | ❌ | ❌ |

---

## 3. DSH 侧实现（宿主机制）

DSH 已原生提供 Skills 能力，**我们不需要自己解析 Markdown 或做目录扫描**。

### 3.1 注册表：`ctx.skills`

包：`@deepseek-ai/dsh-skill`  
服务键：`ctx.skills`（`SkillRegistry`）

| API | 作用 |
| :--- | :--- |
| `registerProvider(create)` | 注册一个**来源**（本地文件 / 插件内嵌 / 其他后端） |
| `register(skill)` | 直接注册一个**运行时内嵌 skill** |
| `snapshot({cwd, signal, scope})` | 取当前可见的全部 skill 观测 |
| `list({cwd, signal, scope})` | 取胜出摘要列表 |
| `get(name, {...})` | 按名加载完整定义 |

- 分层：全局层 + 按 scope 分层，**最近层赢得重名**
- 事件：`skills/change` 为失效通知，消费方自行重新获取
- 注册是**可逆 effect**，插件卸载即消失

### 3.2 文件系统提供方

包：`@deepseek-ai/dsh-skill-filesystem`  
解析 `SKILL.md`（或平铺 Markdown），并监视目录变化。

**默认扫描根（按 rank）**：

| Rank | 来源 | 路径 |
| ---: | :--- | :--- |
| 100 | project-dsh | `<projectRoot>/.dsh/skills` |
| 200 | project-agents | `<projectRoot>/.agents/skills` |
| 300 | custom | `Config.customSkillDirs` |
| 400 | user-dsh | `<dshHome>/skills` |
| 500 | user-agents | `<agentsHome>/skills` |

**这意味着**：卡包的世界知识只要落到这些根下的 `SKILL.md`，**DSH 会自动发现并让模型可用**。

### 3.3 面向模型的加载工具

包：`@deepseek-ai/dsh-tool-skill` —— 负责把 skill 暴露给模型调用。  
（注册表在 `dsh-skill`，文件来源在 `dsh-skill-filesystem`，模型工具在 `dsh-tool-skill`，三者分离。）

---

## 4. `dsh-rrp` 的使用约定

### 4.1 世界知识 → Skills

| 酒馆概念 | `dsh-rrp` 表达 |
| :--- | :--- |
| 世界书条目（地点/势力/法则） | 一个 Skill（如 `return-inn`、`qingqiu-fox-clan`） |
| 角色背景设定 | 一个 Skill（或用卡包底模承载） |
| 关键线索 / 秘密 | 一个 Skill（**可受控新增**，见 4.3） |

- **不写正则**、不做关键词激活表；
- 依赖 `description` 让模型自己判断何时加载；
- 卡包携带的 skill 应落在项目/用户 skill 根下，或通过 `ctx.skills.register()` 运行时注入。

### 4.2 两条注入路径

| 路径 | 适用 | 机制 |
| :--- | :--- | :--- |
| **文件落地** | 卡包自带的静态世界知识 | 写入 `.dsh/skills/<name>/SKILL.md`（或配置 `customSkillDirs`），由 filesystem provider 自动发现 |
| **运行时注册** | 动态产生 / 卡包内嵌、不想落盘的知识 | `ctx.skills.register(skill)`（作用域随插件生命周期） |

> 优先文件落地（可审阅、可版本化）；运行时注册用于动态场景。

### 4.3 动态沉淀的受控策略（D8，**已实现**）

D8 要求「可以有动态沉淀，但不能过于激烈导致世界观崩塌」。已实现的控制流：

```text
/lore <主题>  或  右侧「典籍」面板按钮
   ↓ 一个后台任务（ctx.jobs + ctx.llm）
Scribe Agent 只依据「最近剧情 + 当前状态 + 已有技能名」起草 **一条** 技能
   ↓ 草稿只暂存在宿主内存（绝不自动落盘）
玩家在「典籍」面板审阅 → 确认写入 / 丢弃
   ↓ 确认后写 <dshHome>/.dsh-rrp/sediment/sessions/<sessionId>/<name>/SKILL.md
该会话的 per-session provider invalidate → 下一轮按需检索
```

对照五条策略：

| 策略 | 落点 |
| :--- | :--- |
| 默认关闭 | 没有任何自动写入；只有 `/lore` / 面板按钮 |
| 仅明确触发 | 触发后还要**二次确认**才写盘 |
| 只新增不覆写 | 重名（含卡包自带技能名）直接拒绝；无任何改写既有 skill 的路径 |
| 可审阅 | 草稿预览 + 「典籍」列表 + 删除；文件本身就是普通 `SKILL.md` |
| 单次体量受限 | 一次只起草一条；名称/描述/正文/条数四重上限 |

**作用域：按会话隔离。** 关键实现：宿主 skill registry 按 **agent 作用域** 分层，而 `agent.ctx` 是 agent 局部上下文。我们在 `agent/created`（仅 RP 家族 preset）时通过 `agent.ctx.skills.registerProvider(...)` 注册一个只读该会话沉淀目录的 provider —— 于是 A 存档沉淀的设定只对 A 可见，B 存档看不到，也不会写进 preset 目录（那样每次启动会被重刷）。

### 4.4 与摘要智体的边界

| 关注点 | 归属 |
| :--- | :--- |
| 「这个世界是什么样」 | **Skills**（长期、稳定、按需） |
| 「当前发生了什么」 | **WorldState**（实时、动态、每轮更新） |
| 「故事走到哪一步了」 | **Summarizer**（阶段压缩、大局观） |

三者职责不重叠：**知识进 Skill，事实进状态，走势进摘要。**

---

## 5. 反模式（不要做）

| ❌ 反模式 | 原因 |
| :--- | :--- |
| 把世界知识写成一个巨大 skill | 违背渐进披露，等于换了皮的上下文硬塞 |
| 用正则/关键词自己实现激活 | 宿主已提供语义化发现；正则是酒馆遗毒 |
| 自建 Markdown 解析与目录扫描 | `dsh-skill-filesystem` 已提供 |
| 把每轮变化都沉淀成 skill | 状态才是每轮变化的家；会导致 skill 爆炸与世界观漂移 |
| 覆写既有 skill 来「修正」世界观 | 高风险；修正应走玩家显式操作 |

---

## 6. 待确认事项

实现阶段 5 前需对照最新宿主源码确认：

1. `ctx.skills.register()` 的确切签名与 `SkillRegistration` 字段；
2. 卡包 skill 的推荐落点（项目根 vs `customSkillDirs` vs 运行时注册）；
3. `dsh-tool-skill` 的模型调用呈现形态（是否需要在插件侧做额外引导）；
4. 沙箱四资产中的「知识目录」是否仍需自建，抑或完全交给 skill 列表。
