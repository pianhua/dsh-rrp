# 交接文档（HANDOFF.md）

> 面向下一位接手的开发者（人类或 AI）。读完本文件 + [`ACTIVE_TASK.md`](ACTIVE_TASK.md) + [`reference/DECISIONS.md`](reference/DECISIONS.md) 即可接手。
> 本文件只讲「现状与怎么继续」，不替代契约层（[`DESIGN.md`](DESIGN.md) / [`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) / [`../AGENTS.md`](../AGENTS.md)）。

---

## 0. 一分钟概览

- **项目**：`dsh-rrp`（DSH-Chronicle）—— DeepSeek Harness 的**正统薄插件**，个人单机沉浸式角色扮演 / 交互小说引擎。
- **形态**：一个 npm 包（host half + client half）+ 一个 profile bundle。宿主负责会话日志 / Agent 循环 / 会话投影 / 右侧栏 / 后台任务；插件只做 RP 领域层。
- **规模**：43 次提交；`src/` 约 35 个文件；21 个测试文件 / **91 用例**全绿。
- **进度**：阶段 0–9 + 阶段 6 全部完成。最近三轮：**会话可读性修复 → 多卡技能作用域 → D8 知识沉淀**。
- **最重要的三条经验**：① 会话事件类型封闭，状态要寄生在 `user/message` 的 `source`；② 技能作用域靠 preset / agent 分层；③ 注入上下文只追加、绝不 replace（前缀缓存）。详见 §4。

---

## 1. 五分钟上手

### 环境基线（实测）

| 项 | 值 |
| :--- | :--- |
| Node | v24.16.0 |
| pnpm | 10.14.0 |
| DSH CLI | 0.1.5-rc.1（宿主包 0.1.5-rc.2，嵌在全局 dsh 安装内） |
| 构建 | tsdown 0.23.0 + TypeScript 5.9 |

### 最小循环

~~~bash
pnpm install
pnpm run typecheck                              # 类型检查（含 tests）
pnpm test                                       # 91 用例
pnpm run build                                  # lib/index.js + lib/client.js + lib/types
dsh --profile rp-dev --port 3099 --no-open      # 真实宿主验证（独立于日常 web）
~~~

首次连接开发 profile：`pnpm run link:dev`（NTFS junction，跨盘可用；脚本见 `scripts/link-dev.mjs`）。
URL 用启动日志末尾打印的 `http://127.0.0.1:3099/?token=…`。

### 启动日志应包含（健康检查）

~~~text
[dsh-rrp] RP preset refreshed at <dshHome>\.agent-presets\rp
[dsh-rrp] WorldState projection registered (key rrpWorldState)
[dsh-rrp] macro-summary projection registered (key rrpSummary)
[dsh-rrp] active-card projection registered (key rrpCard)
[dsh-rrp] Chronicler armed for preset rp
[dsh-rrp] sediment runtime armed (per-session scoping via agent.ctx)
[dsh-rrp] Summarizer armed for preset rp every 8 turns
[dsh-rrp] player correction route armed at /dsh-rrp/world-state
[dsh-rrp] card routes armed at /dsh-rrp/cards and /dsh-rrp/cards/one
[dsh-rrp] activity route armed at /dsh-rrp/activity
[dsh-rrp] /lore command armed
[dsh-rrp] sediment route armed at /dsh-rrp/sediment
[dsh-rrp] card start route armed at /dsh-rrp/start
[dsh-rrp] RP skills visible (0): (none)
[dsh-rrp] card preset rp-maid-heiress skills (6): maid-apartment, …, maid-world-setting
~~~

> 两个 profile：日常 `web`（3080，**不要碰**）与开发 `rp-dev`（3099）。两者共享 `~/.dsh/settings.yaml`（模型、上下文窗口）。

---

## 2. 架构地图

~~~text
DSH 宿主（会话日志 / Agent 循环 / 会话投影 / 右侧栏 / 后台任务 / webserver / Skills 注册表）
        ↑ 只通过这些官方接缝交互
dsh-rrp 插件
├── host half（src/index.ts 入口）
│   ├── RP 模式物化      preset.ts + preset-id.ts + cards.ts
│   ├── 会话投影          projection/{world-state,summary,card}.ts  （纯折叠）
│   ├── 状态发布          state-payload.ts + state-publisher.ts    （user/message 的 source）
│   ├── 纪事官 / 编年官   chronicler.ts / summarizer.ts + agents/*
│   ├── 知识沉淀 D8       sediment*.ts + agents/scribe.ts
│   ├── 玩家矫正路由      correction.ts
│   ├── 卡包 / 开卡路由   cards-route.ts / start.ts
│   └── 活动账本          activity.ts + activity-route.ts（宿主内存）
├── client half（src/client/index.ts 入口，React 18 + 宿主原子库）
│   ├── 世界状态 tab      world-state-tab.tsx
│   ├── 典籍 tab          sediment-tab.tsx
│   ├── 卡片展厅 / 开卡    gallery-panel.tsx
│   └── 沉浸视图          story-view.tsx
└── 随包分发：presets/rp（基础 RP 模式）、cards/*（官方卡包）
~~~

### 一次游玩的完整数据流

~~~text
卡片展厅 → sessions.create → agentPresets.select(rp-<card>) → POST /dsh-rrp/start
   → 发布卡包设定 + 初始状态（user/message.source.rrp）→ 追加开场白（assistant/message，最后一个）→ sessions.open
玩家输入行动 → Author（persona + 注入的卡包/状态/编年）写正文
   → turn/end(completed)
   → 纪事官后台任务：读上一份 WorldState + 本轮正文 → 推演新状态 → publishState 追加 facts 消息
   → 每 8 轮：编年官推演四维大局观 → publishState 追加（含 summary）
玩家可随时在「世界状态」就地矫正 → POST /dsh-rrp/world-state → publishState
玩家可用 /lore 或「典籍」按钮 → Scribe 起草一条技能 → 确认后写入本会话沉淀目录 → 下一轮按需检索
~~~

---

## 3. 模块清单（src/）

| 文件 | 职责 |
| :--- | :--- |
| `index.ts` | host 入口：物化 preset、注册投影 / 纪事官 / 各路由 / 沉淀运行时；启动自检并打印技能表 |
| `preset.ts` | 物化基础 `rp` + 每张卡一个 `rp-<card-id>` preset；归属标记与卸载清理 |
| `preset-id.ts` | 依赖为零：`rp-<card-id>` 规则、`matchesPreset` 家族匹配（host/client 共用） |
| `cards.ts` | 卡包目录解析（frontmatter / 开场白 / 初始状态 / 技能），`mountSkillsForCard` |
| `card-types.ts` | 卡包词汇（CardMeta/CardPack/CardContext）+ `renderCardContext`，依赖为零 |
| `world-state.ts` | WorldState 词汇、上限 `pruneWorldState`、确定性 `renderWorldState`（stableJson） |
| `macro-summary.ts` | 四维大局观词汇 + `renderMacroSummary` |
| `state-payload.ts` | **状态载体**：结构面 `RrpStatePayload`、`rrpPayloadOf`、`rrpStateMessage` |
| `state-publisher.ts` | 卡包 / 事实两条追加式发布通道（内容去重），写入 `user/message` |
| `projection/world-state.ts` `projection/summary.ts` `projection/card.ts` | 三个会话投影单元（zod 校验 + 纯折叠 + Object.is 闸门） |
| `chronicler.ts` | `turn/end` 触发纪事官后台推演；`transcriptOf` / `latestTurnTranscriptOf` |
| `summarizer.ts` | 每 8 轮触发编年官；`/summary on|off` 开关 |
| `agents/chronicler.ts` `agents/summarizer.ts` | 两个智体的系统提示词、prompt 组装、回复解析 |
| `agents/scribe.ts` | D8 典籍编纂者：只起草**一条**有据可依的技能，材料不足返回空 |
| `activity.ts` | 活动账本类型 + 宿主内存账本（`recordActivity` / `readActivity`） |
| `activity-route.ts` | `GET /dsh-rrp/activity`：面板轮询的归因账本 |
| `sediment.ts` | D8 按会话存储：只新增、四重上限、原子写 |
| `sediment-provider.ts` | 只读单个会话沉淀目录的 skill provider |
| `sediment-runtime.ts` | `agent/created` 时经 `agent.ctx.get(skills).registerProvider` 按会话武装 |
| `sediment-route.ts` | `GET/POST/DELETE /dsh-rrp/sediment` + `/lore` 命令；草稿暂存、确认才写 |
| `correction.ts` | 玩家矫正写路径 `POST /dsh-rrp/world-state` |
| `cards-route.ts` | 只读卡包路由 |
| `start.ts` | 开卡：发布初始状态 + **最后**追加开场白 |
| `home.ts` | `harnessHome()` 叶子模块（打破 preset ↔ cards 循环） |
| `contracts.ts` | 对外稳定只读契约（投影键、渲染函数、`rrpPayloadOf`），依赖为零 |
| `client/index.ts` | client 入口：locale 字典 + 注册主题外的一切 UI |
| `client/primitives.d.ts` | 宿主原子库 `dsh-client-ui-primitives` 的结构面类型（构建期外部依赖） |
| `client/context-types.ts` | 客户端服务结构面（slots / locale / sessions / remote / layout / uiConversation） |
| `client/world-state-tab.tsx` | 世界状态：结构化就地编辑 + 活动账本（轮询） |
| `client/sediment-tab.tsx` | 典籍：起草 / 审阅 / 确认丢弃 / 列表删除 |
| `client/gallery-panel.tsx` | 卡片展厅 + 开卡流（搜索 / 封面 / 技能 / 开场白 / 主操作条） |
| `client/story-view.tsx` | 「沉浸」视图（纯增量，不改宿主渲染） |
| `scripts/inspect-context.mjs` | 解码会话日志、折叠 surface、统计上下文重复与缓存命中 |
| `scripts/repair-legacy-sessions.mjs` | 修复旧 `rrp/*` 事件日志（补 `ignorable`，保留多帧 zstd） |
| `scripts/link-dev.mjs` | 把本仓库 junction 进 `rp-dev` profile |
---

## 4. 宿主硬约束（全是踩过的坑，**动手前必读**）

### 4.1 会话事件词表是封闭的 —— 绝不发明事件类型

`Session.append` 一个宿主不认识的事件类型，会让**整个会话日志之后都无法读取**（前端红字 `历史加载失败 … unknown to this harness and not marked ignorable`），而且宿主**没有**任何公开 API 能设置信封上的 `ignorable`。

→ 我们的状态一律寄存在**已知的** `user/message` 事件的 `source.rrp`（模型只读 `content`，`source` 不进请求）；三个投影折叠 `user/message`。实现见 `src/state-payload.ts` + `src/state-publisher.ts`，完整证据链见 [`reference/HOST_SEAMS.md`](reference/HOST_SEAMS.md) §A5。

### 4.2 技能作用域分两层：preset（共享）与 agent（每会话）

```text
读取链：  agent 层（本会话）  →  preset standing 层（本卡所有会话共享）  →  全局层
```

- 卡包**自带**的世界知识 → 预设的 **standing** 层：每张卡一个 `rp-<card-id>` preset，`bundledSkillDir` 指向该 preset 自己的 `skills/`（不这么做就会跨卡串味）。
- **D8 沉淀** → **agent** 层：经 `agent.ctx` 注册 provider，只对该会话可见（所有者明确要求按会话隔离）。

### 4.3 `agent.ctx.<service>` 会抛错，必须用 `agent.ctx.get(name)`

真实 Cordis 的 Context 是 Proxy；属性读取要求声明过 inject，否则抛 `cannot get property "skills" without inject`。而 `agent/created` 监听器是在 `sessions.create` 的同步链里跑的 —— 这个异常直接把「开始这一局」打挂（曾经的全绿测试没拦住，因为测试里 `agent.ctx` 是普通对象）。

正确写法（`src/sediment-runtime.ts`）：

~~~ts
const skills = agent.ctx.get("skills")   // 免 inject；且返回的服务 trace 到 agent.ctx，作用域不丢
~~~

两条纪律：**① 只用 `ctx.get` 读陌生 context 的服务；② agent 生命周期监听器整体 try/catch，绝不允许异常外溢。**

### 4.4 上下文注入只追加、绝不 replace

provider 缓存是**前缀缓存**。replace 会把消息搬到队尾、破坏「上一轮请求是下一轮前缀」，实测命中率 90%→27%、`cacheRead` 卡死。`state-publisher.ts` 因此只 `surfaceOp: "append"` + 内容去重（卡包只注入一次，事实只在变化时追加）；旧副本被缓存，交给宿主 compaction。

### 4.5 不覆盖宿主主题

曾实现过暖纸 + 衬线主题，所有者否决 → `src/client/theme.ts` 已删除。面板观感靠**宿主原子库**（`@deepseek-ai/dsh-client-ui-primitives`，平台模块）+ `--dsw-alias-*` token，自动跟随亮暗。

### 4.6 会话日志的物理格式

`session.v3.jsonl.zstd` 是**多帧** zstd 拼接，且**第一帧必须恰好是一行 header**。任何重写日志的工具都要保留这个结构（见 `scripts/repair-legacy-sessions.mjs` 与 HOST_SEAMS §A5）。

---

## 5. 开发工作流

### 契约（AGENTS.md 已写死，这里强调执行）

1. 改行为 → 同步改文档（`ACTIVE_TASK.md` 至少更新；设计取舍进 `reference/`）。
2. 每次提交前跑 `pnpm run typecheck && pnpm test && pnpm run build`。
3. 所有注册返回 disposer、随 fiber 释放（HMR 干净）。
4. 不新增宿主已有能力（HOST_ALIGNMENT 第 4 节红线）。
5. 真机验证优先于自述；拿不出日志/产物证据就不要宣称「已完成」。

### 常见改动怎么做

| 想做什么 | 落点 |
| :--- | :--- |
| 加一张卡 | 在 `cards/<id>/` 放 `card.md` + `openings/` + 可选 `state.json` / `skills/`；启动时自动物化 `rp-<id>` preset（格式见 `reference/CARDS.md`） |
| 加一条世界知识 | 放进 `cards/<id>/skills/<skill>/SKILL.md`（渐进披露，不塞上下文） |
| 加一个 UI 面板 | `src/client/*.tsx` + 在 `client/index.ts` 注册；用宿主原子库，token 取色 |
| 加一条 host 路由 | 参照 `src/cards-route.ts` 的 `webServer.register({ kind: "exact", path, handler })` |
| 加一个后台智体 | 参照 `src/summarizer.ts`：`ctx.jobs.start` + `ctx.llm.stream` + 解析 + `publishState`/`recordActivity` |
| 改状态结构 | 改 `world-state.ts` + `projection/world-state.ts`（zod）+ 同步 `state-publisher` 渲染与契约 |

### 关于测试替身

单测用**结构化替身**（普通对象）模拟宿主服务。它跑得快，但**覆盖不到 Cordis 代理行为**（§4.3 就是这么漏的）。凡是涉及宿主 context / 生命周期 / 权限的改动，必须真机跑一遍。

---

## 6. 验证与证据工具箱

| 工具 / 文档 | 用途 |
| :--- | :--- |
| `pnpm test`（21 文件 / 91 用例） | 纯逻辑与契约回归；HMR 挂载/卸载无残留 |
| [`reference/MANUAL_TEST.md`](reference/MANUAL_TEST.md) | 实机验收清单；§8 UI 精修、§9 D8 沉淀 |
| [`reference/LONG_PLAY_TEST.md`](reference/LONG_PLAY_TEST.md) | 15 轮长线清单与历史结果 |
| `node scripts/inspect-context.mjs --latest` | 解码日志、折叠 surface、统计上下文重复与缓存命中 |
| `node scripts/repair-legacy-sessions.mjs [--apply]` | 修旧日志（默认 dry-run，写前留 `.pre-ignorable.bak`） |
| 服务端启动日志 | 最可靠的「已装配」证据（见 §1） |
| 已构建 bundle 标记 | `grep` `lib/client.js` 中的面板/路由字符串，确认产物是最新的 |
| 浏览器（Chrome DevTools MCP 等） | 面板渲染、交互、真实模型链路 —— 这一层必须人工/Agent 实测 |

**端口边界**：日常 `web` = 3080（**不要动**）；开发 `rp-dev` = 3099。

---

## 7. 已知限制与待办

### 刻意不做（不是遗漏）

- **P1 正文节点 shadow**：替换宿主正文渲染，风险高、收益低；改走纯增量的「沉浸」视图。
- **活动账本持久化**：它只在宿主内存，重启清空 —— 它是玩家可见、模型不可见的簿记，不应进会话日志。
- **沉淀草稿在线编辑**：当前只支持「确认 / 丢弃」；编辑可后续加（草稿已在内存，改字段即可）。

### 明确的待办

| 优先级 | 事项 | 说明 |
| :--- | :--- | :--- |
| 中 | **第二张官方测试卡** | 目前只有 `maid-heiress`，多卡作用域需要第二张卡才能肉眼验证 |
| 中 | **P4 输入区接管** | `conversation.composer`（chain）：行动 / 对白 / 继续 / 导演指令，解决「像 coding agent」的输入体验 |
| 低 | `/summary` 开关持久化 | 现为进程内状态，可挂 `ctx.settings` |
| 低 | 沉淀的 Scribe 草稿可编辑 | 面板加可编辑字段 |
| 低 | 多语言 / 文案打磨 | locale 字典已分 ZH/EN |

### 已知的「正常异常」

- **旧会话（2026-09-17 之前）的世界状态面板为空**：它们的结构化状态原本存在 `rrp/*` 事件里，而这些事件现已按 `ignorable` 忽略；正文与历史照常可读。
- **日志里的 `【世界状态 · 事实基准】` 等注入消息**：这是设计行为（Author 的只读基线），不是泄露。

---

## 8. 交接清单（建议第一周按顺序做）

- [ ] 跑通 §1 的最小循环，对照健康日志逐行确认。
- [ ] 读 `DESIGN.md` → `HOST_ALIGNMENT.md` → `reference/DECISIONS.md` → `ACTIVE_TASK.md`。
- [ ] 按 `reference/MANUAL_TEST.md` 走一遍 §8（UI）与 §9（D8 沉淀），包括**跨会话隔离**。
- [ ] 亲自制造一次「会话事件不可读」的实验（在临时 profile 里往日志塞一个未知事件），体会 §4.1 —— 从此不会再想自造事件。
- [ ] 确认 3080（日常）与 3099（开发）边界，绝不把开发插件挂进日常 profile。
- [ ] 从 §7 挑一件待办开始（推荐：第二张官方卡，或 P4 输入区）。

---

## 9. 绝不做（红线浓缩版）

1. 不自建 HTTP server / SPA / 数据库引擎 / 向量库（宿主已有，见 HOST_ALIGNMENT 第 4 节）。
2. 不发明会话事件类型（§4.1）。
3. 不覆盖宿主主题与三栏骨架；面板观感用宿主原子库与 token。
4. 不在 `agent.ctx` 上用属性访问读服务；不让生命周期监听器抛异常（§4.3）。
5. 不引入企业级复杂度：分布式锁、租约、多租户、并发压测（个人玩具定位）。
6. 不替玩家代打、不写元叙述、不剧透（Author 人设已锁，改动需谨慎）。

---

## 10. 关键路径速查

| 想找 | 去哪 |
| :--- | :--- |
| 为什么这么设计 | [`reference/DECISIONS.md`](reference/DECISIONS.md)（15 条） |
| 宿主到底能插到什么程度 | [`reference/HOST_SEAMS.md`](reference/HOST_SEAMS.md) · [`reference/UI_CEILING.md`](reference/UI_CEILING.md) |
| 卡包格式 | [`reference/CARDS.md`](reference/CARDS.md) |
| Skills 与 D8 沉淀 | [`reference/SKILLS.md`](reference/SKILLS.md) §4.3 |
| fork / 世界线 | [`reference/WORLDLINES.md`](reference/WORLDLINES.md) |
| 记忆边界 | [`reference/MEMORY.md`](reference/MEMORY.md) · `dsh-rrp/contracts` |
| 术语表 | [`reference/GLOSSARY.md`](reference/GLOSSARY.md) |
| 旧项目教训 | [`reference/LESSONS.md`](reference/LESSONS.md) |

---

*最后更新：2026-09-17 · 对应提交 `2054cc3`（D8 沉淀 + 注入修复）。*
