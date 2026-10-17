Status: resolved

# 一次性脚本归档 scripts/maintenance/

## Scope

把一次性/诊断脚本 `git mv` 到 `scripts/maintenance/`：repair-legacy-sessions.mjs、repair-v3-openings.mjs、fetch-pjsk-assets.mjs、e2e-import-fixtures.mjs、inspect-context.mjs。日常脚本（check-environment、check-repo-hygiene、link-dev、host-runner*、host-runtime*）留原位的。

移动前先全仓 grep 确认：无 package.json scripts、CI workflow、docs 指令、其它脚本 import 这 5 个文件；若有引用则同步改写。

## Acceptance

- 5 个文件位于 `scripts/maintenance/` 且仍可直接 `node scripts/maintenance/<name>.mjs` 执行（路径无关性自检）。
- package.json scripts、.github/workflows、docs 无失活引用（grep 验证）。
- `check:hygiene && typecheck && lint && pnpm test` 全绿。

## Blocked by

无（与 src 搬迁独立，可并行，但提交保持独立）

## Completion (2026-10-17)

- 5 个一次性脚本归 maintenance/；fetch-pjsk-assets 仓库根路径加深；inspect-context/repair-* 经审计为 DSH_HOME 路径无关。HOST_BASELINE 的 repair-v3-openings 提及属历史行记录，保留原样。543 全绿，提交 `4601f67`。
