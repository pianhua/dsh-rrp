# 已完成工作归档（COMPLETED_WORK.md）

> **定位**：所有「已完成、不再是待办」的切片与已修复问题的单一归档处。
> 交接类活文档（原 `ACTIVE_TASK.md` / `HANDOFF.md` / `NEXT_AI_HANDOFF.md`）已删除；现状基线直接看 `git log` 与 `pnpm test` 当前输出，历史归档只增不删（纠错除外）。

**归档基线**：HEAD `3315349`（2026-09-18）；`pnpm run typecheck` 0 错；`pnpm test` 22 文件 / 128 用例全绿；`pnpm run build` 通过。

---

## 1. 核心功能切片（全部兑现）

| 切片 | 内容 |
|:---|:---|
| D5 动态世界状态 | 数据模型（`DynamicFieldValue` + clamp）+ Chronicler `createFields` + UI 增删改查 |
| D6 自然时序窗口 | UI gate 无锁；推演中禁存、完成后自动重载 |
| D8 知识沉淀 | Scribe 起草 → 玩家确认 → Session 投影 → agent 层 Skill provider；旧 sidecar 只读迁移 |
| P3.2 生命周期清理 | `forgetActivity` / `forgetState`（后由 P0-4 统一收口） |
| P4 YAML 解析器 | 官方 `yaml` 包替换手写子集解析 |
| 写作质量 | Author 铁律 6（反全知）+ `presets/rp/skills/` 三个按需技能（writing-craft / anti-cliche / narrative-boundaries） |
| 沉浸视图 | `story-view.tsx` 整体移除，正文用宿主原生渲染 |
| 卡包/存档/世界线隔离 | 每卡 `rp-<id>` preset；状态寄生 `user/message.source.rrp`；fork 纯折叠重放（`815c883`） |
| dsh-synapse-rp 剧情地图 | v0.4.1-rp.1：节点降噪、72 字卡片摘要、剧情语义文案；实机 5/5（[SYNAPSE_RP_VERIFICATION.md](SYNAPSE_RP_VERIFICATION.md)） |

## 2. 2026-09-18 稳健性审计修复（P0-1 ~ P1-8，均带回归测试）

| # | 修复 | 提交 |
|:---:|:---|:---:|
| P0-1 | 纪事官推演期间禁用面板输入/增删/保存，防草稿覆盖 | `3403757` |
| P0-2 | 裸标量动态字段预包装为 `DynamicFieldValue` 再过 Zod；`createFields` 命中既有字段时更新 min/max 并 clamp | `1e7956d` |
| P0-3 | 推演期间玩家已矫正 → 丢弃过期推演（Last-Write-Wins），账本记 `phase: 'stale'` | `8863c20` |
| P0-4 | `session/disposed` / `agent/disposed` → `cleanupSession` 统一释放 RETAINED / 账本 / 沉淀草稿 / 摘要水位 | `8200a97` |
| P1-5 | 字段语法规则内联进纪事官提示词；`chronicler-field-syntax` Skill 从 Author preset 撤下，存档为 [chronicler-field-syntax.md](chronicler-field-syntax.md) | `b8ee71c` |
| P1-6 | 世界状态无实质变化时短路跳过发布（省 token、护前缀缓存） | `0551976` |
| P1-7 | `transcriptOf` 默认上限 8000→16000 并支持自定义；纪事官单轮 transcript 仍 8000 | `067cf00` |
| P1-8 | 玩家矫正发布前补 `pruneWorldState`（上限裁剪 + clamp），与纪事官路径对齐 | `6f7024c` |

## 3. 已修复的历史问题

| 问题 | 修复 |
|:---|:---|
| Scribe job 缺 `cancel` 回调（`jobs-local` 报 `reading 'bind'`） | `sediment-route.ts` 补齐 `cancel` |
| 世界状态面板 i18n 裸 Key（`section.coreState` 等） | 字典已补 zh/en |
| 命令文本（如 `/summary off`）被当普通消息发出 | 人设加输入过滤；留档 [COMMAND_SANITIZATION_ISSUE.md](COMMAND_SANITIZATION_ISSUE.md) |
| 设置页高亮全局 `rp` 造成「会话预设没生效」误判 | 面板加只读会话预设标签 `preset.hint`（诊断：[PRESET_DIAGNOSIS_TEST.md](PRESET_DIAGNOSIS_TEST.md)） |
| 纪事官推演覆盖玩家未保存草稿 / 竞态写状态 | P0-1 + P0-3 |
| 裸标量动态字段触发 Zod 失败、整轮推演作废 | P0-2 |
| 进程内缓存不随会话销毁释放 | P0-4 |

## 4. 2026-09-18 大审查修复（GitHub issue #1-#7 + 五维审查，均带回归测试）

### 4.1 GitHub issues

| # | 修复 |
|:---:|:---|
| #1 | Scribe job `cancel` 空实现 → `AbortController` + `signal` 真中断（对齐 Chronicler 范式），取消记 `killed` |
| #2 | Scribe prompt 注入卡包设定基准（`renderCardContext`：worldCore + persona + 玩家角色） |
| #3 | world-state-tab slot `inject` 签名与 sediment-tab 统一（传 `sessionId`） |
| #4 | 斜杠守卫改白名单：只拦 `/lore`、`/summary`，`/me` 等 RP 输入不再误判 |
| #5 | world-state-tab 硬编码中文全部进 locale（新增 14 个 `dynamicFields.*` 词条，ZH/EN） |
| #6 | 动态字段添加表单重名守卫（`existingIds`，杜绝 React key 冲突与静默覆盖） |
| #7 | 新增 `tests/dynamic-fields.spec.ts`：创建/更新(clamp)/删除/玩家矫正全链路 e2e |

### 4.2 五维审查（bug / 造轮子 / UI / 薄插件 / 通用性）

| # | 修复 |
|:---:|:---|
| R1 | 五处投影注册回收 disposer（`index.ts`，HMR 干净释放） |
| R2 | chronicler / summarizer / sediment-runtime 三个监听器整体 try/catch（对齐自建红线） |
| R3 | `parseFrontmatter` 把非对象 YAML 结果归一为 `{}`——一个空 SKILL.md 不再让整张卡消失 |
| R4 | 开卡流失败尽力回收孤儿会话（探测 `dispose`/`remove`），回收不了则报错附会话 id |
| R5 | Summarizer 水位线在调度成功后写入，瞬态失败不再永久跳过该轮摘要 |
| R6 | 账本固定短语改 `detailKey` 结构化走客户端 locale（`phase.started` 等 9 词条），消除宿主侧中文旁路 |
| R7 | peerDependencies 补 `dsh-api-remotes` / `dsh-api-session-controller` / `dsh-client-ui-layout`（optional） |
| R8 | 纪事官提示词去题材化（移除 maid-heiress「米娅」示例，全仓 grep 已零特化内容残留） |
| R9 | `ensureCardPreset`：卡列表路由按需物化缺失的 `rp-<id>` preset——新卡免插件重载即可开局 |

### 4.3 中优先级清账（2026-09-18 第二轮）

| # | 修复 |
|:---:|:---|
| R10 | **纪事官并发守卫**：每会话在飞标记 + 补跑队列——快速连轮时后到的轮次不再与在飞任务竞写（stale 检查看不见同态竞态），defer 后由 covering rerun 用「自上次状态写入以来」的 transcript 补折，任何一轮的变化都不丢。`cleanupSession` 同步清理标记 |
| R11 | **两条 2s 轮询收敛为推送优先**：调研确认宿主官方 seam——典籍列表走 `useProjection('rrpSediment')`（投影 wire 推送）、两个面板的「在飞」状态走 `useSessions` 的 `jobsBySession`（宿主 jobs 帧推送）、 settle 后一次性 GET 收尾；宿主不注入该座位时 2s 轮询保留为显式 fallback。Scribe job 补挂 owner 使其进入会话级 jobs 推送。HOST_ALIGNMENT「后台状态 UI」行由 ⚠️ 转为 ✅ |
| R12 | **DESIGN 2.1 裁决撤回**：正文渲染完全交给宿主原生，不做对话区样式注入（与「不覆盖宿主主题」同理由）；DESIGN.md 修订、AGENTS.md 目录树删除不存在的 `story-view.tsx`、失效 HANDOFF 引用改指 `reference/HOST_SEAMS.md` |

### 4.4 低优先级清账（2026-09-18 第三轮）

| # | 修复 |
|:---:|:---|
| R13 | 动态字段类型推断防呆：`Boolean('false')` 不再被转为 `true`；空字符串不再被 `Number('')` 静默变成 0 |
| R14 | transcript 渲染排除无 rrp 标记的 plugin notice（开场白降级 notice 不再被纪事官/编年官/典籍官当【玩家】发言） |
| R15 | 玩家矫正写路径加 preset 归属校验（非 RP 会话 403；sediment 路由 handler 整体 try/catch + URL 解析防护） |
| R16 | `capFlagValue` 省略号计入 160 上限；`diffWorldState` 补动态字段 min/max 约束变化比对（不再被 P1-6 短路静默吞掉） |
| R17 | **`/summary every N`**：编年周期并入 `rrpSettings`（默认 8，范围 1–50，越界钳制；旧设置事件经 zod `catch` 迁移） |
| R18 | 前端小修：典籍 KB 显示 <1KB 不再虚报；展厅刷新保留当前选卡 + select 竞态 latest-wins 守卫；workspaces 探测延迟到 slot 声明时；inject 口径注释统一；纪事官完成重载不再清掉玩家未保存草稿（保留并提示） |
| R19 | 工程：`inspect-context.mjs` 预期口径更新为 append-only；`repair-legacy-sessions.mjs` 标注一次性工具 |
| R20 | 通用性：DESIGN 2.3 修订（宿主无顶栏 slot，入口落左栏为宿主约束）；卡包支持 `{{player.name}}`/`{{player.description}}` 插值（worldCore/persona/开场白，示例 `cards/yanmen-inn`）；**第二张官方卡「雪夜雁门客栈」**（武侠悬疑，3 skills，验证多卡隔离） |
| — | 记录不修（有理由）：`DisclosureRow` 替换需真机确认运行时导出；`key={index}` 现状自洽；`harnessHome()` 镜像宿主默认路径；gallery `getSnapshot` 缓存风险待宿主行为确认 |

## 5. 质量验收快照

- 单测：146/146（23 文件）；类型：0 错；构建：通过
- 依赖：7 个 `dsh-*` peer 全部对齐基线 `^0.1.6-alpha.2`（dev 实装同版）
- 真机：**2026-09-18 Chrome E2E 全量 T1–T13 PASS**（报告与 12 张截图归档 `dsh-rrp-test-report/`；86% 前缀缓存、零代打、无锁流/纪事官/编年/典籍/分支全闭环；T10 宿主无内置插件卸载入口，按规范记录 SKIPPED）。R1–R20 交互改动经此轮真机复验清零。
- 报告存档：[CHROME_TEST_PLAN.md](CHROME_TEST_PLAN.md)（本轮用例表）· [TEST_REPORT.md](TEST_REPORT.md) · [TEST_PLAN.md](TEST_PLAN.md) · [ACCEPTANCE_CHECKLIST.md](ACCEPTANCE_CHECKLIST.md) · [COMPLETION_ASSESSMENT.md](COMPLETION_ASSESSMENT.md) · [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)

## 6. 2026-09-18 Chrome E2E 缺陷修复（报告 DEF-01/DEF-02）

| # | 修复 |
| :--- | :--- |
| DEF-01 (P1) | **展厅开卡跳转**：宿主 `ISessions` 无 `open()`（导航权属 view owner），`sessions.open(sessionId)` 抛 `TypeError`。改经 `uiWorkspace.openSession(sessionId)`（宿主 0.1.6 合法导航 API，惰性 `ctx.get` 探测 + `typeof` 防御）；`RrpSessionsService` 删除虚构的 `open` 成员 |
| DEF-02 (P2) | **典籍路由补 403 守卫**：`/dsh-rrp/sediment` 全部方法（GET/POST/DELETE）在会话解析后统一校验 `agentPreset` 归属（`belongsToRpPreset`，与矫正路由同策略同文案），非 RP 会话一律 403，不再漏 200/400 |

- 回归测试：新增 `sediment-route.spec.ts`「non-RP 403 on every method」；typecheck 0 错、146/146 绿、构建通过
- 真机复验（2026-09-18 23:45，报告 §7 + 3 张 reverify 截图）：DEF-01 两张卡开卡均自动跳转对话区、Console 0 错；DEF-02 非 RP 会话 GET/POST/DELETE 全部 403、RP 会话回退 200。**两处缺陷均已闭环，全量绿灯**

**发布状态**：v0.1.0 就绪（核心功能与真机验证达标，剩余项均为可选增强）。
