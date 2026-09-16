# CONTEXT_PUBLISHER_VERIFY.md — 上下文发布核验单（**已修正：append 优先于 replace**）

> ⚠️ **重大修正（2026-09-16）**：本单最初验证的 **replace** 方案，虽然把 surface 压到 1 份，
> 但**摧毁了前缀 KV 缓存**（同一批会话实测：命中率从 ~90% 掉到 ~14%，`cacheRead` 卡在 1024）。
> **已改回 append**，并保留「卡包只注入一次」这个真正的改进。正确目标见 **§10**。
> §1–§9 保留为那次实验的历史记录（其结论已被 §10 取代）。

> 交给能驱动 Chrome 的测试 Agent。本单只做验证，**不要改代码**。

---

## 0. 一句话背景

原先每轮的状态注入都被宿主以 \`surfaceOp:'append'\` 追加成一条 \`user/message\`，
10+ 轮后历史里堆了十几份**过时状态**。新实现改用 surface 的 \`replace\` **就地取代**上一条。
工具：\`scripts/inspect-context.mjs\`（已自证有效）。

---

## 1. 前置

- [ ] 实例在跑：\`dsh --profile rp-dev --port 3099 --no-open\`，用日志末尾 token URL 打开；
- [ ] 启动日志含：\`[dsh-rrp] durable context publisher armed for preset rp\`；
- [ ] 代码版本 ≥ commit \`0df2948\`（\`cd /d/projects/dsh-rrp && git log --oneline | head -1\`）。

---

## 2. 工具自证（基线对照，先证明工具能测出累积）

\`\`\`bash
cd /d/projects/dsh-rrp
node scripts/inspect-context.mjs '/c/Users/10697/.dsh/sessions/--D-projects-dsh-rrp--/session-1e6f8e52-0266-45a6-a39a-ccf6ad3b4fa8/session.v3.jsonl.zstd'
\`\`\`

**期望（修复前的旧会话）**：

\`\`\`text
dsh-rrp context messages ON SURFACE: card=15  facts=0
replace-shaped context events      : 0
\`\`\`

> 这是"证明工具有效"的对照组，**不是失败**。旧会话本就是累积的。

---

## 3. 浏览器操作（新建一局，玩 5 轮）

1. 左侧「卡片展厅」→「女仆大小姐」→「开始这一局」；
2. 依次发送（可照抄）：
   1. 「先进来吧，外面走廊冷。」
   2. 「你表姐说的煎饼果子摊破产……是真的吗？」
   3. 「那你会做家务吗？先把衣服洗了吧。」
   4. 「走吧，跟我下楼买点东西。」
   5. 「房东说要涨房租，这月工资又不够。」
3. 每轮等正文与右侧「最近变更」完成。

---

## 4. 浏览器内检查

- [ ] 正文正常：第三人称、不代打玩家、不主动剧透千金身份；
- [ ] 右侧「世界状态」每轮更新；「最近变更」出现 `纪事官 · 已更新状态` + 摘要；
- [ ] 切到「沉浸」Tab 正常，工具/系统节点被过滤；
- [ ] Console **无红色报错**。

---

## 5. 服务端日志检查（判定 replace 是否被宿主接受）

在跑 dsh 的终端输出里搜索：

\`\`\`text
context replace rejected
\`\`\`

- [ ] **没有任何匹配** → replace 被宿主接受（✅ 预期）；
- [ ] 出现 `context replace rejected; appending instead:` → replace 被拒、已**自动回退为 append**（功能不坏，但本次目标未达成，记录并回报）。

---

## 6. 关键量化检查（决定成败）

\`\`\`bash
node scripts/inspect-context.mjs --latest
\`\`\`

（\`--latest\` 自动选最近修改的会话文件；也可显式传路径。）

**期望（修复后）**：

\`\`\`text
dsh-rrp context messages IN LOG    : card=1   facts=5      <- 日志里旧副本仍在（replace 只遮蔽）
dsh-rrp context messages ON SURFACE: card=1   facts=1      <- 关键：surface 上只有 1 份
replace-shaped context events      : >= 1                   <- 证明确实发生了 replace
VERDICT: replace WAS accepted ...
\`\`\`

> 注意：**决定成败的是 ON SURFACE 那一行**，不是 IN LOG。
> replace 不删除日志，只在模型可见面上遮蔽旧节点——这是 DSH 的设计。

---

## 7. 判据

| 结果 | 判定 |
| :--- | :--- |
| `ON SURFACE: card=1 facts=1` 且 `replace ≥ 1` | ✅ **PASS**（目标达成） |
| `ON SURFACE: facts>1` 且日志**无** rejected | ❌ **FAIL**（replace 没发出） |
| 日志有 rejected 且 `ON SURFACE: facts>1` | ⚠️ **宿主拒绝 replace**（回退生效；需改走 diff 方案 B） |
| 正文/面板异常、Console 报错 | ❌ **功能性 FAIL**（优先回报） |

---

## 8. 失败时请回传

1. `node scripts/inspect-context.mjs --latest` 的**完整输出**；
2. 服务端日志里所有含 `[dsh-rrp] context` 的行（尤其 rejected）；
3. 浏览器 Console 报错原文；
4. 会话 id（第 1 行输出会打印）。

---

## 9. 附加检查（可选，但很有价值）

- [ ] **矫正路径**：第 5 轮后，在右侧把「米娅·好感」改成一个夸张值并保存；再发一句行动，确认作者按新值起笔；
- [ ] **重启认领**：停掉再重启实例，对同一会话再玩 1 轮，再跑 `--latest`，`ON SURFACE: facts` 仍应为 **1**（证明重启后不重复追加卡包、并继续 replace）；
- [ ] **旧会话不受影响**：旧会话仍显示多份（历史既定），新会话才是修复对象。

---

## 验证结果（2026-09-16 · Chrome 测试 Agent · submit ea2993a）：**全部 PASS**

| 项 | 实测 | 判定 |
| :--- | :--- | :---: |
| ① 工具基线（旧会话） | `ON SURFACE: card=15 facts=0`，`replace=0` | ✅ |
| ② 新局 5 轮游玩 | 5 轮推进自然 | ✅ |
| ③ 浏览器体验 | 第三人称/不代打/不剧透、面板与归因每轮更新、沉浸 Tab 纯净、Console 0 红字 | ✅ |
| ④ 宿主接受 replace | **无** `context replace rejected` | ✅ |
| ⑤ 核心量化 | `IN LOG: card=1 facts=8` / **`ON SURFACE: card=1 facts=1`** / `replace=7` | 🏆 |
| ⑥ 矫正 + 重启认领 | 好感 88→91（触发 replace）；`findOwned` 认领 card=seq9 / facts=seq102 | ✅ |

**replace 链**（每一步都遮蔽上一条，surface 只留最新）：

```text
seq 10  append                                     on-surface=false
seq 34  {op:replace,start:10,end:10}               on-surface=false
seq 46  {op:replace,start:34,end:34}               on-surface=false
seq 58  {op:replace,start:46,end:46}               on-surface=false
seq 75  {op:replace,start:58,end:58}               on-surface=false
seq 87  {op:replace,start:75,end:75}               on-surface=false
seq 90  {op:replace,start:87,end:87}               on-surface=false   <- 玩家矫正触发
seq 102 {op:replace,start:90,end:90}               on-surface=true    <- 唯一可见
```

**结论（已被 §10 修正）**：replace 把 surface 压到 1 份，但**代价是缓存崩塌**（见 §10 的实测对照）。

---

## 10. 修正后的正确目标与实测（append 方案）

### 10.1 为什么 replace 是错的

Provider 是**前缀 KV 缓存**：请求只有和上一轮**逐 token 相同的开头**才命中。
- **append** 保留注入消息的**位置**，所以「上一轮请求」是「下一轮请求」的前缀 → 高命中；
- **replace** 把旧消息**移除**、新消息追加到**末尾**，位置发生搬移 → 下一轮从旧位置起全部作废。

### 10.2 同一批会话的实测对照（`node scripts/inspect-context.mjs --usage <会话文件>`）

| 方案 | 会话 | 命中率走势 |
| :--- | :--- | :--- |
| append（旧 pre-step） | `session-1e6f8e52…` | 44% → 71% → 84% → **90%**（cacheRead 涨到 23,552） |
| replace | `session-aa9f5b65…` | 44% → 20% → **14%**（cacheRead 卡死在 1,024） |

### 10.3 修正后的实现

- **append，绝不 replace**（`src/context-publisher.ts`，测试含"永不发出 replace"的守卫）；
- **按内容去重**：卡包（会话恒定）只 append 一次；事实（摘要+状态）仅在变化时 append；
- **接受上下文增长**：旧副本会留在历史里，但它们是**被缓存**的；真正新增的未缓存 token 每轮很小。
  宿主 compaction 会在压力时把它们折叠。

### 10.4 修正后的验收判据

```bash
node scripts/inspect-context.mjs --usage --latest
```

| 指标 | 期望 |
| :--- | :--- |
| 缓存命中率 | 第 3 轮后应稳定在 **80%+**，并随轮次上升到 ~90% |
| `cacheRead` | 应随轮次**持续增长**（不再卡在 1024） |
| replace 形状事件 | **0**（`inspect-context.mjs` 默认输出） |
| 卡包上下文 IN LOG | **1**（不随轮次增长） |
| 事实上下文 IN LOG | 随轮次增长（append 方案的预期行为，不再要求 =1） |

> 注意：本方案**不追求** surface 上只有 1 份状态；那是 replace 的诱人陷阱。
> 我们追求的是**缓存连续 + 卡包不重复**，上下文增长交给宿主 compaction。
