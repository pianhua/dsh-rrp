# 票据 01 · 服务端数据层：digest 重建 + fork 切口标记 + 拓扑路由解耦

**状态**：resolved（2026-09-26）
**依赖**：无（契约类型由主代理先落盘：worldline-digest.ts / worldline-tree.ts / state-payload.ts / route-contract.ts）
**规格**：`.scratch/worldline-v2/spec.md` §2（契约）、§3（digest 折叠规则）、§4（fork 感知）、§5（拓扑与路由）

## 任务清单

1. `src/worldline-digest.ts`：按 §2.1 改词汇（WorldlineTurnMeta / nextTurn / firstLocalTurn / forkCuts / seedTurnsOf），`emptyWorldlineDigest()` 相应更新。
2. `src/state-payload.ts`：`RrpPayload` 增加 `worldlineForkCut`（§2.3）；确认 rrpPayloadOf 透传。
3. `src/projection/worldline-digest.ts`：按 §3 重写折叠（stateVersion → 4）；schema 增补新字段。
4. `src/worldline-tree.ts`：按 §5.1–5.3、5.5 改折叠（seedTurns 直读、isHead、seedKnown、防环、跨卡守卫、重复 id 诊断）。
5. `src/worldline-route.ts`：按 §5.4–5.5 改收集（readSession 冷线切口、限并发 4、单会话 try/catch、inheritedEventCount 校验）。
6. `src/worldline-store.ts`：keys 缺失退化为 entries() 遍历。
7. `src/index.ts`：新增 `session/created` fork 感知监听（整体 try/catch），经 state-publisher 向父线追加切口标记（§4）；建议监听器逻辑抽成 `src/worldline-fork-marker.ts` 纯模块便于测试。
8. `src/state-publisher.ts`：如 publishState 信封不兼容 worldlineForkCut（无 worldState/summary 的纯标记），增加最小发布入口或允许空 payload 标记发布。
9. `src/projection/transcript.ts`：payload 分支仅当 payload 携带 `worldState`/`summary` 时推进 `lastStateSeq`（spec §4 转录护栏）；补测试：纯 worldlineForkCut 标记不推进水位。

## 测试（必做）

- 重写/扩展 `tests/worldline-digest.spec.ts`（§7 清单全项）。
- 扩展 `tests/worldline-tree.spec.ts`、`tests/worldline-route.spec.ts`（§7 清单）。
- 新增 `tests/worldline-fork-marker.spec.ts`。

## 验收

- `pnpm vitest run tests/worldline-digest.spec.ts tests/worldline-tree.spec.ts tests/worldline-route.spec.ts tests/worldline-fork-marker.spec.ts` 全绿。
- `pnpm run typecheck` 通过。
- 不触碰 `src/client/**`（客户端归票据 02）。
