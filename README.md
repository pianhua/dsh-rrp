# dsh-rrp · DSH-Chronicle

> 面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的**正统薄插件** —— 个人单机沉浸式角色扮演与交互小说引擎。

**这不是第二个 Harness，也不是第二个 Web 应用。**  
它是一组严格挂在 DSH 宿主之上的插件：复用宿主的会话、Agent、投影、右侧栏与后台任务，只把「角色扮演与动态世界模拟」这一层做到极致。

---

## 当前状态

**阶段 0：文档与形态对齐（进行中）**

本仓库目前**只有设计文档，没有生产代码**。我们刻意先锁定产品形态与宿主映射，再落第一行实现，避免重演「先写代码再补架构」导致的膨胀。

| 项 | 状态 |
| :--- | :--- |
| 产品设计规格 | ✅ [`docs/DESIGN.md`](docs/DESIGN.md) |
| 宿主能力映射 | ✅ [`docs/HOST_ALIGNMENT.md`](docs/HOST_ALIGNMENT.md) |
| 协作与红线准则 | ✅ [`AGENTS.md`](AGENTS.md) |
| 当前任务指针 | ✅ [`docs/ACTIVE_TASK.md`](docs/ACTIVE_TASK.md) |
| 生产代码 | ⬜ 待阶段 1 启动 |

---

## 它要解决什么

传统酒馆（SillyTavern）式 RP 有五个结构性硬伤，`dsh-rrp` 逐条根除：

| 酒馆劣根性 | `dsh-rrp` 的正统解法 |
| :--- | :--- |
| 上下文无脑堆砌 | 拥抱现代模型原生的 **Skills 按需调取** |
| 死板正则世界书 | 设定 Markdown Skill 化，语义自主检索 |
| 气泡翻页伪分支 + 幽灵状态 | 映射 DSH 原生 `Session.fork` + 会话投影重放 |
| 长线剧情流水账 | 独立 **Summarizer Agent** 定期提炼大局观（可关） |
| 模型替玩家代打 | Author Agent 权能硬隔离，严禁代打 |

---

## 架构一览

```text
DeepSeek Harness 宿主
├── 会话日志 / Agent 循环 / 后台任务 / 右侧栏 / 会话投影   ← 宿主负责
└── dsh-rrp 插件
     ├── Author Agent      执笔智体（纯正文、只读设定）
     ├── Chronicler Agent  纪事官（异步推演世界状态）
     ├── Summarizer Agent  大局编年（可选，定期摘要）
     ├── WorldState 投影   DSH 原生右侧栏状态看板
     └── Skills 知识体系   世界设定按需调取
```

核心理念：**领域只写纯数学，驱动权归宿主。**

---

## 设计哲学（四条铁律）

1. **个人玩具定位** —— 纯单机、单人部署；拒绝分布式锁、并发压测、多租户等企业级过度工程。
2. **100% 正统 DSH 插件** —— 绝不自建 HTTP 服务器、自建前端、自建数据库引擎；一切复用宿主能力。
3. **自然时序流，无锁矫正** —— AI 更新状态 → 玩家随手修正 → 下一轮直接消费最新值；废除 CAS 锁与永久保护盾。
4. **轻量透明** —— 每一行代码都直接服务于游玩体验，拒绝为「架构完整性」脑补基建。

---

## 文档索引

> 冷启动只读这四份，读完即停；详细宿主能力清单见 HOST_ALIGNMENT。

| 顺序 | 文档 | 作用 |
| ---: | :--- | :--- |
| 1 | [`AGENTS.md`](AGENTS.md) | 协作准则、红线、开工协议 |
| 2 | [`docs/DESIGN.md`](docs/DESIGN.md) | 唯一产品目标规格 |
| 3 | [`docs/HOST_ALIGNMENT.md`](docs/HOST_ALIGNMENT.md) | 宿主能力映射 + 反重复造轮子红线 |
| 4 | [`docs/ACTIVE_TASK.md`](docs/ACTIVE_TASK.md) | 当前唯一切片 |

参考资料层（回答「为什么」，防漂移）：[`docs/reference/README.md`](docs/reference/README.md)

其中**动设计前必读**两份：

- [`docs/reference/DECISIONS.md`](docs/reference/DECISIONS.md) —— 15 条关键决策与理由
- [`docs/reference/GLOSSARY.md`](docs/reference/GLOSSARY.md) —— 标准术语与禁用旧词

---

## 与旧项目的关系

本仓库是 **完全重启**，不复用旧实现的代码或格式：

- 旧仓 `D:\projects\dsh-custom-agent`（约 4.9 万行）仅作为**灵感与经验来源**，其中大量自建平台代码已被判定为「重复造轮子」，**不迁移**；
- 卡包格式、状态 Schema 等**重新制定**，不受旧格式约束；
- 不兼容传统酒馆卡生态；未来通过独立转换 Skill 做单向转译。

---

## 许可证

MIT
