# 仓库架构维护与兼容性重构

## Goal

在独立分支上，对经源码与测试审计确认的模块边界进行小步、行为保持型重构，使职责边界更清楚、共享契约只维护一处、工程验证仅扫描当前 checkout。用户可验证结果：当前分支与 `main` 隔离；项目质量命令不再误扫描同仓库中的本地嵌套 worktree；被选中的结构切片保持原产品行为，并由现有与新增测试及本地宿主冒烟验证。

本规格把“全仓重构”落实为覆盖核心模块的循证维护，不做无差别重写、格式 churn、目录搬迁或为了统一而新增框架。审计未找到重写整个仓库的证据。

## Baseline

- 起始 HEAD：`9b0cdc709a2399e4512449ad4f3177c292744e37`（`main` 与 `origin/main` 同步）；tracked worktree clean。
- 分支：`refactor/repo-architecture`，从上述 `main` HEAD 创建。
- Node `24.16.0` / pnpm `10.14.0` 与项目基线一致。
- 首轮检查：`check:environment`、`format:check`、`typecheck` 通过；`lint` 因扫描本地 `.worktrees/feat-auto-20260923-47726507` 导致多个 `tsconfigRootDir` 错误；Vitest 同样收集嵌套 checkout，造成重复运行并因旧 checkout 与当前根仓均缺少本地 `happy-dom` 链接而有 1 个收集错误。
- 将 `.worktrees/` 排除出 Git/Prettier/ESLint/Vitest 后，执行 `pnpm install --frozen-lockfile`（恢复已声明的 `happy-dom`，未改 lockfile）；`check:environment`、`format:check`、`typecheck`、`lint`、Vitest（45 文件/391 用例）及 `build` 全通过。

## Scope

- 将根仓库本地 `.worktrees/` 明确设为 Git/ESLint/Vitest 工具的排除路径，不删除、不移动、不修改其中内容。
- 收敛 `src/state-publisher.ts` 与 `src/host-faces.ts` 的重复 session/projection 结构类型；补充清理项和真实 effect dispose 清理测试，不建通用注册表。
- 拆开 `src/card-import.ts` 的纯解析/归一化与目录写入/preset 物化职责，保持原有导入行为。
- 让 Copilot 与 lore 路由共用的 Scribe/草稿能力依赖窄应用层，而不是 HTTP 路由模块；保持任务生命周期与 D8 控制环。
- 将 `src/client/world-state-tab.tsx` 中纯世界状态草稿转换从 React 组件中提取，并覆盖转换规则。
- 在 `/cards` 与 `/cards/one` 两端复用 `src/route-contract.ts` 的既有 DTO，保持现有 JSON 与降级逻辑。

## Out of scope

- 任何产品行为、公开 HTTP/SSE 契约、会话事件或持久化数据形状变化。
- 改动 DSH Host seams、Author/Chronicler 等权能、D14/D21/D22 等既有决策。
- 全面抽象投影、生命周期、右侧栏或 Card UI；重写世界线/Stage/host-runner；新增依赖或自制宿主设施。
- 修改、归档或清除 `.worktrees/` 中任一目录；提交、推送、合并。

## Test seam and acceptance

- 各实现票据先在最高现有 seam 编写/补齐行为测试，再修改结构；每片运行针对性 Vitest、typecheck、lint。
- 根级命令只处理当前 checkout：`pnpm run check:environment`、`pnpm run format:check`、`pnpm run typecheck`、`pnpm run lint`、`pnpm test`、`pnpm run build` 均须成功。
- 真实 `host-runner` 本地 start/status/stop 冒烟仅在没有既存本机 runner 元数据/日志、或维护者授权替换时执行；不读取或修改已有用户会话数据。若本机状态/日志存在且无法安全复用，则不覆盖，记录为未执行并由路由/生命周期集成测试验证代码路径。
- `git diff --check` 通过；已存在 `.worktrees/` 原样保留；最终变更限定在当前 branch 和本规格列出的 scope。
- 如需变更产品行为、数据含义或已拍板规则，停止对应切片并记为阻塞，不以重构名义自行裁决。
