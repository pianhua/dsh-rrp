# WORKLOG.md — 工作区状态盘点（追加式，最新在上）

> 纪律（见 `docs/dev/workflow.md` 第 3 节）：已确认的内容必须落盘，上下文压缩后只认本文件。
> 每条带日期；事项关闭时标注（关闭 + 日期），不删旧条。

---

## 2026-09-21 · 工作区盘点 + locale 红线修复 + 流程落地

### 盘点结论（冲突检查第 4 节执行结果）

工作区有一批**内聚度很高**的未提交改动（23 文件 +383/−1257，另有 8 个新文件），分六组：

1. **前端面板组件化**：世界状态页签拆 `components/world-state-{primitives,sections,dynamic}.tsx`；
   世界线页签重写为 Galgame 流程图（新增 `worldline-flowchart.tsx` / `worldline-inspector.tsx` / `worldline-layout.ts` + 布局测试）。
2. **循环依赖拆叶**：`stage-types.ts`（舞台共享类型）、`lore-drafts.ts`（lore 草稿暂存），均为原样 re-export，调用方路径不变。
3. **worldline-tree 折叠修复 + 特性**：孙代分叉被断成 root 的缺陷修复（`findNodeInLineage` 沿祖先上溯）；
   新增 `pending` 占位节点（零回合新 fork 显示「新分支起点」）。均有测试背书。
4. **文档跟随**：5 投影→7 投影、`ctx.storage`→`ctx.storageDomain`、5 智体名单、dsh-synapse 撤装等，全部为追代码的一致性更新，未发现语义冲突。
5. **已登记张力（待所有者拍板）**：`HOST_ALIGNMENT.md` §3.1 —— 酒馆卡导入与 D14 的字面冲突按「已知例外」记录，不改 D14 原文。
6. **基线健康**：typecheck / lint / vitest 全绿（41 文件 369 用例）。

### 本轮已修

- **locale 红线违例**：世界线新组件用了 15 个未注册字典键（`worldline.totalNodes` 等），此前靠硬编码中文
  `?? '…'` 兜底，违反 HOST_ALIGNMENT「UI 文案必须走 locale」红线，英文界面有显示裸键名风险。
  处置：字典抽为叶模块 `src/client/locales.ts`（沿用 stage-types / lore-drafts 先例），15 键补 ZH/EN；
  新增守卫测试 `tests/locale-keys.spec.ts`（ZH/EN 键集相等 + 源码所用键均已注册），把红线变成自动检查。
  注：组件里的 `?? '中文兜底'` 现已成为不可达死代码，下次触碰这些文件时顺手移除。
- **流程落盘**：新增 `docs/dev/workflow.md`（术语先行 → 30+20 拷问 → 确认即落盘 → 编码前冲突检查 → DoD），
  AGENTS.md §3 与 DEVELOPMENT.md 已挂指针。

### 待决事项

| 事项 | 阻塞什么 | 归属 |
| :--- | :--- | :--- |
| HOST_ALIGNMENT §3.1 酒馆导入 vs D14 的字面冲突拍板 | 导入功能的文档定性 | 所有者 |
| 未提交改动的提交策略（按逻辑分组切提交 or 一把梭） | 进入下一特性前的干净基线 | 所有者 |

### 待执行（按建议顺序）

1. **提交检查点**：上述六组改动测试全绿，建议按组切 3–5 个逻辑提交（组件化 / 拆叶 / worldline 修复+特性 / locale 修复 / 文档跟随）。
2. **Round-6 真机抽查**：brief 在案（`E2E_BRIEF_ROUND6.md`，T42–T48 舞台页签），但基线标注为 `97653a3`，已落后当前 HEAD，执行前先刷新 brief 的对照基线。
3. **条件注入 v1（issue #16）**：`docs/plans/conditional-injection-v1.md` 设计已对齐（R1 评审五条全采纳），T1–T8 待动工。
