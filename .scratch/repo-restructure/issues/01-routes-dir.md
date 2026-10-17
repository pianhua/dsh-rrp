Status: resolved

# 路由层归位：10 个 *-route.ts → src/routes/

## Scope

把 `src/{activity,card-ui,card-workspace,cards,export,lore,recall,stage-kit,world-state-timeline,worldline}-route.ts` 共 10 个 HTTP/SSE 路由文件 `git mv` 到 `src/routes/`，全仓 import 路径同步改写。不改任何路由的行为、路径、方法或 DTO。

## Acceptance

- 10 个文件位于 `src/routes/`，src 根不再存在 `*-route.ts`。
- `pnpm run typecheck`、`pnpm run lint`、`pnpm test` 全绿（断 import 即红，即本步的负向对照）。
- 路由行为零变化：`tests/integration/*route*.spec.ts` 与 e2e 用例原样通过。

## Blocked by

00 (worklog 切分，避免后续条目体积触顶)

## Completion (2026-10-17)

- 10 个路由文件 `git mv` 至 `src/routes/`；路由文件内全部相对 import 加深一级（`./x` → `../x`），消费方（index.ts、tests/、e2e support）import 指向 `routes/`。
- 验证：`typecheck`、`lint`、`pnpm test`（68 文件 / 543 用例）全绿；提交独立。

## Integration review follow-up (2026-10-17)

- e2e 三连红抓到本票据的隐性破坏：stage-kit-route.ts 的 `../assets/` 被随层级「修正」为 `../../assets/`，但 tsdown 打包后模块 URL 是 lib/index.js（bundle 根），生产形态下应仍为 `../`——「src 根深度 == lib 深度」是不变量，文件移动即破。
- 修复：新增 `src/repo-dir.ts` 的 `repoDirOf()`（双层探测、深先浅备），三处 import.meta.url 调用点统一接入；新增 `tests/unit/repo-dir.spec.ts` 5 用例（含 src/cards 自名陷阱回归）。详见当日 worklog「bundle 路径不变量事故」。
