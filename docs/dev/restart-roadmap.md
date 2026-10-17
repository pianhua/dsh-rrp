# 重启开发路线图（restart-roadmap）

> 「接下来开发什么」的唯一入口。开工前从这里领票；条目完成后标 ✅ 并移入「已收口」。
> 维护规则：新发现的待办立即登记（问题一句话 + 证据指针 + 档位），完成的条目不删除只移位；
> 与 worklog 的关系——worklog 记过程，本文记去向。

## P0 — 阻塞生产的已知 bug

### R1. issue 06：开局预写回合 vs loop 冻结计数器（生产级，最高优先）

- **症状**：画廊开局（create → select → start → prompt）玩出的会话，热进程内一切正常；
  一旦冷读（宿主重启后侧边栏恢复 / 投影重放 / 任何持久层准入）即
  `SessionFormatError: turn/start does not open the expected turn` → 报 stored log corrupt。
  **日志本身一个字节没坏**，是宿主 v4 准入折叠器在拒。
- **根因（三层叠加，每层单独合法）**：
  1. 开局路由预写两个**闭合**回合（V4 受保护头要求首个 surface 事件是 system 头 + 开场白，
     且 system/assistant message 必须挂在 turn/step 支架内）→ turn 1、turn 2；
  2. 宿主 loop 回合计数器在 **preset 组合时**快照 `turnBoundary.lastTurn`——画廊顺序里 preset
     组合早于 start 追加，彼时计数器=0 → 首个玩家回合被编号 turn 1；
  3. 准入要求 `turn/start` 的 `data.turn === nextTurn` 严格连续——turn 1/2 闭合后
     nextTurn=3，又来了 `turn/start turn:1` → 拒读整个日志。
- **已实测的接缝封锁**：preset 不能挪到 start 之后选（`agentPresets.select` 在 lastTurn>0 抛
  `agent-preset/locked`）；`create({agentPreset})` 在 create 时急切组合。碰撞是结构性的，
  现有接缝内无解。
- **为什么现在才暴露**：热进程追加只做行级校验，不跑准入折叠器；冷读才跑。e2e 票据 04 的
  重启验收是第一条真实冷读路径。
- **候选修复**：A **懒开局**（start 不写回合；头/开场白/卡事实由首个 loop 回合 pre-step 钩子
  物化；V4 首面事件不变、turn 2 语义改变——**倾向**，但动 V4 语义与前缀形状，必须先规格 + ADR）；
  B 回合号让位（宿主计数器不可控，基本不通）；C 改宿主（vendor 越界）。
- **证据**：`.scratch/play-e2e/issues/06-turn-numbering-vs-loop-counter.md`（根因已内联本文，自足）。
- **验收**：`tests/e2e/playthrough.spec.ts` 重启相的宿主冷读断言回归 + 一条真实 UI 路径冷读。
- **档位**：`grill-with-docs → to-spec → to-tickets`（workflow §1）；跨 host/、runtime/、routes/。

## P1 — 移植与消费清单（对照 dsh-tavern 的收敛项）

### R2. Playwright 真实玩局 E2E（移植清单 P0 #4）

- **现状**：`tests/e2e/` 已有隔离宿主现场 + 桩驱动完整玩局（含负向对照、重启数据面），
  但不驱动真实浏览器。参照 tavern 的 `tests/e2e/gameplay.mjs` 形态。
- **注意**：真浏览器玩局必然走「开局 → 重启 → 恢复」路径，**会立刻撞上 R1 的冷读 bug**——
  建议排在 R1 之后，或作为 R1 的验收载体。
- **证据**：`docs/reference/TAVERN_DETAIL_COMPARISON.md` P0 表 #4；`tests/README.md`。
  该对照文档是 R2/R3 的未结证据基——**R2/R3 收口后按 reference/README 的死研规则一并移除**。
- **档位**：新子系统，spec + tickets。

### R3. 上下文与缓存四项（移植清单 P1 #5–#8）

| # | 项 | 落点 | 状态与注意 |
| :--- | :--- | :--- | :--- |
| 5 | 稳定前缀快照 + 版本迁移 | `src/publish/state-publisher.ts` 或新 snapshot 模块 | 未动；worklog 2026-10-16 待决 1 已裁决：**维持现状**（追加+买断），systemPrompt.section 路线须真机测量前缀缓存影响后再评估，无测量不改生产 |
| 6 | 卡系统提示变更检测 | 卡包注入层 | ✅ **已关闭（2026-10-17 裁决）**：同值不追加（指纹去重）+ 状态侧已覆盖生产路径，无剩余工作面 |
| 7 | 当轮生效注入（旧轮快照不累积） | `src/lore/lore-application.ts` | 未动；上下文长度有界的关键，转正时术语随实现登记 GLOSSARY |
| 8 | 种子对话轨迹 | `presets/rp/` 或 author 初始化 | ❌ **裁决不做（2026-10-17）**：与 D21 正面冲突（伪造宿主呈现面），重开须先改 D21 |

- **证据**：`docs/reference/TAVERN_DETAIL_COMPARISON.md` P1 表；`docs/dev/worklog/2026-10.md` 首条待决。
- **档位**：每项独立走 `grill-with-docs → to-spec`；可并行。

### R4. B2：让生产真正消费 AgentPromptContract 五对象（用户已裁决）

- **现状**：`src/agents/contract.ts` 的五对象工程结构生产零调用，只被
  `tests/unit/agents-contract.spec.ts` 消费；横跨 5 模块，先出规格再实现。
- **证据**：worklog 2026-10-16「向 dsh-tavern 靠齐」条待决；ADR 0018。
- **档位**：`grill-with-docs → to-spec → to-tickets`。

### R5. B3：门禁扫源码（工程纪律加固，可拆小票）

- hygiene 目前不碰 `src/`；41 处 `as unknown as` + 12 处 `as never`；
  18 个 `src/client/**` 文件零测试引用；CI 不跑 `docs:build`；版本卡 0.1.0 无发布证据。
- **证据**：worklog 2026-10-16 同条待决。
- **档位**：单项各自 direct/implement 档。

## P2 — 工程余项

- **R6. 宿主升级阻塞两项**：失败回合会把会话写成 0.2.0 校验器无法加载的格式；Windows netstat
  端口归属丢失。升级宿主前必修。证据：`docs/reference/HOST_BASELINE.md` 未升级发现节。
- **R7. worklog 轮转**：10 月剩余条目继续记 `docs/dev/worklog.md`，次月归仓时并入
  `docs/dev/worklog/2026-10.md`。
- **R8. 真实游玩闭环**：需模型密钥（设置 → 模型写入 `DEEPSEEK_API_KEY`）。

## 已收口

- ✅ 2026-10-17 · **R1 = issue 06 修复（懒开局，ADR 0028）**：start 零写入、事实经
  agent/pre-step 决策注入、开场白微任务落 step 1；验收门 = 宿主 v3-to-v4 严格关系断言
  + readSession 冷读 200 + 数据面重启一致 + 负向对照。reopen 条件：宿主 loop 计数器改现读。
- ✅ 2026-10-17 · **ADR 首次全面内容复审**：27 篇全部 reaffirm、0 退役（逐条裁决见
  `.scratch/decision-audit/spec.md`）；P1 #6 关闭、#8 裁决不做；过期调研/一次性计划 4 份清除。
- ✅ 2026-10-17 · repo-restructure 票据 00–07：src 分层归位（routes/ runtime/ host/ publish/
  四域 ui-contract/）、空 skills/ 移除、scripts/maintenance/ 归档、worklog 月中轮转、
  文档引用对齐、本路线图。证据：`docs/dev/architecture.md` 模块地图与磁盘一一对应；
  质量门 548 用例前后不变。
