# 仓库重启前彻底重构（restructure for fresh-start）

## Goal

对照参照项目 dsh-tavern 的工程分层实践，把 dsh-rrp 的 `src/` 根目录从 58 个平铺文件重组为**分层 + 分域目录**，清理残留与一次性脚本，对齐文档与真实结构，并产出一份「重启开发路线图」。用户可验证的结果：目录结构一眼可导航；`docs/dev/architecture.md` 模块地图与磁盘一一对应；质量门（hygiene / format / typecheck / lint / 543 用例 / build）全程常绿；每项改动一个独立提交；任意新协作者读完 AGENTS.md + architecture.md + restart-roadmap.md 即可开始开发。

## Baseline

- 起始 HEAD：`3617b07`（main 与 origin/main 同步，工作区干净）。
- 已实证基线全绿：`check:hygiene`、`format:check`、`typecheck`、`lint`、Vitest 68 文件 / 543 用例。
- 审计结论（2026-10-17）：无超大文件（src 最大 934 行）、零 TODO/FIXME、ADR 27 篇连续、测试树与 src 对应良好——**不做无差别重写**；真问题是 src 根分层混杂（路由/智体运行时/领域逻辑/宿主接缝平铺一层）、空目录 `src/skills/`、一次性脚本与日常脚本混居、worklog 触顶（32099/32768 B）、architecture.md 模块地图漂移、待办散落多处。

## 对照结论（从 dsh-tavern 学什么、不学什么）

参照项目 `tavern-plugin/lib/` 约 250 个模块按 `domain/`（纯逻辑）· `hooks/`（宿主钩）· `http/`（路由）· `tools/` 分层目录组织，运行时应贯文件在顶层。本仓**学其「按层分目录、域内聚」**，但不照搬其 taxonomy（本仓词汇是投影/发布/宿主接缝，见 CONTEXT.md），也不搬其商业产品设施（CDN 发布、Android 打包、runtime manifest）。

## Scope（行为保持型结构重构）

目标结构（13 个目录 + 4 个根文件）：

```text
src/
├── index.ts / contracts.ts / route-contract.ts / json-extract.ts   # 入口·公开面·DTO 单一来源·通用工具
├── host/        # 宿主接缝：host-faces, preset, preset-id, start, settings, save-naming, home
├── agents/      # 智体提示词契约（不动）
├── runtime/     # 智体运行时编排：chronicler, summarizer, copilot, copilot-store, recall, transcript, transcript-reader, prompt-budget
├── publish/     # 追加式发布写通道：state-publisher, state-payload, correction, activity, macro-summary, steward-proposals
├── projection/  # 纯折叠器（不动）
├── world-state/ # world-state, world-state-references, world-state-visibility, world-state-timeline
├── worldline/   # worldline-tree, worldline-store, worldline-digest, worldline-fork-marker
├── lore/        # lore, lore-state, lore-runtime, lore-condition, lore-application, lore-drafts, lore-provider
├── cards/       # cards, card-types, card-import, card-import-parse, card-state-schema
├── routes/      # 全部 9 个 *-route.ts
├── ui-contract/ # ui-schema, ui-bridge, card-ui
└── client/      # 面板（不动）
```

配套清理：

- 删除空目录 `src/skills/`。
- `scripts/` 一次性脚本归档 `scripts/maintenance/`：repair-legacy-sessions、repair-v3-openings、fetch-pjsk-assets、e2e-import-fixtures、inspect-context（先 grep 引用确认无质量门/CI 依赖）。
- worklog 按月切分：10 月条目移入 `docs/dev/worklog/2026-10.md`（沿用 2026-09.md 先例）。
- `docs/dev/architecture.md` 模块地图按新结构重写；同步修正 DEVELOPMENT/host-seams/routes 等文内 `src/*.ts` 引用。
- 新增 `docs/dev/restart-roadmap.md`：汇总 issue 06（P0）、Playwright 真玩局（P0#4）、P1 #5–8、B2/B3 与本次发现的后续项，作为重启开发唯一入口。

## Out of scope

- 任何产品行为、HTTP/SSE 契约、会话事件、持久化数据形状变化。
- 业务逻辑重写、函数级重构、格式 churn、依赖增删。
- 宿主接缝（host-faces 内部实现）、投影数学、ADR 历史记录改写。
- issue 06 的修复本身（属重启后的开发工作，只进路线图）。
- `.scratch/` 其它功能目录、cards/presets 资产。

## Test seam and acceptance

- 结构迁移以 `git mv` 小步执行，每步 `pnpm run typecheck && pnpm run lint && pnpm test` 全绿再提交；import 路径用全仓一致规则改写（`sed` 批处理 + typecheck 兜底——断 import 即红，即本重构的「负向对照」）。
- 收尾全量：`pnpm run check:hygiene && pnpm run format:check && pnpm run typecheck && pnpm run lint && pnpm test && pnpm run build`，外加 `pnpm run test:e2e` 连跑 3 次一致。
- 行为等价证据：543 用例基线前后数量与通过率不变；`git diff --stat` 显示纯移动 + import 行变更，无逻辑行改写（移动 hunks 除外，允许尾随空行/换行 normalize）。
- 文档：`architecture.md` 模块地图与新结构逐目录对应；worklog 追加本次记录后体积低于上限。

## 裁决记录（auto 模式代裁决，理由落盘）

1. **保留 `contracts.ts` / `route-contract.ts` / `index.ts` / `json-extract.ts` 在根**：入口与公开面放根是 Node 包惯例，DTO 单一来源被前端/路由/宿主三方 import，根位置即其「单一来源」语义的一部分；json-extract 是全仓唯一通用工具，单文件不建目录。
2. **runner 不进 `agents/`**：agents/ 当前是无宿主依赖的纯契约层（客户端也 import 它），runner 携带 `node:fs`/`ctx.jobs` 重依赖，混入会污染契约层；另立 `runtime/` 与参照项目「运行时应贯文件独立成层」同构。
3. **`card-types.ts` 归 `cards/` 而非留根**：它是卡包共享词汇而非全局词汇（全局词汇只有 world-state），跟随领域走。
4. **脚本归档不删除**：一次性修复脚本是真机事故的记录与工具，移入 maintenance/ 保留可执行性，只与日常脚本分居。
5. **历史 ADR 与验收报告不改写**：点-in-time 记录，文内旧路径视为历史证据；只更新「现状描述型」文档（architecture/DEVELOPMENT/host-seams/routes）。
