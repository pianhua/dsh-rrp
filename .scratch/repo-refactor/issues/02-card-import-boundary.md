Status: resolved

# 分离卡片导入转换与落盘职责

## Scope

将 `src/card-import.ts` 中的解析/归一化与用户卡目录写入、preset 物化职责分离为窄模块；HTTP 路由和公共调用入口保持兼容，不扩展格式支持或导入策略。

## Acceptance

- 纯解析路径与文件系统/preset 写入边界清晰，调用方依赖保持简单。
- `tests/card-import.spec.ts` 覆盖现有 V2/V3、PNG chunk、字段映射、冲突处理、写盘与 preset 物化行为。
- 不改变 PNG chunk 优先级、占位符替换、用户卡优先级、ID 冲突处理或现有响应契约。

## Blocked by

00-exclude-nested-worktrees（开始本切片前已解除）

## Results

- 新增 `src/card-import-parse.ts`，集中纯归一化、JSON/PNG 解析及 ID slug 逻辑；模块不依赖文件系统、卡包根目录或 preset。
- `src/card-import.ts` 继续作为兼容入口重导出原有解析 API；用户卡写入、冲突分配与 preset 物化留在原模块。
- 扩展 `tests/card-import.spec.ts`，覆盖 V2/V3 JSON、字段归一化、PNG `ccv3 > chara > ccv2` 优先级与降级、旧导出兼容、用户卡优先级、跨根 ID 冲突及落盘/preset 物化。

验证：
- `pnpm exec vitest run tests/card-import.spec.ts`：13 tests passed。
- `pnpm exec eslint src/card-import.ts src/card-import-parse.ts tests/card-import.spec.ts`：通过。
- `pnpm exec prettier --check src/card-import.ts src/card-import-parse.ts tests/card-import.spec.ts`：通过。
- `git diff --check`：通过。
- 并行实现时的全局检查曾读到其他切片的中间编辑状态；集成后的 `pnpm run typecheck`、`pnpm run lint` 与全量质量检查均已通过。
