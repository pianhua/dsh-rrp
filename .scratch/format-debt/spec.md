# 格式债务清理

## Goal

让当前仓库的 Prettier 检查恢复通过，为后续代码切片建立可解释的干净基线。

## Scope

- 只处理当前 `pnpm run format:check` 报出的 9 个既有源码和测试文件；
- 只接受 Prettier 产生的排版变化，不改变运行逻辑、测试语义或公共契约；
- 运行格式检查、类型检查、lint 和全量测试确认基线。

## Test seam

纯排版切片不新增行为 seam；沿用现有全量 Vitest 回归，并以 `pnpm run format:check`、`pnpm run typecheck` 和 `pnpm run lint` 作为静态基线。构建属于集成前验证，不扩大本票据的代码范围。

## Out of scope

- 不顺手重构组件或测试；
- 不修改本轮协作文档之外的产品设计；
- 不处理新的格式问题，除非它们由本次排版修复直接暴露。

## Acceptance

- `pnpm run format:check` 退出码为 0；
- `pnpm run typecheck`、`pnpm run lint` 和 `pnpm test` 通过；
- `git diff` 中除目标文件外没有源码逻辑变化。
