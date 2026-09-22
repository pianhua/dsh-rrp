# 问题分析：斜杠命令被误发为普通消息

> 2026-09-18 更新：守卫已从「拦截任何纯斜杠消息」收窄为**白名单**（只拦本插件注册的
> `/lore` 与 `/summary`），RP 惯用的 `/me …` 等斜杠输入不再被误判为系统命令。

## 一、问题现象

在 P0 验收过程中，发现以下异常事件序列：

```
Event 15 | user/message      | "/summary off"      ⚠️ 被当成普通文本
Event 19 | assistant/message | (Author 误续写剧情)
Event 23 | command/run       | name: "summary"     ✅ 真正的命令
Event 25 | command/done      | "大局编年已关闭"      ✅ 正常结算
Event 30 | user/message      | "/summary off"      ⚠️ 再次误发
Event 31 | assistant/message | (再次触发剧情)
```

## 二、根本原因

### 2.1 触发路径

1. **测试自动化方式**：Chrome DevTools 直接 `fill` 富文本框 + 点击发送
2. **前端认领机制缺失**：DSH 命令系统依赖：
   - 键盘输入 `/` 触发补全菜单
   - 点击菜单项或 Tab 确认建立 "命令 Chip"
   - 只有 Chip 状态的消息才会走 `command/run` 通道
3. **绕过认领的后果**：直接设值 → 前端未建立 Chip → 发送时被识别为 `user/message`

### 2.2 DSH 命令系统设计约定

根据 `@deepseek-ai/dsh-commands` 规范：

- 命令执行流：`command/run` → `command/done` (纯系统事件)
- **严格隔离**：不产生 `user/message`，不触发模型 Turn，不消耗 Token
- **前端职责**：通过 UI 层建立 "命令态" 标记，拦截在模型上下文之外

## 三、影响评估

### 3.1 功能正确性

- ✅ **命令本身生效**：Event 23-25 证明 Summary 设置成功关闭
- ✅ **隔离性验证有效**：存档 A/B 的设置独立性测试结论不受影响

### 3.2 真实玩家风险

虽然测试中是自动化脚本绕过了前端机制，但暴露了**真实场景隐患**：

| 场景 | 触发条件 | 后果 |
|:---|:---|:---|
| **快速手打** | 玩家习惯性敲 `/summary off` + 立刻回车 | 如果补全菜单未及时出现，命令被当聊天发送 |
| **粘贴命令** | 从文档/笔记粘贴 `/lore confirm` 直接发送 | 同样绕过 Chip 建立，变成普通台词 |
| **移动端** | 触屏输入法可能延迟触发补全逻辑 | 更容易误发 |

**代价**：
- 浪费一次 LLM 推理 Token（计费）
- AI 误将命令当台词强行圆剧情
- 玩家困惑："我明明输了命令，怎么没执行？"

## 四、修复建议

### 方案 A：前端防呆拦截（推荐）

在 `dsh-rrp` 客户端注册消息预检 Hook：

```typescript
// src/client/index.ts 或新建 src/client/command-guard.ts
ctx.on('session/message-will-send', (event) => {
  const text = event.message.content?.[0]?.text || '';
  
  // 检测以 / 开头但未被识别为命令的消息
  if (text.startsWith('/') && !event.message.command) {
    const knownCommands = ['/summary', '/lore', '/start'];
    const matchedCmd = knownCommands.find(cmd => text.startsWith(cmd));
    
    if (matchedCmd) {
      // 拦截并提示
      event.preventDefault();
      ctx.notifications.warn({
        title: '命令输入提示',
        message: `请通过命令菜单或 Tab 键确认命令：${matchedCmd}`
      });
      return;
    }
  }
});
```

**优点**：
- 零侵入性，不改动 DSH 核心
- 保护所有 RP 命令（包括未来新增）
- 用户友好，实时反馈

**缺点**：
- 如果 DSH 未提供 `session/message-will-send` Hook，需等宿主支持

---

### 方案 B：后端防呆拦截（兜底）

在 RP preset 的 Author Agent 提示词中加入拦截规则：

```markdown
## 输入过滤规则

如果用户消息**完全由**斜杠开头的指令构成（如 `/summary off`、`/lore confirm` 等），
且未经系统预处理，**立即拒绝响应**并回复：

> ⚠️ 您输入的内容似乎是系统命令，请通过命令菜单正确执行。

这种情况下：
- 不要把它当作角色台词
- 不要推进剧情
- 不要编造角色如何解读这句话
```

**优点**：
- 立即可部署，无需等宿主更新
- 最后一道防线

**缺点**：
- 消耗一次模型推理（已经来不及阻止）
- 如果命令混杂正常对话（如 "我想输入 /summary off"），可能误杀

---

### 方案 C：DSH 宿主层改进（长期方案）

向 DSH 团队提 Issue/PR：

1. **前端编辑器增强**：
   - 检测粘贴内容，自动触发命令补全
   - 发送前二次校验：文本以 `/` 开头但无 Chip → 弹窗确认
2. **后端消息网关**：
   - 在 `user/message` 写入前，检查 `text.startsWith('/')` 且匹配已注册命令
   - 自动降级为 `command/run`，而非直接写入对话历史

---

## 五、立即行动建议

### 短期（本轮修复，配合 Scribe cancel 修复一起）

✅ **实施方案 B**：在 `presets/rp/author.md` 提示词中加入斜杠命令拦截规则

```bash
# 修改文件
vim presets/rp/author.md  # 或对应的 Author 提示词文件

# 在 "输入处理规则" 或 "注意事项" 章节加入上述防呆条款

# 重新构建
pnpm run build

# 测试验证
dsh --profile rp-dev --port 3099 --no-open
# 手动在输入框直接粘贴 "/summary off" 发送，观察 AI 是否拒绝响应
```

### 中期（P1 阶段）

🔧 **尝试实施方案 A**：
- 调研 DSH 是否提供 `session/message-will-send` 或类似 Hook
- 如有，在客户端注册拦截器
- 如无，向 DSH 提需求

### 长期（社区贡献）

📝 **向 DSH 提 Issue**：
- 标题：`[Feature Request] Command input sanitization for paste/autocomplete scenarios`
- 描述本案例
- 建议方案 C 的宿主层改进

---

## 六、文档更新

在 `docs/reference/DECISIONS.md` 或 `docs/KNOWN_ISSUES.md` 中记录：

```markdown
### 斜杠命令误发为普通消息

**现象**：快速手打或粘贴 `/summary off` 等命令，如果未等待补全菜单或 Tab 确认，
会被当作普通聊天文本发送，触发 Author Agent 续写剧情。

**根因**：DSH 命令系统依赖前端 UI 建立 "命令 Chip" 状态，直接发送绕过认领机制。

**当前缓解**：
- Author 提示词已加入斜杠命令拦截规则（方案 B）
- 用户建议：输入 `/` 后等待菜单出现，通过点击或 Tab 确认

**长期方案**：等待 DSH 宿主层提供粘贴检测或消息网关校验。
```
