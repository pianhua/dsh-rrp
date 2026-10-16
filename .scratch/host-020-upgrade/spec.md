# 规格 · 宿主升级 0.1.6-alpha.2 → 0.2.0-rc.1

> 触发：所有者指示（2026-09-29）。流程真源：`docs/reference/HOST_BASELINE.md` 升级流程。
> 审计报告：三路只读勘察（服务端接缝 / 客户端接缝 / 已知缺陷复核），结论已核实到宿主源码 file:line。

## 目标

插件在 DSH 0.2.0-rc.1 下完整可运行：旧会话（V3 日志经宿主迁移）状态可读、开局/推演/分叉/世界线/后台任务/展厅/舞台全部工作，文档基线对齐。

## 必修项（P0）

| # | 项 | 关键事实（证据在宿主克隆） |
| :--- | :--- | :--- |
| M1 | **source 寄生面迁移** | 0.2.0 为 V4 格式；V3→V4 迁移把未知 plugin source `{kind:'plugin',plugin:'dsh-rrp'}` 改写为 `{kind:'plugin:dsh-rrp', rrp}`（**plugin 字段被删**，sources.ts:59-64）。现读法 `kind==='plugin'&&plugin==='dsh-rrp'` 对迁移后历史会话**全部失效**。新写统一改用 producer-owned `kind:'rrp'`（declaration merging 合法）；读法接受三种形态：`{kind:'rrp'}` / `{kind:'plugin:dsh-rrp'}` / 旧 `{kind:'plugin',plugin:'dsh-rrp'}`。写点：state-payload.ts + chronicler.ts:310/353 + copilot.ts:620/632 + lore-application.ts:157 + start.ts:104 + summarizer.ts:258。 |
| M2 | **jobs API 重写** | `owner: Agent`→`owner: SessionId`；`run()`→`run(job: JobHandle)`；`readOutput()` 删除→`job.append()`/消费端 `read().chunks`+`lossy`（jobs/types.ts:121-185）。 |
| M3 | **preset 机制重写** | `.agent-presets` 目录扫描与 `USER_PRESET_DIR` 已删除（agent-presets 包拆为 agent-preset-registry + agent-preset）。改运行时 `ctx.agentPresets.register({id,plugins})` 注册 rp 与 rp-<card>；删除物化目录逻辑，遗留目录一次性清理（仅删带本插件所有权标记且用户未改动的副本）。gallery 的 `remote.agentPresets.select` 需复核 0.2.0 客户端 API 形态。 |
| M4 | **客户端 Icon 重命名** | `Icon*16/20` 尺寸后缀导出改为 `Regular`/`Medium`（ui-primitives/src/icons/index.tsx）。同步 `src/client/primitives.d.ts` 镜像与 tests/stubs。**运行时模块解析失败风险，最高优先。** |
| M5 | **fork 语义变化适配** | `OPEN_TURN` 错误码删除：fork 在 open turn 自动补 synthetic closers（`turn/end reason.kind:'forked'`）。审计世界线 digest/transcript 折叠对 forked closers 的处理；移除对 OPEN_TURN 拒绝路径的依赖（若有）。 |

## 保持不变（审计确认）

sessionProjections / webServer / commands / scoped skills / sessionQuery（listSessions/readTitleSnapshots/openAt:never）/ agent 生命周期 / ui-slots InjectParams scope 规则 / workspace 投影 / locale / `--dsw-alias-*` token 族 / conversation.view 注册 / InputActions 窄接口（setDraft/submit）。

## 宿主缺陷对账（HOST_SEAMS D14 关联）

| 缺陷 | 0.2.0 状态 | 插件对策 |
| :--- | :--- | :--- |
| seeded 会话 readSession 必抛 | **已修复**（inheritedEventCount + end-seed 标记） | cuts 旁路缓存**保留**作保守兜底（历史畸形日志仍可能失败） |
| storageDomain 同域二次打开 | **未修复**（明确 single-open 设计） | 共享 handle 设计**保留** |
| header.agentPreset 不可靠 | 底层写入已修复，但语义明确为「创建时 preset」；gallery 是「先创建后 select」，主线 header 仍可能是 standard | cards 归属缓存**保留** |
| 窄窗 panellist 不切换 | **已修复**（selectPanel 无 mobile 分支，测试覆盖 collapsed rail） | 纳入真机验收回归项 |

## 验收

1. 全量质量门（typecheck/lint/ vitest/build/diff-check）；
2. `git grep -n -E 'snapshotEvents|eventAt|ownEvents' -- src` 必须为空；
3. 真机（host-runner + 内置浏览器）：rp-dev profile 启动零报错、画廊开局（preset 选中 rp-<card>）、Chronicler 后台推演落账、世界线 fork（含回合中间分叉）、展厅/舞台/右栏渲染（Icon 全显示）、窄窗（≤520px）点展厅图标切换主区、旧会话（V3 迁移后）世界状态可读；
4. HOST_BASELINE.md 基线表 + 审计历史、HOST_SEAMS.md、HOST_ALIGNMENT.md 必要条目更新。

## Out of scope

宿主 0.2.0 新能力的消费（keepMounted/inspectCall/registerCloseHandler 等）——记录备查，不本期实现；cuts/cards 缓存的退役评估（保守保留）。
