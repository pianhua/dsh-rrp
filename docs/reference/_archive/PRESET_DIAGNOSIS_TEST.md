# Agent 预设选中状态诊断测试方案

> **目的**：区分「DSH 设置界面显示问题」与「真实预设选中状态问题」
> **背景**：展厅开卡后，DSH 设置里仍显示为最普通的 rp 预设选中态
> **关键线索**：start.ts 有严格校验，预设不匹配会返回 400

---

## 一、先验知识（测试前必读）

### 1.1 预设真源

```typescript
// Session.header.agentPreset —— 只是创建事实，通常为空（不可信）
// 真实预设的唯一真源：
ctx.sessionProjections.stateOf(session, 'agentPreset')
```

### 1.2 服务端校验（重要！）

src/start.ts:216-220：

```typescript
const preset = projections.stateOf(session, 'agentPreset')
if (preset !== presetIdForCard(card.id)) {
  send(res, 400, { error: 'card does not match Session preset' })
  return
}
```

**推论**：如果开卡成功（开场白出现），则说明服务端记录的预设**必然是** rp-<card-id>。否则会返回 400 且开卡失败。

**因此本测试的核心是：验证「设置界面显示」与「服务端真实状态」是否一致。**

---

## 二、测试步骤

### 测试 A：验证开卡确实成功（基线）

**目的**：确认服务端校验通过（即预设匹配）

1. 打开卡片展厅
2. 选择「女继承人」卡（maid-heiress）
3. 点击「开始这一局」
4. **记录结果**：
   - [ ] 开场白是否出现？
   - [ ] 是否有错误提示？
   - [ ] 记录 Session ID：`_________________`

**判读**：
- 若开场白出现且无错误 → **服务端预设校验通过**，预设确实是 rp-maid-heiress
- 若出现 "card does not match Session preset" → 预设选择失败（真 bug）

---

### 测试 B：检查 DSH 设置界面的显示

**目的**：确认「显示为 rp」的具体表现

1. 打开 DSH 设置面板
2. 找到 Agent 预设（Agent Presets）入口
3. **仔细观察并记录**：
   - [ ] 预设列表中有哪些条目？
   - [ ] 哪个条目显示为「选中」态？
   - [ ] 选中态是 rp 还是 rp-maid-heiress？
   - [ ] 界面上是否有「当前会话」的上下文提示？
   - [ ] **截图保存**

**关键判读问题**：
- DSH 设置里的预设选择器是**全局的**还是**会话级的**？
- 它显示的是「默认预设」还是「当前会话的预设」？

---

### 测试 C：验证服务端真实状态（核心）

**目的**：绕过 UI，直接读取服务端记录的预设

**方法 1：找到最新的 session 文件**

```javascript
const fs = require('node:fs');
const { join } = require('node:path');
const { homedir } = require('node:os');
const root = join(homedir(), '.dsh', 'sessions');
const candidates = [];
for (const ws of fs.readdirSync(root)) {
  const dir = join(root, ws);
  try {
    for (const s of fs.readdirSync(dir)) {
      const f = join(dir, s, 'session.v3.jsonl.zstd');
      try { candidates.push({ id: s, ws, mtime: fs.statSync(f).mtimeMs }); } catch {}
    }
  } catch {}
}
candidates.sort((a,b) => b.mtime - a.mtime);
console.log('最新会话:', candidates[0]);
```

**方法 2：解压并查找 agentPreset 事件**

```javascript
const fs = require('node:fs');
const zlib = require('node:zlib');
const MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
const path = '<替换为方法1找到的路径>';
const buf = fs.readFileSync(path);
const out = [];
for (let i = 0; i + 4 <= buf.length; i += 1) {
  if (buf[i] !== MAGIC[0] || buf[i+1] !== MAGIC[1] || buf[i+2] !== MAGIC[2] || buf[i+3] !== MAGIC[3]) continue;
  try { out.push(zlib.zstdDecompressSync(buf.slice(i)).toString('utf8')); } catch {}
}
const lines = out.join('').split('\n').filter(Boolean);
for (const line of lines) {
  try {
    const ev = JSON.parse(line);
    if (ev.type && ev.type.indexOf('agent-preset') !== -1) {
      console.log('SEQ:', ev.seq, 'TYPE:', ev.type, 'DATA:', JSON.stringify(ev.data));
    }
  } catch {}
}
```

**期望结果**：
- [ ] 应该找到 agent-preset/selected 事件
- [ ] 事件中应该记录 presetId: "rp-maid-heiress"
- [ ] 记录实际值：`_________________`

---

### 测试 D：验证运行时真实预设（端到端）

**目的**：通过行为验证预设确实生效

1. 在开卡后的会话中发送一条消息（如「你好」）
2. 等待 Author 响应
3. **检查 Chronicle 是否推演**：
   - [ ] 右侧栏「最近变更」是否出现「纪事官」记录？
   - [ ] 世界状态是否更新？

**判读**：
- chronicler.ts:94 会检查 matchesPreset(agentPreset, rp)
- 如果预设错误，纪事官**不会启动**
- 如果纪事官正常推演 → **预设运行时确实生效**

**进阶验证**（验证 skill 作用域）：
4. 让 Author 调用一个卡包 skill（如询问米娅的信息）
5. 检查 Author 是否能正确调用 mia skill
6. 如果 skill 调用成功 → **preset 的 skill 作用域生效**（证明是 rp-maid-heiress 而非 rp）

---

### 测试 E：对比设置界面选择预设的行为

**目的**：理解 DSH 设置界面的语义

1. **新开一个普通会话**（非展厅开卡）
2. 在 DSH 设置里手动选择 rp-maid-heiress
3. **观察并记录**：
   - [ ] 设置界面如何显示选中态？
   - [ ] 会话是否立即应用该预设？
   - [ ] 记录任何差异

4. **对比**：展厅开卡的会话 vs 手动选预设的会话
   - [ ] 设置界面的显示是否一致？
   - [ ] 行为是否一致？

**这个对比能直接回答：是显示问题还是状态问题**

---

## 三、测试记录表

### Session 信息

| 项 | 值 |
|:---|:---|
| Session ID | |
| 卡包 ID | |
| 开卡时间 | |
| 开卡结果 | 成功 / 失败 |

### 显示 vs 真实状态对比

| 检查项 | 设置界面显示 | 服务端真实值 | 是否一致 |
|:---|:---|:---|:---:|
| 会话预设 | | | |

### 事件流证据

```
（粘贴 agent-preset/selected 事件的完整内容）
```

### 行为验证结果

| 验证项 | 结果 | 说明 |
|:---|:---:|:---|
| 开场白出现 | | |
| 纪事官推演 | | |
| 卡包 skill 可调用 | | |
| 世界状态更新 | | |

---

## 四、判读矩阵

| 测试 A | 测试 C | 测试 D | 测试 E | 结论 |
|:---:|:---:|:---:|:---:|:---|
| 成功 | rp-<card> | 推演 | 手动选显示相同 | **纯显示问题**：DSH 设置界面不反映会话级预设 |
| 成功 | rp-<card> | 推演 | 手动选显示不同 | **显示 bug**：设置界面与会话状态脱钩 |
| 成功 | rp | 不推演 | - | **真 bug**：预设选择未生效 |
| 400 错误 | - | - | - | **真 bug**：presetIdForCard 或物化失败 |

---

## 五、预期假设（供参考）

**最可能的解释**：DSH 设置里的 Agent 预设选择器是**全局默认预设**，而不是**当前会话的预设**。

依据：
- DSH 原生设计：会话创建后预设选定（agent-presets 是一次性选择）
- 设置界面管理的是「下次创建会话用什么」，而非「当前会话是什么」
- 所以显示 rp（默认）是**正常的**，不是 bug

**如果是这样**，建议：
- 在展厅或会话界面显示「当前会话预设：rp-maid-heiress」
- 避免玩家误以为预设没生效

---

## 六、测试纪律

### 只读原则
- ✅ 可以：开卡、查日志、看设置、发消息、截图
- ❌ 禁止：改代码、改配置、删数据、重置 git

### 记录要求
- 每个测试步骤都要记录**实际观察值**
- 关键证据必须截图或粘贴原文
- 不确定的地方标注「待确认」

### 输出
- 填写完整测试记录表
- 给出判读矩阵结论
- 提供截图/日志证据

---

**测试完成后，请提交完整报告。**
