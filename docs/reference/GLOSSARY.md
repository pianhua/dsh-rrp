# 标准术语表（GLOSSARY.md）

> 旧项目的一大混乱来源是**同一概念存在多套名字**（`Agent 1/2`、`Author`、`chatId`、`storyId`、`lorebook`、`codex`…），
> 导致文档、代码、对话互相指代不清，甚至被误认为两套架构。
>
> **本文件确立唯一标准名。写代码、写文档、对话均以左列为准。**

---

## 1. 核心角色

| 标准名 | 英文 | 定义 | 🚫 禁用 |
| :--- | :--- | :--- | :--- |
| **执笔智体** | **Author Agent** | 只读设定，专注文学正文创作，严禁替玩家代打、严禁写状态 | `Agent 1`、`作家Agent`、`叙事智能体` |
| **纪事官智体** | **Chronicler Agent** | 独立智能体，推演世界与人物变化并更新状态，只写状态、不写正文 | `Agent 2`、`记账员`、`状态提取器` |
| **摘要智体** | **Summarizer Agent** | 独立智体，按轮次压缩提炼大局观，可关闭 | `总结Agent`、`罗盘Agent` |

---

## 2. 世界与状态

| 标准名 | 英文 | 定义 | 🚫 禁用 |
| :--- | :--- | :--- | :--- |
| **世界状态** | **WorldState** | 当前世界与人物的事实切面（角色、物品、场景、事件等） | `状态表`（作为标识符）、`state_table` |
| **玩家矫正** | **Player Correction** | 玩家在 AI 更新后、下一轮前手动修正状态；**不是锁** | `玩家仲裁`、`Player Arbitration`、`Unlock`、`硬锁` |
| **状态推演** | **State Inference** | Chronicler 判断「什么该记录、什么该更正」的过程 | `事实提取`、`ChangeSet 提取` |

> ⚠️ **重点**：`玩家仲裁 / Arbitration / 解绑` 这一整套词汇是旧项目「锁思维」的遗留，**已废弃**。  
> 现在是 D6 决策的「自然时序矫正」：覆盖 → 下一轮消费。详见 [`DECISIONS.md`](DECISIONS.md#d6--玩家矫正是自然时序无锁重要)。

---

## 3. 故事与分支

| 标准名 | 英文 | 定义 | 🚫 禁用 |
| :--- | :--- | :--- | :--- |
| **故事** | **Story** | 一局游玩的载体，**即 DSH Session**，正文与历史以它为准 | `chat`、`chatId`、`会话房间` |
| **分支 / 世界线** | **Branch / Worldline** | 由 DSH 原生 `Session.fork` 派生的平行历史 | `气泡翻页`、`< 1/3 >`、`重新生成次数` |
| **回合** | **Turn** | 玩家输入 + 执笔正文构成的一次推进 | `楼层`（可口语，不作标识符） |
| **开场白** | **Opening / First Message** | 卡包提供的开局正文 | `greeting`、`first_mes` |

---

## 4. 知识体系

| 标准名 | 英文 | 定义 | 🚫 禁用 |
| :--- | :--- | :--- | :--- |
| **技能 / 知识技能** | **Skill** | 按需加载的知识与流程单元（Markdown + frontmatter） | `世界书`、`Lorebook`、`World Info` |
| **卡包** | **Card Package** | 一个角色/剧本的资产集合（格式待定，见 D13） | `角色卡PNG`、`角色卡V2`、`tavern card` |

> ⚠️ **重点**：`Lorebook` 概念**已彻底废弃**，不再作为任何代码标识符或文档术语。  
> 世界知识一律表达为 **Skill**。详见 [`DECISIONS.md`](DECISIONS.md#d7--知识体系全面-skills-化) 与 [`SKILLS.md`](SKILLS.md)。

---

## 5. 插件工程

| 标准名 | 英文 | 定义 |
| :--- | :--- | :--- |
| **插件包** | **Plugin Package** | 本仓库交付的 npm 包（`dsh-rrp`） |
| **模式** | **Profile / Mode** | DSH 中由插件组合出的运行形态；我们提供 RP 模式 |
| **补丁层** | **Patch** | `cordis.patch.yml` 声明如何把插件插入组合 |
| **补丁注入** | **Inject** | `dsh.client.inject` 声明客户端依赖的宿主包 |
| **可逆注册** | **Reversible Effect** | 所有注册必须返回 disposer，卸载时干净释放 |

---

## 6. 命名规则

1. **代码标识符一律英文**，用标准名对应的英文（`authorAgent`、`worldState`、`skillRegistry`）。
2. **不出现旧词**：`lorebook`、`chatId`、`arbitration`、`unpin`、`agent1`/`agent2` 均不得出现在新代码中。
3. **文档可用中文标准名**，但涉及代码处必须标注英文对应。
4. 新增概念时：**先在本表登记**，再进入实现。
