# 世界线 v2 重做规格（一期）

> 决策真源：DECISIONS.md D24（2026-09-25 拍板，16 题访谈全按建议）。
> 术语真源：GLOSSARY.md §3（新增：分叉切口 / 节点徽标 / 从此分叉 / 位置未知）。
> 勘察报告：重做前双份研究（自身实现 bug 清单 + 宿主 0.1.6-alpha.2 能力边界）结论已浓缩进 D24。

## 1. 目标与非目标

**一期目标**：
1. 数据三根支柱重建：拓扑与 digest 解耦；徽标按回合精确对齐 + 全量重建（删除语义）；时间线 provenance 接入节点。
2. fork 切口保护：子线永远有挂载点（含 500+ 回合长会话）。
3. 冷支线真实切口精确挂载，解析不出诚实标注「位置未知」。
4. 客户端双栏视图（分支列表 + 虚拟化回合列）替换 galgame SVG，交互闭环：分叉确认带命名、手动重命名、收起确认 + 恢复入口、当前回合精确标记、订阅投影自动刷新、错误提示。

**非目标（二期或不做）**：全图概览副视图（galgame 图回归评估）、分支内容对比、导出扩展、真机宿主级 fork UI 联动。会话删除不存在（宿主无 API，D24 决策 3）。

## 2. 数据契约（字段级，先落类型再实现）

### 2.1 digest 词汇（`src/worldline-digest.ts`）

```ts
/** 回合节点的状态归因元数据（来自 WorldState v2 时间线批次）。 */
export interface WorldlineTurnMeta {
  /** 本回合状态批次的修改者。 */
  actor?: 'initial-state' | 'player' | 'chronicler' | 'copilot' | 'system' | 'unknown'
  /** 该批次状态是继承前缀还是本线产生。 */
  origin?: 'inherited' | 'local'
  /** 本批次变化条数（baseline 为 0 或不设）。 */
  changeCount?: number
}

export interface WorldlineTurnDigest {
  /** 绝对回合号：跨 lineage 连续（子线继承父线编号），不受上限裁剪影响。 */
  turn: number
  /** 玩家消息 seq ——「从此分叉」的 atSeq。 */
  seq: number
  player: string
  prose: string
  /** 全量重建的节点徽标；字段消失即消失（删除语义）。 */
  badge?: WorldlineBadge
  meta?: WorldlineTurnMeta
}

export interface WorldlineDigest {
  turns: WorldlineTurnDigest[]
  /** 下一个将分配的绝对回合号（单调计数器，上限裁剪不影响它）。 */
  nextTurn: number
  /**
   * 继承前缀回合数（= 本线首个本地回合号）。首个本地玩家消息到来时
   * 固化为 firstLocalTurn；无本地回合时读数 = nextTurn（pending fork）。
   */
  firstLocalTurn?: number
  /** 从本会话 fork 出去的切口回合号列表（上限裁剪保护集）。 */
  forkCuts: number[]
  /** 最新状态徽标水位；转发给下一个新回合。 */
  pending?: WorldlineBadge
}

/** seedTurns 派生：继承前缀回合数。 */
export function seedTurnsOf(d: WorldlineDigest): number {
  return d.firstLocalTurn ?? d.nextTurn
}
```

### 2.2 折叠事实与树节点（`src/worldline-tree.ts`）

```ts
export interface WorldlineSessionFact {
  id: string
  cardId: string
  cardName: string
  title: string
  parentId?: string
  /** 绝对切口回合号（= 父线中被继承的回合数）。拓扑唯一依据。 */
  seedTurns?: number
  /** 切口是否解析成功；false = 位置未知（诚实标注，仍按谱系挂载）。 */
  seedKnown?: boolean
  /** 最新本地回合号（当前位置标记的依据；live 才有）。 */
  headTurn?: number
  stub?: boolean
  turns: readonly WorldlineTurnFact[]
}

export interface WorldlineTurnFact {
  turn: number
  seq: number
  player: string
  prose: string
  badge?: WorldlineBadge
  meta?: WorldlineTurnMeta
}

export interface WorldlineNode {
  key: string
  sessionId: string
  sessionTitle: string
  turn: number
  seq: number
  playerExcerpt: string
  proseExcerpt: string
  badge?: WorldlineBadge
  meta?: WorldlineTurnMeta
  /** 本节点是该会话最新回合（当前位置精确标记，替代旧「整会话标记」）。 */
  isHead?: boolean
  /** 冷线/切口未知诚实标注。 */
  seedKnown?: boolean
  loaded?: boolean
  pending?: boolean
  fork: boolean
  children: WorldlineNode[]
}
```

### 2.3 fork 切口标记（`src/state-payload.ts` 的 `RrpPayload` 增加）

```ts
/** 插件感知到 fork 后追加到父线日志的切口标记（追加式插件通知，D24 决策 5）。 */
worldlineForkCut?: { child: string; turn: number } | { child: string; turn: null }
```

`turn: null` = 切口超出父线保留窗，诚实未知。digest 折叠：非 null 时并入 `forkCuts`；忽略 `turn: null`。

### 2.4 响应契约（`src/route-contract.ts`，仅注释更新 + 复用上述类型，结构不变）

`WorldlineTreeResponse { trees }`、`WorldlineHiddenResponse/SetRequest` 不变。

## 3. digest 折叠规则（`src/projection/worldline-digest.ts`，stateVersion → 4）

1. **绝对回合计数**：`nextTurn` 初值 0；每个真实玩家消息开新槽 `turn = nextTurn` 后 `nextTurn++`。上限裁剪只裁 `turns` 数组，不动计数器。
2. **seedTurns 固化**：`init(header, inheritedEventCount)` 存 `inheritedEventCount` 入 state（新增字段，schema `int min 0`）。`apply` 中首个 `seq >= inheritedEventCount` 的真实玩家消息到来时，若 `firstLocalTurn` 未设，置 `firstLocalTurn = 该消息的 turn`。
3. **上限裁剪保护**：新增槽导致超 TURN_CAP 时，保留窗口 = 末尾 CAP 条 **∪** `turn ∈ forkCuts` **∪** `turn = seedTurns-1`（若有）。被保护的条目若已在窗口外，保留在原序（实现：filter 而非 slice）。
4. **徽标对齐优先级**：payload 携带状态时——
   a. `worldStateTimelineBatch.provenance.storyTurn` 命中 `turns` 中的槽 → 写该槽；
   b. 否则 `stateFoldSeq` → 找最后一个 `seq <= stateFoldSeq` 的槽写入；
   c. 否则写尾节点（旧行为兜底）。
   同时把 meta（actor/origin/changeCount，batch 提供时）写到同槽。`summaryTurn` 同理对齐剧情罗盘行（命中槽写 `badge.summary`，同批 worldState 徽标合并写同槽）。
5. **徽标全量重建**：`badgeFromState` 改为纯函数 `badgeFromState(worldState, summary?)`，**不合并旧徽标**：location/time/affinity/summary 每次从 payload 当前值重建；无 scene/无角色/无 summary 则对应字段缺席。`pending` 同理全量重建。
6. **切口标记折叠**：`payload.worldlineForkCut` 非 null → `forkCuts = [...forkCuts, turn]`（去重）。
7. 既有行为保留：system-reminder 不开槽；插件通知跳过；assistant 取最后文本块；无关事件返回同引用。

## 4. fork 感知与切口发布（`src/index.ts` + `src/state-publisher.ts`）

- 新生命周期监听 `session/created`（整体 try/catch，AGENTS.md 硬约束）：`header.parentSession` 存在 && `header.isSeeded` && `origin !== 'subagent'` → 判定为 fork。
- 经 `state-publisher` 既有通道向**父线** `Session.append('user/message', { source: { kind:'plugin', plugin:'dsh-rrp', rrp: { worldlineForkCut } } })`（复用 publishState 的 envelope 形态；content 为简短通知文本，与既有插件通知一致）。内容**不进 Author 视野的注入通道**——publishState 只追加日志，不注入上下文（与状态发布同纪律）。
- **转录护栏**：transcript 投影的 payload 分支当前对**任何** payload 消息推进 `lastStateSeq`（Chronicler 的「已预订水位」）。切口标记必须**不**推进该水位——transcript 改为仅当 payload 携带 `worldState`/`summary`（状态承载键）时才推进 `lastStateSeq`，否则原样返回。漏掉这一条会导致 Chronicler 跳过未推演正文。
- `turn` 计算：父线 live digest（`projections.stateOf(parent, WORLDLINE_DIGEST_KEY)`）中最后一个 `seq < child.inheritedEventCount` 的槽 → `turn = 其 turn + 1`；无命中（切口超出保留窗）→ `turn: null`。
- 幂等：同一 child 只发一次（内存 Set 即可，重启后重复发布无害——digest 去重 forkCuts）。

## 5. 拓扑折叠与路由（`src/worldline-tree.ts` / `src/worldline-route.ts`）

1. **seedTurns 直读**：live 会话 `seedTurns = seedTurnsOf(digest)`，**不再数条目**。digest 缺席（非 RP/异常）→ 该会话不入图（现状同）。
2. **挂载**：子线挂父线 `turn === seedTurns-1` 的节点；命中失败 → 沿祖先链向上找首个含该回合的 live 祖先（既有 findNodeInLineage 逻辑保留）；仍失败 → 挂最近已知祖先尾部 + `seedKnown: false`。`seedTurns === 0`（fork at turn 0 / 无法确定）→ 提升为 root。
3. **headTurn/isHead**：fact 带 `headTurn`（live = digest 末槽 turn）；折叠时该会话每个节点 `isHead = node.turn === headTurn`。route 响应注释说明客户端用 `sessionId === 当前 && isHead` 标当前位置。
4. **冷线精确定位**：`collectSkeletonFacts` 对每个冷 RP 会话经 `sessionQuery.readSession(id)` 读 `inheritedEventCount`（限并发 4）：
   - 父线 live 且父 digest 能解析切口（同 §4 算法）→ `seedTurns` 已知，精确挂载；
   - 否则 `seedKnown: false`，按谱系挂最近已知祖先；
   - readSession 失败 → 退化为现状行为（尾部挂载 + seedKnown false）。
   冷对冷：链式按谱系挂载，全部 seedKnown false。
5. **健壮性**（全部补测试）：live `collectFacts` 每会话独立 try/catch（单会话失败不拖垮全图）；`inheritedEventCount` 校验 `Number.isSafeInteger && >= 0`，非法按 0 处理；stub 挂接与 markForks 加 visited 防环；重复 id 诊断（后者覆盖前者并 console.warn）；跨卡 parent 守卫——child 挂 parent 前校验同卡，异卡则 child 提升为 root 并 seedKnown false。
6. **store 修复**：`listHidden` 在 table 无 `keys` 时退化为 `entries()` 遍历（当前直接返回空数组的隐患）；内存兜底保留。

## 6. 客户端重写（`src/client/worldline-tab.tsx` 及 components/）

### 6.1 布局（双栏，会话视图第三页签不动）

```
┌─ 分支列表（左栏，可窄） ──┬─ 回合列（右栏，主区） ─────────┐
│ [卡名分组]                │ T38 ▶ 当前  玩家摘要…          │
│  ▸ 主线  T38 📍          │     正文摘要… [徽标] [归因]      │
│     线1  T12             │ T37  玩家摘要…                 │
│     线2  T27  (冷)       │     …（虚拟化，倒序或正序待定）  │
│  ▸ 另一卡…               │  [从此分叉] 悬浮于选中节点       │
└──────────────────────────┴────────────────────────────────┘
```

- **左栏**：按卡分组（Q15:A）；每分支显示标题、最新回合号、最近活动时间（`updatedAt` relative）、节点徽标精简（地点 + 最高好感）；冷线带「冷」标记；隐藏分支归入组底「已收起（N）」区，可逐个恢复（恢复入口，D24 决策 7）。
- **右栏**：选中分支的回合列。每节点：回合号、玩家摘要、正文摘要（截断 + 悬停全文 title）、节点徽标（地点/时间/好感前三/剧情罗盘行）、归因行（修改者 + inherited/local + 变化数，meta 缺席则不显示）。虚拟化渲染（视口 ±5 缓冲），长会话无压力。
- **当前位置**：`sessionId === 当前会话 && isHead` 的节点高亮「当前回合」（Q9:A）。当前会话的整条链在左栏高亮。

### 6.2 交互闭环

- **查看该回合**（节点默认点击，Q5:A）：回合列内展开/聚焦该回合详情（玩家原文 + 正文原文从哪来？——digest 只有截断。规格决定：展开显示 digest 内的截断全文 + 提示「完整正文请打开会话查看」；真机后视效果再迭代）。**修正**：digest 的 PROSE_CHARS=400 对详情够用，玩家 120 字符详情偏短——详情展开时这两个预算保持原值，一期不扩。
- **从此分叉**（选中节点悬浮操作）：确认层 → 输入框预填自动命名（`branchTitle` 语义：父标题 + ·线N，N = 服务端树中该父的真实子线数，**不再客户端轮询统计**）→ `sessions.fork({sessionId, atSeq, increaseTitle:true})` → 成功后 `uiWorkspace.openSession(childId)`；命名失败不阻塞（宿主已 increaseTitle）。
- **重命名**：分支 hover 操作 → 输入框 → `sessions.binding(id).session.rename(title)`；binding 未就绪时报错提示（替代旧 8×400ms 静默轮询）。
- **收起**：分支 hover 操作 → 确认层（明示「将收起该线及其 N 条下游」）→ POST hidden:true → 移入「已收起」区；POST 检查 response.ok，失败提示。
- **恢复**：「已收起」区分支 → 恢复 → POST hidden:false → 移回。
- **冷线**：点击冷线分支 = `openSession`（宿主加载）；加载完成后该会话投影驱动自动出现在图中（订阅覆盖，见 6.3）。加载前回合列显示占位「打开该线后展示回合历史」。
- **导出**：保留现有整会话导出按钮（分支 hover 操作）。

### 6.3 自动刷新（Q14:A）

- 世界线视图经 `useProjection(WORLDLINE_DIGEST_KEY)`（SessionStandardProps 注入面已有）订阅**当前会话** digest；`sessions.list.subscribe` 保持（roster 变化）。
- 组件内状态：当前会话 digest 变化 → 重新组装当前卡树；其余卡树仍走 `loadTrees()`。真机验证 roster 在 fork 后是否推送；不推送则由 projection 变化 + 分支操作后手动 `loadTrees()` 兜底（fork/hide/restore 操作后必刷）。

### 6.4 删除

- 删除 `src/client/components/worldline-flowchart.tsx`、`worldline-inspector.tsx`、`worldline-layout.ts` 及对应测试 `tests/worldline-layout.spec.ts`。
- 全部玩家可见文案走 locale（既有 locale 文件增补 worldline 段；禁硬编码中文/emoji——GLOSSARY 标准名）。

## 7. 测试计划

- `tests/worldline-digest.spec.ts` 重写扩展：绝对回合号跨 cap 连续；seedTurns 固化；徽标对齐三优先级（storyTurn / stateFoldSeq / 尾节点兜底）；异步跨回合场景（payload seq 落后多个回合）；徽标删除语义（scene 消失 → location 缺席）；meta 写入；forkCuts 折叠与 cap 保护；worldlineForkCut turn:null 忽略。
- `tests/worldline-tree.spec.ts` 扩展：seedTurns 直读（不再数条目）；isHead 标记；seedKnown false 挂载语义；跨卡 parent 守卫；stub 防环；非法 inheritedEventCount。
- `tests/worldline-route.spec.ts` 扩展：冷线 readSession 精确切口；readSession 失败降级；单会话投影失败不拖垮全图；store keys 缺失兜底。
- 新增 `tests/worldline-fork-marker.spec.ts`（如监听器独立成模块）：fork 判定（isSeeded/subagent 过滤）、切口 turn 计算、幂等。
- 客户端组件测试：项目现有先例（world-state 组件有测试则跟随；无则靠真机验收 + 抽取纯函数测）。

## 8. 验收（真机，内置浏览器）

1. 长会话（>500 回合可造数据或降 cap 临时验证）fork 子线挂载正确。
2. Chronicler 异步完成后面板自动出现徽标，且挂在正确回合。
3. 冷支线精确挂在真实分叉回合；超窗冷线显示「位置未知」。
4. 分叉确认 → 命名 → 新线出现并可重命名、可收起、可恢复。
5. 当前回合精确高亮；切会话后正确切换。
6. 全量质量门：`pnpm run check:environment && pnpm run format:check && pnpm run typecheck && pnpm run lint && pnpm test --silent && pnpm run build && git diff --check`。

## 9. 风险与对策

| 风险 | 对策 |
| --- | --- |
| stateVersion 4 使旧会话 digest 缓存失效重折 | 预期行为（宿主丢弃旧 checkpoint）；重折成本一次性 |
| `sessionQuery` 缺失（老宿主） | 冷线退回现状降级（seedKnown false），live 图不受影响 |
| roster 不推送 fork 变化 | 操作后显式 loadTrees + projection 订阅双保险 |
| readSession 冷线日志巨大 | 限并发 4 + 仅 RP 冷会话 + 一期接受（冷线数量少） |
| worldlineForkCut 追加父线日志 | 与状态发布同纪律（不注入上下文、指纹去重），Author 不可见 |
