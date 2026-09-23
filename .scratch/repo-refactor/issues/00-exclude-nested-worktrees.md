Status: resolved

# 将本地嵌套 worktree 排除出根仓检查

## Scope

保留根目录 `.worktrees/` 内容，但让 Git 状态、ESLint、Vitest 和格式检查不会把本地嵌套 checkout 当成当前仓库的源文件或测试。排除规则只匹配仓库根的本地 `.worktrees/`；子目录中的同名分发路径（如 `cards/maid-heiress/.worktrees/`）不得被 Git 忽略。

## Acceptance

- 仓库根 `/.worktrees/` 被 Git 忽略；`cards/maid-heiress/.worktrees/` 不因本票据规则被忽略。根 `.worktrees/` 内容完整保留且未被修改。
- `.gitignore`、`.prettierignore` 与 Vitest 的 `.worktrees` 排除只匹配仓库根；ESLint 仅忽略根相对 `.worktrees/**`。
- `pnpm run lint` 与 `pnpm test` 只处理根 checkout，不再出现多重 tsconfig 错误/重复收集/旧 worktree 缺依赖错误。
- Prettier 不扫描根 `.worktrees/`，子目录同名路径不受该排除规则影响。

## Blocked by

无。

## Completion (2026-09-23)

- `.gitignore` 与 `.prettierignore` 使用根锚定 `/.worktrees/`；Vitest 与 ESLint 使用配置根相对 `.worktrees/**`。
- `git check-ignore` 确认根 `.worktrees/` 命中而卡包下同名路径不因本规则被忽略；Prettier file-info 确认根 worktree 被忽略、其他嵌套路径不受本规则影响。
- `pnpm install --frozen-lockfile` 补齐 package.json 已声明的 `happy-dom`，lockfile 未变。
- 最终根级 `pnpm run check:environment`、`pnpm run format:check`、`pnpm run typecheck`、`pnpm run lint`、`pnpm test --silent`（46 文件/407 用例）、`pnpm run build` 与 `git diff --check` 均通过；`.worktrees/` 内容未修改。
