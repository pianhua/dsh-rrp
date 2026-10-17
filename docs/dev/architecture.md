# 架构总览

> 给开发者与未来的自己：这套系统为什么长这样，数据往哪流。

## 一句话定位

DSH-Chronicle 是挂在 DeepSeek Harness（DSH）上的**正统薄插件**：不自建服务器、不自制前端栈、不发明会话事件——一切依托宿主能力，领域只写纯数学折叠。

## 与酒馆的代际差（为什么不是移植）

| 旧酒馆 | 本项目 |
| :--- | :--- |
| 上下文无脑堆砌 | Skills 按需调取（抬上限）+ `when:` 确定性注入（保下限） |
| 正则世界书关键词激活 | 机制与内容分离：卡作者写声明，引擎写一次求值器 |
| `< 1/3 >` 翻页伪分支 + 幽灵状态 | 原生 `Session.fork` + 投影纯数学折叠——切线状态严丝合缝重放 |
| 单模型既写文又记账 | 叙事核心三智体权能分立（执笔/状态推演/脉络）+ Scribe 与月停两辅助，共 5 智体；月停走独立 OOC 频道 |
| 锁与仲裁的防御性包袱 | 玩家矫正 = 自然时序最后写入获胜，无锁 |

## 数据主干：追加式发布 + 投影折叠

```text
写路径（唯一）                          读路径（唯一）
publishState()                          ctx.sessionProjections
  状态变化 = 一条已知 user/message         每个投影单元 = 纯折叠器
  把结构化载荷藏进 source.rrp             (state, event) → state
  ├─ 卡包通道（card lane）                 ├─ rrpWorldState  世界状态
  └─ 事实通道（facts lane）                ├─ rrpTranscript  转录切片
      worldState / summary / lore /        ├─ rrpSummary     剧情脉络
      settings / card 变更全走这里          ├─ rrpSediment    设定集
                                           ├─ rrpCard        当前卡
  指纹去重：内容没变就不追加                └─ rrpWorldlineDigest 存档点摘要
  （前缀缓存是性能命脉）
```

两条铁的自然结果：

- **分支免费正确**：fork 复制日志，投影从日志重算——读档时正文/状态/设定集/脉络一切倒回，不需要任何"恢复"逻辑；
- **历史永不重写**：改状态 = 追加一条新事实；撤销 = 发布一次还原快照（历史留痕）。

## 五个智体（三核心 + 两辅助）

| 智体 | 触发 | 权限 |
| :--- | :--- | :--- |
| Author 执笔 | 每轮玩家消息 | 只写正文；只读状态与技能；宿主 preset 物化（每卡一模式 `rp-<id>`） |
| Chronicler 状态推演 | 每轮正文后，`ctx.jobs` 异步 | 只写状态（含 D5 自创字段）；不写正文 |
| Summarizer 脉络 | 每 N 轮，可关 | 只写脉络罗盘 |
| Scribe 知识起草 | `/lore` 命令 | 只产草稿，玩家确认才入库 |
| Copilot 月停 | 面板 SSE 请求 | 问答 + 四种动作块（改状态走矫正通道、起草设定集只进草稿、卡包/文档提案待确认）；历史存宿主存储域，**不进会话日志** |

> 五个智体统一接入 `src/agents/contract.ts` 的 `AgentPromptContract`（D18 / issue #32）：Author 与四个后台智体共用工程结构，但业务内容严格分流——Author 的 Creative License 与反 AI 腔词库永不进入数据管道，后台的 JSON 纪律也永不约束正文。

## 条件注入（本项目的独门）

facts 通道每轮对世界状态求值 `when:` 声明（纯数值/布尔），命中集渲染成**裁决块**：穷尽声明 + 撤销句 + 调用纪律，文本只由命中集合决定（字节稳定，指纹去重抑制重复发布），且**不进转录投影**——与 Chronicler 反馈环物理隔离。零持久化：注入永远从当前状态重算。

## 世界线地图（#28）

树 = 宿主 fork 血缘字段（`header.parentSession` + **顶层** `inheritedEventCount`）+ 存档点摘要投影，**服务端对 live 会话一次折全图**；客户端零存储。软归档（hidden 表）走宿主存储域。

> ⚠️ 读宿主 Session 字段务必照抄上面这两个位置：`inheritedEventCount` 是 **Session 顶层属性**，`parentSession` 直接挂在 `header` 上，**没有 `meta` 中间层**（issue #36 真机教训，详见 `docs/dev/host-seams.md`）。写错只会静默回退默认值——分支全成 root，且测试与实现会一起错。

## 模块地图

```text
src/                          # 分层方向：client/、routes/ → runtime/、publish/、各域 → host/、projection/
├── index.ts                  # 插件入口，全部可逆 Effect
├── contracts.ts              # 对外插件稳定读契约（无依赖公开面）
├── route-contract.ts         # 前后端 HTTP/SSE DTO 单一来源（#22）
├── json-extract.ts           # 通用 JSON 提取工具（无领域依赖）
├── host/                     # 宿主接缝：host-faces（ctx.get 规约与 face 取用）、preset/preset-id（RP 模式物化）、start（开局）、settings、save-naming、home
├── agents/                   # 五智体提示词与输出契约（统一 AgentPromptContract；纯契约，无宿主重依赖）
├── runtime/                  # 智体运行时编排：chronicler / summarizer / copilot / copilot-store、recall（含 fetchSessionRounds）、transcript(-reader)、prompt-budget
├── publish/                  # 追加式发布写通道（唯一写通道）：state-publisher、state-payload、correction、activity、macro-summary、steward-proposals
├── projection/               # 纯折叠器（7 单元：world-state/transcript/summary/settings/lore/card/worldline-digest）
├── world-state/              # 状态词汇与运行时：world-state（host/client 共享纯词汇）、references、visibility、timeline
├── worldline/                # 世界线：tree、store、digest、fork-marker
├── lore/                     # 设定集：lore、lore-state、lore-runtime、lore-condition、lore-application、lore-drafts、lore-provider
├── cards/                    # 卡包：cards、card-types、card-import(-parse)、card-state-schema
├── routes/                   # HTTP/SSE 路由（10 个 *-route.ts；只消费下层，不被下层消费）
├── ui-contract/              # 前后端 UI 契约：ui-schema、ui-bridge、card-ui
└── client/                   # 面板（展厅/状态/设定集/月停/世界线/舞台）
```

## 延伸阅读（仓库内）

`docs/DESIGN.md`（产品规格）· `docs/HOST_ALIGNMENT.md`（宿主映射红线）· `docs/DEVELOPMENT.md`（开发循环）· `docs/adr/`（D1–D27 决策记录，一条一篇）。

> 上述 `docs/reference/**`、`docs/adr/**`、`docs/plans/**`、`docs/agents/**` 与 `DESIGN.md`/`HOST_ALIGNMENT.md`/`DEVELOPMENT.md` 是**仓库内路径**：它们在本地工作区与克隆里可读，但被 `docs/.vitepress/config.mts` 的 `srcExclude` 排除在发布站点之外，站点上不可达。
