# 票据 02 · 客户端：双栏世界线视图重写

**状态**：resolved（2026-09-26）
**依赖**：票据 01（服务端契约类型已落盘）
**规格**：`.scratch/worldline-v2/spec.md` §6（客户端重写全文）

## 任务清单

1. `src/client/worldline-tab.tsx` 重写：
   - API 面：loadTrees / open / fork(from, atSeq, name) / hide / **restore** / **rename** / exportNovel / subscribe；全部检查 response.ok + catch 报错（替换裸 `void promise`）。
   - fork 后命名：去掉 8×400ms 轮询，改 `sessions.binding(childId)` 就绪即 rename，未就绪报错提示；自动命名 N 取自服务端树中该父真实子线数。
2. 新组件（`src/client/components/worldline-*.tsx`）：
   - `worldline-branch-list.tsx`：按卡分组、分支行（标题/最新回合/活动时间/精简徽标/冷标记）、hover 操作（打开/重命名/收起/导出）、组底「已收起（N）」恢复区。
   - `worldline-turn-rail.tsx`：虚拟化回合列（视口 ±5 缓冲），节点 = 回合号 + 玩家摘要 + 正文摘要 + 节点徽标 + 归因行（meta）；`isHead && 当前会话` 高亮「当前回合」；选中节点悬浮「从此分叉」。
   - `worldline-fork-dialog.tsx`：确认层 + 命名输入（预填自动名）。
   - `worldline-hide-dialog.tsx`：收起确认层（明示下游数量）。
3. 自动刷新：当前会话 `useProjection(WORLDLINE_DIGEST_KEY)` 订阅 + roster 订阅 + 操作后显式 loadTrees（§6.3）。
4. 冷线：点击 = openSession；未加载时回合列占位文案（§6.2）。
5. 删除 `worldline-flowchart.tsx` / `worldline-inspector.tsx` / `worldline-layout.ts` 与 `tests/worldline-layout.spec.ts`。
6. locale：全部玩家可见文案进 locale 文件 worldline 段（禁硬编码中文/emoji；用 GLOSSARY 标准名：世界线/分支/从此分叉/收起此线/恢复/当前回合/位置未知/冷）。

## 测试（必做）

- 纯函数抽取测试（分支树 flatten、自动命名、相对时间）跟随项目现有客户端测试先例。
- `pnpm run typecheck` 通过；不触碰服务端文件（归票据 01）。

## 验收

- `pnpm vitest run` 全绿（含旧测试清理）。
- 内置浏览器真机验收清单见 spec §8（由主代理在合并前执行）。
