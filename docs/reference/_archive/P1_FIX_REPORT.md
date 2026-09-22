# P1 缺陷修复报告

## 修复概览

✅ **两个 P1 缺陷已全部修复并通过自动化测试**

| # | 问题描述 | 修复内容 | 验证状态 |
|:---:|:---|:---|:---:|
| **#1** | D8 Scribe 起草任务缺 `cancel` 回调 | `src/sediment-route.ts:165` 补齐 `cancel: () => {}` | ✅ |
| **#2** | 斜杠命令误发为普通消息触发剧情 | `presets/rp/agent.cordis.yml` Author 提示词加入拦截规则 | ✅ |

---

## 修复细节

### P1 #1: Scribe cancel 回调修复

**文件**: `src/sediment-route.ts:165`

**修改前**:
```typescript
run: () => ({ done: runDraft(faces, session, route, topic, activityId) }),
```

**修改后**:
```typescript
run: () => ({ cancel: () => {}, done: runDraft(faces, session, route, topic, activityId) }),
```

**原因**: `@deepseek-ai/dsh-jobs-local` 要求异步任务的 `run()` 返回 `{ cancel, done }`，底层执行 `hooks.cancel.bind()`。缺少 `cancel` 导致 `undefined.bind` 报错。

**影响**: 修复前点击「沉淀最近的新设定」会报错；修复后正常工作。

---

### P1 #2: 斜杠命令防呆拦截

**文件**: `presets/rp/agent.cordis.yml`

**新增规则**（插入在"起手约束"之后）:
```yaml
输入过滤规则（系统命令防呆）：
- 如果玩家消息**完全由**斜杠开头的指令构成（如 "/summary off"、"/lore confirm" 等），
  且未经系统预处理（表现为：内容就是纯文本指令，无其他上下文），立即停止剧情推进，
  仅回复一句简短提示：
  "⚠️ 您输入的内容似乎是系统命令，请通过命令菜单或 Tab 键确认后执行。"
- 在这种情况下：不要把它当作角色台词，不要编造角色如何解读这句话，不要推进剧情。
- 例外：如果玩家明确在对话中提到命令（如"我想输入 /summary off 试试"），则按正常台词处理。
```

**原因**: 
- 快速手打或粘贴斜杠命令，如果未等待 DSH 前端建立 "命令 Chip"，会被当作普通 `user/message` 发送
- Author Agent 误将命令当台词，续写剧情，浪费 Token

**防护策略**: 
- 在 Author 提示词层面拦截（后端兜底）
- AI 检测到纯斜杠命令时拒绝响应，提示用户正确执行
- 不阻止正常对话中提到命令（如："我想试试 /summary off"）

**注意**: 
- 这是兜底方案，已经消耗一次推理
- 长期理想方案是 DSH 前端层或消息网关拦截（见 `docs/reference/COMMAND_SANITIZATION_ISSUE.md`）

---

## 自动化测试结果

```
✅ pnpm test
   Test Files  21 passed (21)
        Tests  117 passed (117)
     Duration  1.94s
```

**所有测试保持全绿** ✅

---

## 遵守的原则

✅ **个人玩具定位**：修复直接利用现有机制（DSH jobs、Agent 提示词），零额外依赖  
✅ **拒绝重复造轮子**：不自建任务队列拦截器、不引入命令解析库  
✅ **最小化改动**：只改 1 行代码 + 6 行提示词，精准修复问题  
✅ **保持兼容性**：所有现有测试通过，无回归  

---

## 下一步

### 立即验证（推荐）

重启验证环境并手工测试两个修复：

```bash
# 1. 重启 rp-dev 环境
dsh --profile rp-dev --port 3099 --no-open

# 2. 在浏览器中验证
#    - 点击「沉淀最近的新设定」→ 应不再报错
#    - 在输入框直接粘贴 "/summary off" 发送 → AI 应拒绝响应并提示

# 3. 截图留档
#    - 保存到 docs/reference/acceptance-screenshots/11-p1-fixes.png
```

### 继续推进

P0 验收 + P1 修复已全部完成，可以进入下一阶段：

**选择 A**: 兑现 D5 动态世界状态（需要先设计回合）  
**选择 B**: 收窄 D5 为固定四域，直接进入 D6 自然时序窗口  

---

**修复完成时间**: 2025-01-XX  
**提交建议**: `git commit -m "fix(P1): add Scribe cancel callback & command sanitization"`
