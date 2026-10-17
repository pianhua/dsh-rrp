# 票据 06：开局预写回合 vs loop 冻结计数器——会话冷读被拒（生产级）

> Status: open · 发现于 play-e2e 票据 04 交付现场（2026-10-17）· 阻塞：票据 04 的「宿主进程内冷读」验收项

## 症状

画廊开局（create → select → POST /dsh-rrp/start → prompt）玩出的会话，**热进程内一切正常**；
一旦冷读（宿主重启后 `sessionQuery.observeSession` / UI 恢复 / 任何持久层重放）即被拒：

```
SessionFormatError: turn/start does not open the expected turn
→ SessionQueryError: stored session "…" is corrupt: stored log is corrupt
```

日志本身一个字节没坏——是宿主 v4 准入折叠器在拒。

## 根因（三层叠加，每层单独都合法）

1. **开局路由预写回合**（`src/start.ts:78-147`）：V4 受保护头要求首个 surface 事件是
   `system/message`，且 surface 消息必须挂在 turn/step 支架内（宿主准入
   `requireStep` 对 system/assistant message 强制）。所以开局必须追加
   turn 1（头）与 turn 2（开场白）两段**闭合**回合。
2. **loop 回合计数器在组合时冻结**（`dsh-agent-loop` 构造函数：
   `phase.lastTurn = stateOf(session,'turnBoundary')?.lastTurn ?? 0`，之后
   `turn()` 永远是 `phase.turn + 1`）：agent 在 preset 选择时组合（画廊顺序里
   这早于 start 的追加），彼时 turnBoundary=0 → **首个玩家回合被编号为 turn 1**。
3. **准入要求回合号严格连续**：`turn/start` 必须满足 `data.turn === nextTurn`，
   nextTurn 随每次 turn/end +1。turn 1、2 已闭合（nextTurn=3）之后又来
   `turn/start turn:1` → 拒读。

另有一条已实测的封锁：`agentPresets.select` 在 `lastTurn > 0` 后抛
`agent-preset/locked`（"This session has already started"）——**preset 不能挪到
start 之后选**；`create({agentPreset})`（controller 入参）也在 create 时即组合。
两条时序路都被宿主焊死，碰撞是结构性的。

## 为什么生产一直没炸

热进程不跑准入折叠器（追加时只做行级校验）；冷读才跑。play-e2e 票据 04 的重启
验收是第一条真实冷读路径——此前 `rp-dev` profile 已蒸发，真机现场不存在，
等于没有人走到过冷读这一步。

## 影响面

- 每个画廊开局 + 玩过至少一个回合的会话：宿主重启后侧边栏恢复/冷读投影即报 corrupt。
- `stateFoldSeq` 等数据本身完好（票据 04 已证：日志独立折叠与投影逐字节一致），
  坏的是宿主读入路径。

## 候选修复（开工前必须出规格 + ADR，横跨客户端、start 路由、宿主接缝）

- **A. 懒开局**：start 路由不写回合；头/开场白/卡事实由首个 loop 回合的
  pre-step 钩子物化（V4 首面事件不变，「开场白在 turn 2」的设计语义改变）。
  风险：回合内追加与请求前缀组装的时序、前缀缓存对齐、Chronicler 触发边界。
- **B. 回合号让位**：开局回合编号从 loop 冻结计数器推导（读同一投影，+1/+2），
  需要 loop 首个回合不与预写回合撞号——宿主计数器不可控，此路基本不通。
- **C. 宿主侧修**：loop 改为每次 turn() 现读投影（不修缓存）——vendor 代码，越界。

倾向 A，但它动 V4 语义与提示词前缀形状，必须先规格化（30+20 拷问节奏）。

## 验收（issue 06 自己的）

- 画廊开局玩一局 → 宿主重启 → `observeSession` 冷读成功，投影与热进程一致；
- play-e2e 票据 04 的重启相从「磁盘独立折叠」升级回「宿主重放断言」
  （`tests/e2e/playthrough.spec.ts` 里被注释替代的那段 observed-events 断言）；
- 全量质量门 + build 通过。

##  reopen 条件

若宿主某版本把 loop 计数器改为现读（候选 C 由 vendor 落地），本票据重估。
