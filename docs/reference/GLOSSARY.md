# 标准术语表（GLOSSARY.md）

> 旧项目的一大混乱来源是**同一概念存在多套名字**（`Agent 1/2`、`Author`、`chatId`、`storyId`、`lorebook`、`codex`…），
> 导致文档、代码、对话互相指代不清，甚至被误认为两套架构。
>
> **本文件确立唯一标准名。写代码、写文档、对话均以左列为准。**

---

## 1. 核心角色

> 代码层英文标识符（Author / Chronicler / Summarizer / Scribe / Copilot）是稳定契约，**不改**；
> 中文为玩家 UI 与文档用语，2026-09-19 起从半文白造词对齐为直白现代词。

| 标准名（UI） | 英文（代码） | 定义 | 🚫 禁用 |
| :--- | :--- | :--- | :--- |
| **叙事执笔** | **Author Agent** | 只读设定，专注文学正文创作，严禁替玩家代打、严禁写状态 | `Agent 1`、`作家Agent`、`叙事作家`、`执笔智体`（旧 UI 词） |
| **状态推演** | **Chronicler Agent** | 独立智能体，每轮正文后异步推演世界与人物变化并更新状态，只写状态、不写正文 | `Agent 2`、`纪事官`（旧 UI 词）、`状态提取器` |
| **剧情脉络** | **Summarizer Agent** | 独立智体，按轮次压缩提炼宏观罗盘（目标/矛盾/转折/伏笔），可关闭 | `总结Agent`、`剧情脉络官`、`编年官`（旧 UI 词）、`Chronicle`（英文界面） |
| **知识起草** | **Scribe Agent** | 独立智体，只起草一条设定集条目（待玩家确认），绝不写状态 | `设定集编纂者`、`典籍编纂者`（旧 UI 词） |
| **月停** | **Copilot** | OOC 全知幕僚：设定咨询、破局建议、代改状态（可撤销）、起草设定集与卡包/文档提案 | `副驾驶`、`总管家`、`副驾`、`顾问` |

> **月停（2026-09-20 拍板）**：玩家可见中文名统一为「月停」。代码层英文标识符是稳定契约
> （`copilot*`、`CopilotTurn`、`actor: 'copilot'`、`StewardProposal`、`steward-*` 技能包目录）——
> 不随中文名改名；英文界面仍显示 `Copilot`。

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
| **回合** | **Turn** | 玩家输入 + 执笔正文构成的一次推进 | `楼层`（可口语，不作标识符）、`step`（宿主 `assistant/message` 的真实字段名，不可挪用为「轮」） |
| **存档** | **Save**（代码仍用 `sessionId`/`session`） | 玩家眼里的一局：一个 DSH Session 就是一个存档，右栏与地图上的可读档单位 | `档期`、`snapshot`（指状态快照时另说） |
| **主线** | **Main line**（代码 `save-naming.mainTitle`） | 一张卡下未经分叉、由开卡直接推进出的存档；命名「卡名·主线」「卡名·主线2」 | `主干`、`root`（仅代码内部） |
| **卡工作区** | **Card Workspace** | 「一卡一区」的分组抽屉：宿主 workspace，路径 `<home>/.dsh-rrp/saves/<cardId>` | `目录`、`项目` |
| **冷线节点** | **Cold (unloaded) node** | 已落盘但未加载的会话在世界线图上的占位节点 | `stub`+`skeleton`+`placeholder` 三词混用（保留 `stub` 为字段名，文档统一称冷线节点） |
| **收起此线** | **Hide**（代码 `hidden`） | 软归档：地图连同其整棵子树不再显示，绝不删宿主会话 | `归档`、`删除`、`prune`（仅折叠内部用词） |
| **开场白** | **Opening / First Message** | 卡包提供的开局正文 | `greeting`、`first_mes` |

---

## 3.1 界面与卡包交互

| 标准名 | 英文 | 定义 | 🚫 禁用 |
| :--- | :--- | :--- | :--- |
| **卡片展厅** | **Gallery** | 左侧栏的开卡入口：浏览卡包、覆写主角名、导入与开局（代码 `gallery-panel.tsx`） | `卡片商店`、`大厅` |
| **舞台** | **Stage** | 卡包自带页面的渲染面（`ui/manifest.json` 声明式 UI + 沙箱卡页面），见 [DESIGN.md](../DESIGN.md) §2.4 | `卡界面弹窗`、`自定义面板` |
| **卡包界面** | **Card UI** | 卡包 `ui/` 目录下的声明式 UI 资产与只读路由（`src/card-ui.ts` / `ui-schema.ts`） | `卡前端`、`卡 SPA` |
| **导入（酒馆卡）** | **Card Import** | 一次性把酒馆 PNG / JSON 转成原生卡包（`src/card-import.ts` + `POST /dsh-rrp/cards/import`）；**运行时仍不兼容酒馆**（D14 例外，见 [HOST_ALIGNMENT.md](../HOST_ALIGNMENT.md) §3.1） | `兼容层`、`ST 模拟器` |
| **导出（小说）** | **Novel Export** | 把一局转录导出为 `md`/`txt` 附件（`src/export-route.ts`，#31-C） | `下载器`、`爬虫` |

---

## 4. 知识体系

| 标准名 | 英文 | 定义 | 🚫 禁用 |
| :--- | :--- | :--- | :--- |
| **技能 / 知识技能** | **Skill** | 按需加载的知识与流程单元（Markdown + frontmatter）；定位是**按需取用、抬上限** | `世界书`、`Lorebook`、`World Info` |
| **条件注入** | **Conditional Injection** | skill frontmatter `when:` 声明、框架按世界状态求值后确定性注入片段的裁决块（机制与内容分离；v1 仅数值/布尔条件） | `关键词扫描`、`世界书激活` |
| **设定集** | **Lore** | 游玩中沉淀的会话专属知识条目（代码模块 `lore*.ts`，投影 key 仍为历史契约 `rrpSediment`） | `典籍`（旧 UI 词）、`sediment`（新代码禁用，历史数据除外） |
| **卡包** | **Card Package** | 一个角色/剧本的资产集合（`card.md` + `openings/` + `state.json` + `skills/`，见 [`CARDS.md`](CARDS.md)） | `角色卡PNG`、`tavern card` |

> ⚠️ **重点**：酒馆 `Lorebook` 概念**已彻底废弃**；但 **`Lore` 单词已扶正为标准词**（2026-09-19 命名对齐），
> 指「设定集条目」，与 Lorebook 无关。持久化契约中的旧键名（投影 `rrpSediment`、payload `source.rrp.sediment`）
> 是历史会话数据的一部分，保留不改，不属于命名违规。

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

1. **代码标识符一律英文**，用标准名对应的英文（`authorAgent`、`worldState`、`loreRoute`）。
2. **不出现旧词**：`lorebook`、`chatId`、`arbitration`、`unpin`、`agent1`/`agent2`、`sediment`（新代码）、`典籍/纪事官/编年官`（玩家可见处）均不得出现在新代码中。
3. **文档可用中文标准名**，但涉及代码处必须标注英文对应。
4. 新增概念时：**先在本表登记**，再进入实现。
5. **持久化契约优先**：已写入历史会话数据的键名（`rrpSediment`、`source.rrp.sediment`、存储目录）永不因改名而变更。
