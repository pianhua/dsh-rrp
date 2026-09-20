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
| 单模型既写文又记账 | 三智体权能分立（执笔/状态推演/脉络），月停独立 OOC 频道 |
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

## 三智体 + 两配角

| 智体 | 触发 | 权限 |
| :--- | :--- | :--- |
| Author 执笔 | 每轮玩家消息 | 只写正文；只读状态与技能；宿主 preset 物化（每卡一模式 `rp-<id>`） |
| Chronicler 状态推演 | 每轮正文后，`ctx.jobs` 异步 | 只写状态（含 D5 自创字段）；不写正文 |
| Summarizer 脉络 | 每 N 轮，可关 | 只写脉络罗盘 |
| Scribe 知识起草 | `/lore` 命令 | 只产草稿，玩家确认才入库 |
| Copilot 月停 | 面板 SSE 请求 | 问答 + 动作块（改状态走矫正通道、起草设定集只进草稿）；历史存宿主存储域，**不进会话日志** |

## 条件注入（本项目的独门）

facts 通道每轮对世界状态求值 `when:` 声明（纯数值/布尔），命中集渲染成**裁决块**：穷尽声明 + 撤销句 + 调用纪律，文本只由命中集合决定（字节稳定，指纹去重抑制重复发布），且**不进转录投影**——与 Chronicler 反馈环物理隔离。零持久化：注入永远从当前状态重算。

## 世界线地图（#28）

树 = 宿主 fork 血缘字段（`header.meta.parentSession` + `inheritedEventCount`）+ 存档点摘要投影，**服务端对 live 会话一次折全图**；客户端零存储。软归档（hidden 表）走宿主存储域。

## 模块地图

```text
src/
├── index.ts              # 插件入口，全部可逆 Effect
├── preset.ts / preset-id # RP 模式物化（基础 rp + 每卡 rp-<id>）
├── cards.ts / card-types # 卡包解析与共享词汇
├── state-publisher.ts    # 追加式发布（唯一写通道）
├── projection/           # 纯折叠器（world-state/transcript/summary/lore/card/digest）
├── world-state.ts        # 状态词汇（host/client 共享纯模块）
├── chronicler / summarizer / lore-route / correction / copilot / worldline-route
├── route-contract.ts     # 前后端 HTTP/SSE 契约单一来源（#22）
├── agents/               # 各智体提示词与输出契约
└── client/               # 面板（展厅/状态/设定集/月停/世界线）
```

## 延伸阅读（仓库内）

`docs/DESIGN.md`（产品规格）· `docs/HOST_ALIGNMENT.md`（宿主映射红线）· `docs/DEVELOPMENT.md`（开发循环）· `docs/reference/DECISIONS.md`（D1-D15 决策理由）。
