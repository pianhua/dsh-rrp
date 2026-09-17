# 后续 AI 执行交接（2026-09-17）

> 本文是当前停点后的唯一执行队列。当前接手者只整理交接、不再写功能。下一位 AI 必须先读 [`HANDOFF.md`](HANDOFF.md) 第 4 节、[`DESIGN.md`](DESIGN.md)、[`HOST_ALIGNMENT.md`](HOST_ALIGNMENT.md) 与 [`reference/DECISIONS.md`](reference/DECISIONS.md)，再按本文顺序推进。

## 0. 当前停点

| 项 | 事实 |
| :--- | :--- |
| dsh-rrp HEAD | `1a44e4d`（docs: record the dsh-synapse RP adaptation），工作树干净 |
| dsh-rrp 验证 | `pnpm run typecheck` 0 错；`pnpm test` 21 文件 / 117 用例通过；`pnpm run build` 通过 |
| dsh-synapse-rp | `20fe751`，v0.4.1-rp.1，`node --test test/*.test.js` 68/68 通过 |
| 真机 | D5/D6/P4 **19/19**；Synapse RP 地图 **5/5**（均为 rp-dev:3099） |
| 服务边界 | 只用 `rp-dev:3099`，**绝不碰**日常 `web:3080` |

**不要 `reset` / `checkout` / 回退上述提交；只在其之上追加。**

已完成的切片（不要再当待办）：

- D5 动态世界状态（运行时自定义字段 + `createFields` + clamp）
- D6 自然时序窗口（UI gate，无锁）
- P3.2 Map 生命周期清理（`forgetActivity` / `forgetState`）
- P4 官方 `yaml` 解析器替换手写子集
- 写作质量：Author 铁律 6（反全知）+ `presets/rp/skills/` 三个按需技能
- 沉浸视图（`story-view.tsx`）整体移除
- `dsh-synapse-rp` RP 剧情地图（节点降噪 / 72 字摘要 / 剧情语义文案）

### 不可回退的宿主时序事实

展厅开局顺序为 `sessions.create({})` → `agentPresets.select(sessionId, "rp-<card>")` → `POST /dsh-rrp/start`。`Session.header.agentPreset` 只是创建事实，通常为空；当前 preset 的唯一真源是：

`ctx.sessionProjections.stateOf(session, 'agentPreset')`

- `start.ts` 必须以该投影验证卡与 preset 是同一张卡。
- `sediment-runtime.ts` 必须同时处理 `agent/created` 与 `agent-preset/selected`。
- 离开 RP preset 或 agent 销毁时必须卸载 provider；绝不能放进全局或 preset standing 层。

## 1. 剩余执行顺序

1. **移除两条客户端轮询（P3.1）** —— `world-state-tab.tsx`（活动账本）与 `sediment-tab.tsx`（草稿/典籍）。先查 DSH client Jobs / Session projection wire / UI seam；持久状态走宿主 projection 推送，临时 Scribe 草稿优先挂宿主 Jobs UI。删除 timer 后同步更新 `HOST_ALIGNMENT.md`、`HANDOFF.md`、`MANUAL_TEST.md`。**若无可用 client seam，保留现状并写明理由，不要自建轮询。**
2. **D5 端到端集成测试** —— 目前仅由真机覆盖；补一条 Chronicler 动态建字段的自动化链路。
3. **Synapse 加固（低风险）** —— 在 `normalizeState()`（`index.js:535`）与 `messagesFor()`（`app.js:410`）追加 `isRpInjectionText` 过滤，令旧缓存无需手动删除。见 [`reference/SYNAPSE_RP_VERIFICATION.md`](reference/SYNAPSE_RP_VERIFICATION.md) §二。
4. **P5 可选产品增量** —— 第二张官方测试卡；D8 草稿就地编辑；`conversation.composer` 输入区适配；多语言/文案/可访问性精修。
5. **Synapse 可选增强** —— 分支节点微状态标签（`diffWorldState()` 摘要 + `📍 / ❤️` 标签）；分叉时世界线命名引导。见 `SYNAPSE_RP_CHANGES.md` §六。

## 2. 运维注意（真机踩过）

- **删 `~/.dsh/synapse/workspaces.json` 必须配合重启 DSH**：运行中的 `WorkspaceStore` 会把内存旧状态写回磁盘，只删文件无效。
- 旧会话（2026-09-17 之前）世界状态面板为空是**正常**的：其结构化状态原本在已忽略的 `rrp/*` 事件里，正文照常可读。
- 日志里 `【世界状态 · 事实基准】` 等注入消息是 Author 的只读基线，**设计行为，不是泄露**；Synapse 已在写入侧过滤，不上画布。

## 3. 首轮清单

1. 只读确认 `git status --short`；读本文 + `HANDOFF.md` §4；不回退 `1a44e4d` 与其祖先。
2. 确认 3080（日常）/ 3099（开发）边界，绝不把开发插件挂进日常 profile。
3. 按 §1 顺序推进；每完成一个切片，同步 `ACTIVE_TASK.md`、`HANDOFF.md` 与必要的 `reference/` 决策文档。
4. 测试继续交由外部测试者执行；拿不出日志/产物证据就不要宣称「已完成」。

## 4. 仍然禁止

- 不自建 HTTP server / SPA / 数据库 / 向量库；不发明会话事件类型（状态寄生 `user/message.source`）。
- 不在 `agent.ctx` 用属性访问读服务（用 `ctx.get`）；生命周期监听器绝不让异常外溢。
- 注入上下文只追加、绝不 replace（前缀缓存是性能命脉）。
- 不引入企业级复杂度（锁 / 租约 / 多租户 / 并发压测）；不覆盖宿主主题与三栏骨架。
- 不给 synapse 提上游 PR（纯个人使用）。
