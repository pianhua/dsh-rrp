Status: resolved

# 复用卡包列表与详情路由 DTO

## Scope

让 `src/cards-route.ts` 和 `src/client/gallery-panel.tsx` 对 `/cards`、`/cards/one` 使用 `src/route-contract.ts` 已有的 response 类型；只加编译期约束，不新增通用 RPC/fetch 框架。

## Acceptance

- 服务端响应和展厅客户端消费使用既有 `CardListResponse` / `CardOneResponse`。
- JSON 外形不变；缺少 workspaceId 时的降级开卡流程不变。
- `tests/cards.spec.ts`、`tests/client.spec.ts`、`tests/route-contract.spec.ts` 和 typecheck 通过。

## Blocked by

00-exclude-nested-worktrees (resolved)

## Resolution (2026-09-23)

- `src/cards-route.ts` uses `CardListResponse` / `CardOneResponse` to constrain the existing success JSON shapes; `src/client/gallery-panel.tsx` consumes those DTOs without changing runtime validation or workspace fallback behavior.
- `tests/client.spec.ts` covers list/detail response envelopes and missing-`workspaceId` fallback; `tests/route-contract.spec.ts` covers route JSON shapes.
- Target tests passed: `pnpm exec vitest run tests/cards.spec.ts tests/client.spec.ts tests/route-contract.spec.ts` (3 files / 34 tests).
- Final integrated `pnpm run typecheck`, `pnpm run lint`, all 46 Vitest files / 407 tests, and build passed.
