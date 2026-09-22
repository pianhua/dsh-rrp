# CHROME_TEST_PLAN.md — Chrome 浏览器 Agent 全量真机测试内容表

> **执行者**：Chrome Testing Agent（浏览器自动化，可点击/输入/读屏/抓 Console/执行 fetch）
> **被测版本**：dsh-rrp @ `HEAD`（0.1.6-alpha.2 基线，commit 以 `git log --oneline -1` 为准）
> **测试日期**：____-__-__
> **核心目标**：真机复验 R1–R20 客户端与宿主交互改动（COMPLETED_WORK §5 待验清单），并补齐 MANUAL_TEST §8–§10 从未被浏览器 Agent 确认过的用例。
> **结论表**：测试结果概览 / 缺陷分级 / 验收结论三选一，写在本文件末尾「测试记录回填区」。

---

## 总览

| 编号 | 模块 | 覆盖重点 | 优先级 | 预计耗时 |
| :--- | :--- | :--- | :--- | :--- |
| T1 | 启动冒烟 | 6 投影注册、就绪日志、boot graph | P0 | 5 min |
| T2 | 卡片展厅 | 双卡展示、搜索、R18 刷新保留选卡 | P1 | 10 min |
| T3 | 开卡开局 | 开场白/初始状态、R9 新卡免重载、API 鉴权 | P0 | 15 min |
| T4 | 正文与纪事官 | 不代打、R10 连轮并发、R11 推送、R14 notice 过滤 | P0 | 30 min |
| T5 | 玩家矫正 | R12 无 diff 短路、越界 clamp、403、下一轮生效 | P0 | 20 min |
| T6 | 动态字段 | D5 增删改、重名/非法 ID 守卫、clamp、F5 持久化 | P1 | 15 min |
| T7 | 大局编年 | R17 `/summary every N`、开关隔离、**重启复位遗留问题** | P1 | 25 min |
| T8 | 典籍 D8 | 起草/确认/丢弃、#1 Scribe cancel 回归、双存档隔离、API 全套 | P0 | 30 min |
| T9 | 世界线 Fork | 继承、分流、零幽灵、OPEN_TURN 边界 | P0 | 20 min |
| T10 | 运行时卸载/重载 | R1 投影注销、重复 3 次无泄漏 | P1 | 15 min |
| T11 | 宿主整洁 | 对话区无 rrp 事件泄漏、开场白免刷新、主题切换无残留 | P1 | 10 min |
| T12 | 稳定性 | 12 轮精简长线（token/条目数曲线）、5 会话切换 | P1 | 40 min |
| T13 | 响应式 | 1920/768/375 三档无水平溢出 | P2 | 10 min |

---

## §0 测试环境与红线

### 0.1 启动（由人类或 Agent 在 bash 执行）

```bash
cd /d/projects/dsh-rrp
git log --oneline -1          # 记录被测 commit
pnpm run typecheck && pnpm test   # 基线必须全绿才开始
pnpm run build
dsh --profile rp-dev --port 3099 --no-open
```

- 打开启动日志末尾打印的 `http://127.0.0.1:3099/?token=…` 链接（token 必须带）。
- **绝对禁止访问 `http://127.0.0.1:3080`**（那是日常环境，不是被测对象）。
- 需要新卡文件时（T3-R9），让人类把附录 C 的 `cards/test-probe/` 放进仓库后**只需刷新展厅**，严禁重启宿主。

### 0.2 启动日志就绪标志（T1 断言用，逐条核对原文）

```text
[dsh-rrp] RP preset refreshed at <dshHome>\.agent-presets\rp
[dsh-rrp] WorldState projection registered (key rrpWorldState)
[dsh-rrp] macro-summary projection registered (key rrpSummary)
[dsh-rrp] RP settings projection registered (key rrpSettings)
[dsh-rrp] sediment projection registered (key rrpSediment)
[dsh-rrp] active-card projection registered (key rrpCard)
[dsh-rrp] transcript projection registered (key rrpTranscript)
[dsh-rrp] Chronicler armed for preset rp
[dsh-rrp] sediment runtime armed (worldline scoping via agent.ctx + Session projection)
[dsh-rrp] sediment route armed at /dsh-rrp/sediment
[dsh-rrp] player correction route armed at /dsh-rrp/world-state
[dsh-rrp] card routes armed at /dsh-rrp/cards and /dsh-rrp/cards/one
[dsh-rrp] card start route armed at /dsh-rrp/start
[dsh-rrp] activity route armed at /dsh-rrp/activity
[dsh-rrp] RP skills visible (0): (none)
[dsh-rrp] card preset 'rp-maid-heiress' skills (6): maid-apartment, maid-cecilia, maid-family, maid-mia, maid-tone-rules, maid-world-setting
[dsh-rrp] card preset 'rp-yanmen-inn' skills (3): inn, old-sword, world-setting
[dsh-rrp] /lore command armed
[dsh-rrp] Summarizer armed for preset rp (cadence configurable via /summary every N)
[dsh-rrp] /summary toggle armed
```

### 0.3 红线（违者结果作废）

1. 只读观察，**绝不修改任何代码或配置**；发现缺陷只记录（格式见附录 B）。
2. 不点日常环境的任何链接；不关闭宿主（T10 以外的卸载/重载除外）。
3. 每个 Session 的 ID 必须记录（URL 或 `GET /dsh-rrp/activity` 反查）。
4. 截图统一存 `docs/reference/acceptance-screenshots/`，命名 `NN-描述.png`（NN = 两位序号，与下表用例编号无关，全局递增）。

---

## T1 启动冒烟（P0，5 min）

**目标**：宿主 + 插件组合健康，6 个投影单元全部注册。

#### 测试步骤
1. 按 §0.1 启动宿主，等日志不再滚动。
2. 逐条核对 §0.2 的 16 条就绪标志。
3. 浏览器打开带 token 的首页，按 F12 打开 DevTools → Console。
4. 在 Network 面板刷新页面（F5），在请求列表中找到 boot/资源加载序列，确认含 `dsh-rrp/client.js`。

#### 验收标准
- [ ] §0.2 的 20 条就绪标志全部出现（个别行措辞允许微差，但 6 个 projection key 必须齐全：`rrpWorldState` / `rrpSummary` / `rrpSettings` / `rrpSediment` / `rrpCard` / `rrpTranscript`）
- [ ] 页面加载后 Console 0 error
- [ ] boot 序列含 `dsh-rrp/client.js`

#### 必记数据
- 被测 commit：`____`
- 缺失/异常的启动日志行（原文照抄）：`____`
- Console error 数：`____`

#### 测试记录
- 实际行为：
- 截图路径：
- Console 错误：

---

## T2 卡片展厅（P1，10 min）

**目标**：展厅面板完整展示两张官方卡；R18「刷新保留当前选卡」回归。

#### 测试步骤
1. 在宿主左栏导航找到「**卡片展厅**」入口，点击进入。
2. 核对卡列表：应有两张卡——「女仆大小姐」（maid-heiress）与「雪夜雁门客栈」（yanmen-inn）。
3. 点选「雪夜雁门客栈」，核对详情区：简介、标签（武侠/悬疑/江湖/群像）、玩家角色（无名客）、世界知识技能 **3** 个（inn / old-sword / world-setting）、开场白预览（含 `{{player.name}}` 已插值为「无名客」）。
4. 在搜索框输入「女仆」→ 只剩女仆大小姐；输入「不存在的卡」→ 显示「没有匹配的卡包」；清空搜索 → 恢复两张。
5. **R18 回归**：保持选中「雪夜雁门客栈」，点展厅「刷新」→ 详情区仍是雁门客栈（选卡不丢）。
6. F12 Console 执行：
   ```js
   fetch('/dsh-rrp/cards').then(r=>r.json()).then(j=>console.log(JSON.stringify(j).length, j.cards?.length ?? j.length))
   fetch('/dsh-rrp/cards/one?id=yanmen-inn').then(r=>r.json()).then(j=>console.log(j.name, j.skills?.length))
   ```

#### 验收标准
- [ ] 两张卡都在列表，封面/名称/简介渲染正常
- [ ] 雁门客栈详情：3 个技能、开场白预览含插值后的玩家名
- [ ] 搜索过滤与空态文案正确
- [ ] 刷新后选卡保留（R18）
- [ ] `GET /dsh-rrp/cards` 返回 2 张卡；`GET /dsh-rrp/cards/one?id=yanmen-inn` 返回 name=雪夜雁门客栈、skills=3

#### 必记数据
- `/dsh-rrp/cards` 响应体大小（bytes）：`____`
- 雁门客栈 `skills` 数组原文：`____`

#### 测试记录
- 实际行为：
- 截图路径：
- Console 错误：

---

## T3 开卡开局（P0，15 min）

**目标**：开卡流端到端正确；R9「新卡免插件重载直接开局」；API 鉴权拦截。

#### 测试步骤
1. 展厅选中「女仆大小姐」，点「**开始这一局**」。
2. 等待新会话建立，自动切到对话区：**会话标题 = 卡名**；开场白为正文第一条（以 {{player.name}} 插值后的玩家名起笔）。
3. 开右栏「**世界状态**」页签：四大维度已有初始值（角色含 Cecilia/米娅等，物品/场景/事件非空）。
4. 看「最近变更」区：第一条为「卡包 · 初始状态」归因。
5. 记录 Session ID。Console 执行（数据断言）：
   ```js
   fetch('/dsh-rrp/activity?sessionId=<SID>').then(r=>r.json()).then(j=>console.log(JSON.stringify(j).slice(0,500)))
   ```
6. **API 鉴权**：Console 执行（把 cardId 换成不存在的）：
   ```js
   fetch('/dsh-rrp/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cardId:'no-such-card'})}).then(r=>console.log(r.status,r.statusText))
   ```
7. **R9 新卡免重载**：让人类把附录 C 的 `cards/test-probe/` 放入仓库（宿主保持运行、不重启）。回到展厅点「刷新」→ 列表出现「探针测试卡」(test-probe) → 直接「开始这一局」→ 新会话开场白为探针卡开场白、世界状态含探针字段。

#### 验收标准
- [ ] 新会话标题 = 「女仆大小姐」，开场白为第一条正文
- [ ] 世界状态初始填充完整；最近变更首条 = 卡包·初始状态
- [ ] `GET /dsh-rrp/activity?sessionId=` 返回初始状态账本条目
- [ ] 错误 cardId → HTTP 400（响应体含 `card does not match` 类错误）
- [ ] **R9**：放新卡后仅刷新展厅即可开局，无需重启宿主；开场白/初始状态来自探针卡
- [ ] 若开局失败：应看到「未能自动清理的残留会话」提示且报错含会话 id（R4 孤儿回收的可见面），记录现象

#### 必记数据
- 新 Session ID（女仆局）：`____`；探针局 Session ID：`____`
- 开场白首行原文（截 100 字）：`____`
- 初始 WorldState 各维度条目数：角色 `__` / 物品 `__` / 场景字段 `__` / 事件 `__`
- 错误 cardId 的 HTTP 状态码 + 响应体：`____`

#### 测试记录
- 实际行为：
- 截图路径：
- Console 错误：

---

## T4 正文与纪事官主线（P0，30 min）

**目标**：Author 不代打；Chronicler 推演闭环；**R10 连轮并发守卫**；**R11 推送优先链路**；R14 plugin notice 过滤。

#### 前置
- T3 的女仆局会话（至少已开局 1 轮）。

#### 测试步骤
1. 在输入框发送第 1 条玩家行动（建议短句，如「我打量了一下房间，向 Cecilia 问好」）。
2. 观察正文流式输出；读完全文，检查：**没有出现替玩家决定动作/对白/心理的段落**（第三人称只写 NPC 与环境）。
3. 正文完成后，右栏世界状态区状态文案应经历「纪事官推演中，请稍候...」→「纪事官已更新状态」；「最近变更」新增一条「纪事官 · 已更新状态」+ 人类可读摘要。
4. 对比推演前后 WorldState：至少一个字段发生变化（如 scene.time 前进、好感度变化），记录 修改前→后 对照。
5. **R14 回归**：对话区不应出现任何 `rrp/*` 事件可见条目或插件 notice 气泡（开场白降级提示也不应混入 transcript——观察「最近变更」里没有把 notice 记成玩家发言的条目）。
6. **R11 推送链路**：打开典籍页签保持可见；触发一次沉淀（见 T8 步骤 2）→ **不手动刷新**，观察列表是否在 job 完成后自动出现草稿（推送优先）；若 2s 内无反应再手动刷新对比。
7. **R10 连轮并发**：连续快速发送 2 条玩家行动（第 1 条发送后 1–2 秒内发第 2 条，趁纪事官仍在推演）。
8. 等两轮正文与推演全部落定后检查：
   - 世界状态 = 两轮变化的合流结果（无任何一轮的变动丢失）；
   - 「最近变更」可顺序解释两轮推演（允许出现「推演已作废 / stale」条目——玩家未矫正时不应出现 stale）；
   - 无 console error、无面板卡死。
9. **静默失败观察（LONG_PLAY §3.4 遗留）**：若某轮推演失败，右栏应出现「推演失败」条目（phase.failed）而不是毫无提示——如本轮未自然发生，记录「未触发，留待缺陷复现时验证」。

#### 验收标准
- [ ] 正文零代打（逐轮检查，共 3 轮）
- [ ] 每轮推演闭环：推演中 → 已更新状态 → 最近变更出现摘要
- [ ] WorldState 每轮有合理变动，前后值记录完整
- [ ] 对话区无 rrp 事件/notice 泄漏（R14）
- [ ] 典籍列表 job 完成后自动刷新（R11 推送生效；宿主不注入座位时 2s 轮询 fallback 允许）
- [ ] 快速连轮 2 条：状态无竞写、两轮变化都落盘、无重复/丢失（R10）
- [ ] 全程 Console 0 error

#### 必记数据
- 每轮：玩家输入原文（≤50 字）/ 正文是否代打（Y/N）/ 推演前→后字段对照 / 账本 phase 序列
- 连轮测试两次发送的间隔秒数：`____`
- 连轮后 WorldState 关键字段终值：`____`
- 每 3 轮底栏 token 读数（T12 用表）：轮 3 = `____` tok

#### 测试记录
- 实际行为：
- 截图路径：
- Console 错误：

---

## T5 玩家矫正（P0，20 min）

**目标**：就地矫正写路径全链路；**R12 无 diff 短路**；越界 clamp；非 RP 会话 403；下一轮 Author 以矫正值起笔（Last-Write-Wins）。

#### 前置
- T4 已完成的会话（记 SID）。

#### 测试步骤
1. 右栏「世界状态」→ 场景区「地点」字段，把当前值改为一个显著不同的新值（如「地下档案室」），点「**保存矫正**」。
2. 观察：保存中 → 保存成功提示「已保存，下一轮起笔生效」；「最近变更」新增「你 · 已就地矫正」。
3. 记录 修改前→后 值；Console 验证写路径（把 state 换成当前面板完整状态）：
   ```js
   fetch('/dsh-rrp/world-state',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:'<SID>',state:<STATE>})}).then(r=>r.json().then(j=>console.log(r.status,JSON.stringify(j))))
   ```
4. **R12 无 diff 短路**：不修改任何字段，直接再点一次「保存矫正」→ 不应产生新的「已就地矫正」账本条目（fetch 返回 `{ok:true,unchanged:true}`）。
5. **R16 clamp**：若会话有带 min/max 的动态字段（没有则先在 T6 建一个 0–100 的），用矫正把它改成 150 → 保存后应被钳制为 100；账本仍记一条矫正。
6. **403 守卫**：新建一个**非 RP** 的普通会话（宿主原生新会话，不经过展厅），对其 SID 执行步骤 3 的 fetch → 应返回 HTTP 403 `{"error":"not an RP session"}`。
7. **下一轮生效**：回到 RP 会话，发送一条与环境相关的行动（如「我环顾四周」）→ 正文应描写新地点「地下档案室」而非旧地点。
8. **D6 自然时序**：在纪事官推演进行中（刚发完行动立刻）尝试编辑并保存矫正 → 保存应成功且为最新切面（无锁流：允许保存）；若推演恰在此刻完成重载面板，未保存草稿应保留并提示「你的未保存修改已保留，保存后以修改为准」（R18）。

#### 验收标准
- [ ] 矫正保存闭环 + 账本「你 · 已就地矫正」
- [ ] 无改动重复保存 → 无新账本条目，fetch 返回 `unchanged:true`（R12）
- [ ] 越界值被 clamp 到 100（R16）
- [ ] 非 RP 会话矫正 → HTTP 403（R15）
- [ ] 下一轮正文消费矫正后的地点（Last-Write-Wins）
- [ ] 推演期保存可用；完成后未保存草稿保留并提示（R18）

#### 必记数据
- 修改前→后：地点 `____` → `____`；clamp 字段 `____`：150 → `____`
- 各 fetch 的 HTTP 状态码 + 响应体：`____`
- 非 RP 会话 ID：`____`

#### 测试记录
- 实际行为：
- 截图路径：
- Console 错误：

---

## T6 动态字段（P1，15 min）

**目标**：D5 自定义追踪维度全链路（增/改/删/守卫/持久化）。

#### 前置
- 任一 RP 会话。

#### 测试步骤
1. 「世界状态」→「自定义字段」区 →「添加」。
2. 字段 ID 守卫三连：
   - 输入 `my-field`（含连字符）→ 应报「字段 ID 只能包含字母、数字、下划线」；
   - 输入 `characters`（保留名）→ 应报保留名称错误；
   - 输入已存在的 ID → 应报「字段 ID 已存在」。
3. 合法 ID `sanity`：类型选数值、初始值 80、min 0 / max 100 → 确认添加 → 面板出现新字段。
4. 把 sanity 改为 150 → 失焦/保存后显示 **100**（clamp）；改为 -5 → 显示 **0**。
5. 类型防呆（R13）：添加一个文本类型字段 `note_test`，值输入 `false` → 应原样保存为字符串 `false` 而非布尔 true。
6. 删除 `note_test` 字段 → 面板消失。
7. **F5 持久化**：刷新整个浏览器页面 → `sanity` 仍在且为 clamp 后的值，`note_test` 仍消失。
8. 再发一轮剧情让纪事官推演，观察动态字段是否被纪事官识别并按 min/max 约束变化（R16 diff 覆盖——「最近变更」应反映约束内变化；若纪事官本轮未触碰该字段，记录「未触发」）。

#### 验收标准
- [ ] 三种非法 ID 均被拦截且文案正确
- [ ] 合法字段添加成功；150→100、-5→0 clamp 正确
- [ ] 字符串 `'false'` 不被转成布尔（R13）
- [ ] 删除 + F5 后状态一致（持久化）
- [ ] 无 Console error

#### 必记数据
- 三个非法 ID 的实际报错文案：`____`
- clamp 前后值：`____`
- F5 前后 sanity 值：`____`

#### 测试记录
- 实际行为：
- 截图路径：
- Console 错误：

---

## T7 大局编年（Summarizer）（P1，25 min）

**目标**：`/summary` 开关与周期；**R17 every N 钳制**；设置持久化；**重启后开关状态遗留问题**（LONG_PLAY §3.2 明确待闭环）。

#### 前置
- 女仆局会话（≥2 轮已完）。

#### 测试步骤
1. 输入 `/summary off` → 宿主回复「大局编年已关闭」。
2. 输入 `/summary every 3` → 回复「大局编年：每 3 轮提炼一次」（开关同时视为开启）。
3. 继续发剧情到累计满 3 轮 → 后台出现【大局编年】正文消息（四维大局观：主线总目标/当前核心矛盾/重大转折/伏笔危机）；「最近变更」出现「大局编年 · 已更新状态」。
4. **R17 钳制**：`/summary every 999` → 回复应为「每 50 轮提炼一次」（999 越界钳到 50）；`/summary every 0` → 钳到 1。
5. 打开第二个同卡会话 → 其大局编年设置不受本会话影响（Session 级隔离）； fork 子局继承设置（T9 复核）。
6. **持久化**：F5 页面 → 设置保持。
7. **重启复位遗留问题**：记录当前开关状态 → 让人类重启宿主（Ctrl+C 后按 §0.1 重启，同一 profile）→ 重新打开同一会话 → 观察开关是否复位：
   - 若复位为默认（开/8 轮）→ 记录「复现：重启后设置复位」，定级 P2，附 Session ID；
   - 若保持 → 勾选通过并在记录里写「遗留问题闭环」。
8. `/summary` 不带参数 =  toggle：再输入一次 `/summary` → 状态取反，回复文案正确。

#### 验收标准
- [ ] on/off/every N 三种语法均正确回复
- [ ] every 999→50、every 0→1 钳制（R17）
- [ ] 第 3 轮触发编年，四维内容齐全
- [ ] 会话间设置隔离
- [ ] F5 后设置保持
- [ ] 重启后行为有明确记录（通过或缺陷立案）

#### 必记数据
- 每次 `/summary` 指令与回复原文：`____`
- 触发编年时的轮数与 Session ID：`____`
- 重启前后开关状态：`____` → `____`

#### 测试记录
- 实际行为：
- 截图路径：
- Console 错误：

---

## T8 典籍 D8（沉淀）（P0，30 min）

**目标**：沉淀全生命周期（起草/审阅/确认/删除）；**#1 Scribe cancel 真中断回归**；双存档技能隔离；API 全套 + `/lore`。

#### 前置
- 女仆局 ≥3 轮剧情（有「确立的新设定」可沉淀）；第二个同卡会话（T7 建的即可）。

#### 测试步骤
1. 右栏「典籍」页签 → 点「**沉淀最近的新设定**」→ 状态「编纂中…」。
2. **R11 推送**：编纂期间不点刷新，等 job 完成 → 列表自动出现「草稿：××（待确认）」（推送优先；>2s 无反应才允许手动刷新并记录）。
3. 审阅草稿内容（标题 + 正文 + 触发描述）→ 点「**确认写入**」→ 提示「已沉淀」；「最近变更」出现「典籍编纂 · 已沉淀：{name}」。
4. **技能生效**：发送一条需要该设定的剧情 → 模型可用 `skill` 工具检索到新沉淀（在轨迹/请求检查里可见 available_skills 含新条目）；Console 数据断言：
   ```js
   fetch('/dsh-rrp/sediment?sessionId=<SID>').then(r=>r.json()).then(j=>console.log(JSON.stringify(j).slice(0,600)))
   ```
5. **#1 cancel 回归**：再点一次「沉淀最近的新设定」，趁「编纂中…」时点「丢弃」（或反复 draft→discard）→ 应真中断 job（宿主 jobs 列表里该 job 状态为 killed/已取消），且不产生半截条目、不写日志垃圾。
6. **丢弃路径**：draft 完成后点「丢弃」→ 提示「已丢弃草稿」→ 列表无残留；`GET /dsh-rrp/sediment` 的 pending draft 为空。
7. **重复确认 400**：用 Console 对同一 session 连续两次 `action:'confirm'` → 第二次 HTTP 400。
8. **删除**：对确认过的条目点「删除」→ 从列表与 available_skills 同时消失；`DELETE /dsh-rrp/sediment?sessionId=<SID>&name=<名称>` 返回 200。
9. **手动创建**：在典籍页签手动输入主题/正文创建一条 → 直接写入（无草稿态），下轮可用。
10. **`/lore` 命令**：输入 `/lore 客栈的规矩` → 触发与按钮相同的 Scribe 起草流程；`/lore` 不带主题也应可用。
11. **双存档隔离**：切到第二个同卡会话 → 其典籍列表为空（或各自独立）；在 A 会话沉淀的条目不出现在 B 会话的 available_skills；A 删除不影响 B。
12. **非 RP 会话 403**：对非 RP 会话 SID 执行 sediment 系列 fetch → 403。

#### 验收标准
- [ ] 起草→自动出现（推送）→确认→「已沉淀」全链路
- [ ] 确认后下轮 skill 可检索
- [ ] 编纂中丢弃 = 真取消，无残留（#1 回归）
- [ ] 丢弃草稿后无日志/列表残留
- [ ] 重复 confirm → 400；DELETE 生效
- [ ] 手动创建直写可用
- [ ] `/lore` 两种语法均触发起草
- [ ] 双存档完全隔离（列表 + 技能 + 删除）
- [ ] 非 RP 会话 403

#### 必记数据
- 沉淀条目：标题 `{名称}` / 确认时间 / Session ID（填附录 B 典籍清单表）
- `GET /dsh-rrp/sediment` 响应体快照（确认前/后各一份，≤600 字）：`____`
- cancel job 的终态（killed/取消）：`____`
- 第二次 confirm 的 HTTP 状态码 + 响应体：`____`
- 两个会话的 available_skills 差异对照：`____`

#### 测试记录
- 实际行为：
- 截图路径：
- Console 错误：

---

## T9 世界线 Fork（P0，20 min）

**目标**：重新生成 = 原生 Session 分支；状态精确重放；**宿主 alpha.2 新边界：回合中 fork 拒绝（OPEN_TURN）**。

#### 前置
- 女仆局 ≥3 轮，且第 3 轮有明确的状态值（记一组基准值：地点/某好感度/某 flag）。

#### 测试步骤
1. 记录基准 WorldState 值对照表。
2. 在**第 3 轮正文（消息级）**上触发重新生成/分叉（宿主 UI 的 regenerate/branch 入口）→ 生成子会话。
3. 子会话开场：继承全部历史消息 + 世界状态 = 基准值（严丝合缝，不是全零也不是当前最新值）。
4. 子会话发 1 轮新剧情 → 状态演进为子线值；**切回父会话** → 父会话状态仍是基准值，无幽灵状态。
5. 再切回子会话 → 子线值还在；父子互不影响。
6. 子会话的典籍列表继承父会话已确认条目（T8 确认过的条目在子线可用）；子线新增沉淀不回灌父线。
7. **OPEN_TURN 边界**：在**一轮正在生成中**（正文流式未结束）尝试 fork → 宿主应拒绝（错误码/提示含回合未闭合语义，如 `OPEN_TURN`）；等回合结束后再 fork → 成功。
8. 若宿主 UI 无 fork 入口（或只有 Synapse 画布支持），记录实际可用入口；Synapse 插件不在本测试范围，用宿主自带入口即可。

#### 验收标准
- [ ] 子会话继承消息 + 状态精确等于基准切面
- [ ] 父子双向独立演进，切换零幽灵
- [ ] 典籍跨线继承方向正确
- [ ] 回合中 fork 被拒绝、回合后 fork 成功（或记录宿主实际行为定级）
- [ ] 全程无 Console error

#### 必记数据
- 父子 Session ID 对照：父 `____` / 子 `____`
- 基准值 → 子线值 → 回切父值 三段对照表：`____`
- OPEN_TURN 拒绝提示原文：`____`

#### 测试记录
- 实际行为：
- 截图路径：
- Console 错误：

---

## T10 运行时插件卸载与重载（P1，15 min）

**目标**：**R1「五处投影注册回收 disposer」真机验证** + 卸载路径真释放一切（0.1.6-alpha.2 宿主支持运行时卸载插件）。

#### 前置
- T1–T9 已执行（有若干 RP 会话与沉淀数据）。

#### 测试步骤
1. 确认宿主界面存在插件管理入口（Plugin Manager，通常在设置/导航区）；若没有 UI 入口，让人类用宿主 CLI/文档确认卸载方式，找不到则记录「无法触发」并跳过本节（不算失败）。
2. 先记录当前右栏页签（世界状态 / 典籍）与左栏「卡片展厅」入口都在。
3. 在插件管理页对 **dsh-rrp** 执行 **unload**。
4. 观察：右栏两个页签消失、左栏展厅入口消失；已打开的会话可继续对话但不再触发纪事官；**宿主启动日志或 Console 无卸载报错**。
5. 在插件管理页执行 **reload**（或重新 enable/load）。
6. 观察：页签与入口恢复；投影重新注册（启动日志再次打印 6 条 projection registered）；打开既有 RP 会话，世界状态面板仍能显示历史切面（投影重放正常）；发 1 轮剧情，纪事官恢复推演。
7. **重复 3 次** unload→reload 循环：每次检查 Console error 数不累积、页签不重复（同一页签不出现两个「世界状态」）、推演仍正常。
8. 数据断言（reload 后 Console 执行）：
   ```js
   fetch('/dsh-rrp/activity?sessionId=<SID>').then(r=>console.log(r.status))
   ```
   返回 200（路由重新挂载）；unload 期间应为 404。

#### 验收标准
- [ ] unload：页签/入口全部移除，无报错（R1 disposer 生效）
- [ ] unload 期间 `/dsh-rrp/*` 路由 404
- [ ] reload：全部功能恢复，既有会话状态切面可重放
- [ ] 3 次循环：无 error 累积、无页签重复、无功能退化
- [ ] 若发现泄漏（页签重复/报错/内存明显上涨），定级 P0/P1 并附截图

#### 必记数据
- 每次 unload/reload 的 Console error 计数：`____` / `____` / `____`
- 3 次循环后右栏页签数量与名称：`____`
- unload 期间 activity 路由状态码：`____`

#### 测试记录
- 实际行为：
- 截图路径：
- Console 错误：

---

## T11 宿主整洁与可读性（P1，10 min）

**目标**：插件对宿主原生体验零污染（R12 裁决 + MANUAL_TEST §8 遗留四项）。

#### 测试步骤
1. 对话区滚动检查：无任何 `rrp/*` 事件文本、无内部 payload 可见、无「历史横幅」类异常 UI。
2. 新开一局（任意卡）→ 开场白**直接出现在正文流**，无需手动刷新页面（§8 遗留：开场白免刷新）。
3. 切到非 RP 会话 → 右栏页签应提示「当前没有会话」类空态或不可用（不报错）。
4. 主题切换：设置里切换 亮/暗 → 世界状态与典籍面板文字可读、无白块黑块残留；再切回。
5. Network 面板粗查：面板状态推送为主（R11），不应看到高频（<1s）轮询请求风暴；2s 一次的 fallback 轮询属允许（宿主未注入座位时）。

#### 验收标准
- [ ] 对话区零内部事件泄漏
- [ ] 开场白免刷新直出
- [ ] 非 RP 会话面板优雅空态
- [ ] 亮暗主题切换无残留
- [ ] 无轮询风暴

#### 必记数据
- 主题切换前后截图对照：`____`
- Network 中观察到的轮询/推送请求样例（URL + 间隔）：`____`

#### 测试记录
- 实际行为：
- 截图路径：
- Console 错误：

---

## T12 稳定性与性能（P1，40 min）

**目标**：精简长线（12 轮）无退化；防漂移；token 与状态条目数可控。

#### 测试步骤
1. 在女仆局（或新开雁门客栈局，推荐——验证第二张卡长线）连续进行 12 轮剧情，每轮遵循：发行动 → 等正文+推演完 → 记数据。
2. 每 3 轮记录一次底栏 token 读数（输入框下方 tok 显示）。
3. 第 4/8/12 轮记录 WorldState 条目数：角色 `__` 项 / 物品 `__` 项 / 事件与秘密 `__` 项 / 自定义字段 `__` 项。
4. 每轮快速判定：正文是否出戏/代打/剧透（真凶、秘密提前泄露）。
5. 第 6 轮做一次玩家矫正（改一个 flag），第 7 轮验证正文按矫正走。
6. 12 轮结束后：页面无白屏/卡死；右栏三页签切换流畅；宿主启动日志无新 error。
7. 多会话：保持 5 个会话（女仆×2、雁门×2、非 RP×1）在侧栏，逐个切换面板，观察各会话面板数据互不串味、切换无延迟尖峰。

#### 验收标准
- [ ] 12 轮 0 崩溃 0 白屏 0 卡死
- [ ] token 曲线平稳，无单轮暴涨（相邻两轮增幅 >3 倍记为异常并记录）
- [ ] 状态条目数缓慢增长，无爆炸（flags 类条目 12 轮内增长 ≤ 2 倍；参照历史 P1：10→32 为坏例）
- [ ] 全程无代打/出戏/剧透
- [ ] 5 会话切换互不串味

#### 必记数据（填表）

| 轮 | tok | 角色 | 物品 | 事件 | 自定义 | 代打/出戏/剧透 |
| :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| 3 | | | | | | |
| 6 | | | | | | |
| 9 | | | | | | |
| 12 | | | | | | |

- 矫正的 flag 修改前→后 + 次轮正文佐证（≤80 字）：`____`

#### 测试记录
- 实际行为：
- 截图路径：
- Console 错误：

---

## T13 响应式（P2，10 min）

**目标**：三档视口无水平溢出。

#### 测试步骤
1. DevTools 切设备工具栏，依次设 1920×1080 / 768×1024 / 375×812（亮暗各一遍）。
2. 每档检查：世界状态页签可编辑、典籍页签可用、展厅列表可滚动；执行 `document.documentElement.scrollWidth <= window.innerWidth` 应为 `true`。

#### 验收标准
- [ ] 三档 × 亮暗 = 6 组全部 `scrollWidth <= innerWidth`
- [ ] 375px 下核心操作（保存矫正/确认沉淀）可完成

#### 必记数据
- 6 组断言结果：`____`

#### 测试记录
- 实际行为：
- 截图路径：
- Console 错误：

---

## 附录 A — API 速查表（同源 fetch，Console 直接执行）

| 端点 | 方法 | 用途 | 关键断言 |
| :--- | :--- | :--- | :--- |
| `/dsh-rrp/cards` | GET | 卡列表 | 200，数组长度 = 卡数（本测 2→3） |
| `/dsh-rrp/cards/one?id=<id>` | GET | 单卡详情 | 200，`name`/`skills` 正确 |
| `/dsh-rrp/start` | POST `{cardId}` | 开卡 | 错误 cardId → 400 |
| `/dsh-rrp/activity?sessionId=` | GET | 归因账本 | 200，条目 phase ∈ started/committed/corrected/failed/stale |
| `/dsh-rrp/world-state` | POST `{sessionId, state}` | 玩家矫正 | 200 `{ok}` / `{ok,unchanged:true}`；非法 400；未知会话 404；非 RP 403 |
| `/dsh-rrp/sediment?sessionId=` | GET | 典籍列表 + 待确认草稿 | 200 |
| `/dsh-rrp/sediment` | POST `{action:'draft'}` | 触发 Scribe 起草 | 200/202 |
| `/dsh-rrp/sediment` | POST `{action:'confirm'}` | 确认草稿 | 重复 confirm → 400 |
| `/dsh-rrp/sediment` | POST `{action:'discard'}` | 丢弃草稿 | 200，job 真取消 |
| `/dsh-rrp/sediment` | POST `{action:'manual', draft}` | 手动写入 | 200，直写无草稿态 |
| `/dsh-rrp/sediment?sessionId=&name=` | DELETE | 删除条目 | 200 |

fetch 模板：

```js
const j = (r) => r.json().then(b => console.log(r.status, JSON.stringify(b).slice(0, 400)))
fetch('/dsh-rrp/world-state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: '<SID>', state: <STATE> }) }).then(j)
```

## 附录 B — 记录模板

**截图命名**：`docs/reference/acceptance-screenshots/NN-描述.png`，NN 从 01 全局递增。

**Session 清单表**（测试过程中随手填）：

| Session ID | 卡片 | 用途 | Workspace | 创建时间 |
| :--- | :--- | :--- | :--- | :--- |
| | | | | |

**典籍清单表**：

| Session ID | 标题 | 确认时间 | 验证结果 |
| :--- | :--- | :--- | :--- |
| | | | |

**缺陷记录格式**（每个缺陷一份）：

```text
[Px] 标题
现象：
复现步骤：1) 2) 3)
期望 vs 实际：
证据：截图 NN / Console 原文 / HTTP 状态码+响应体
初判影响范围：
```

分级：**P0 阻断**（代打、幽灵状态、白屏崩溃、数据错乱、卸载泄漏）/ **P1 明显**（功能缺失、链路断、提示缺失）/ **P2 打磨**（文案、观感、边界体验）。

## 附录 C — 前置准备（人类配合项）

1. **模型可用**：`rp-dev` profile 已配置可用 LLM（所有推演链路依赖）。
2. **T3-R9 测试卡**：把以下内容存为 `cards/test-probe/card.md`、`openings/default.md`、`skills/probe/SKILL.md`、`state.json`（宿主运行中放入即可，展厅刷新后可见）：

`cards/test-probe/card.md`：
```markdown
---
id: test-probe
name: 探针测试卡
summary: 自动化验收专用的极简测试世界，无剧情价值。
tags: [测试]
opening: default
version: 1
author: dsh-rrp test
player:
  name: 探针玩家
  description: 一个用于验证开卡流的测试身份。
persona: |
  基调：极简。场景只有一间白墙房间，NPC 只有一位测试员。
  铁律：不替玩家行动；所有描写不超过三段。
---

# 世界核心

一间白墙房间，一桌一椅。测试员站在桌旁，等待玩家的第一个指令。
```

`cards/test-probe/openings/default.md`：
```markdown
{{player.name}}睁开眼，发现自己坐在一间白墙房间里。桌上放着一杯还冒热气的茶，一位胸前挂着「测试员」名牌的人站在桌旁，手里拿着记录板。

「你好，{{player.name}}。」测试员说，「这里没有谜题，也没有危险。你可以做任何事，我们只记录流程是否正常。」
```

`cards/test-probe/skills/probe/SKILL.md`：
```markdown
---
name: probe-rule
description: 探针世界的唯一规则：所有物品都必须贴标签。
---

# 探针规则

这间房间里的所有物品都贴有白色标签，标签上写着物品的名称。测试员会拒绝使用任何没有标签的物品。
```

`cards/test-probe/state.json`：
```json
{
  "characters": {
    "测试员": { "affinity": 0, "mood": "平静", "appearance": "白衬衫，胸前挂名牌", "condition": "健康" }
  },
  "inventory": {
    "茶杯": { "quantity": 1, "note": "还冒着热气" }
  },
  "scene": { "location": "白墙房间", "time": "上午", "weather": "室内" },
  "flags": {}
}
```

3. **T7 第 7 步** 与 **T10** 需要短暂重启宿主/卸载插件，请人类在 Agent 提出时配合操作。

---

## 测试记录回填区

**测试执行**：____（Agent 签名）　**日期**：____　**被测 commit**：____

| 用例 | 结果(PASS/FAIL/SKIP) | 备注 |
| :--- | :--- | :--- |
| T1 | | |
| T2 | | |
| T3 | | |
| T4 | | |
| T5 | | |
| T6 | | |
| T7 | | |
| T8 | | |
| T9 | | |
| T10 | | |
| T11 | | |
| T12 | | |
| T13 | | |

**发现的缺陷清单**：（编号 + 分级 + 一行现象）

**验收结论**（三选一）：
- [ ] 全部通过
- [ ] 部分通过（缺陷均已立案分级）
- [ ] 有回归（P0/P1 缺陷阻塞发布）
