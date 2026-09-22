# dsh-synapse RP 适配 — 实机验证报告

**验证日期**：2026-09-17
**验证环境**：`rp-dev` (Port 3099)，Chrome DevTools MCP
**被测对象**：`dsh-synapse-rp` v0.4.1-rp.1（本地 link 进 rp-dev）
**结论**：**5 / 5 全部 PASS**，改造成功；另有 1 个健壮性隐患 + 2 条可选增强建议。

---

## 一、验证结果

| # | 验证项 | 结果 | 实测证据 |
|:--|:---|:---:|:---|
| 1 | 顶部「会话地图」入口 | PASS | 顶部居中常驻【对话】/【会话地图】胶囊切换，无闪烁 |
| 2 | 画布不再有系统提示卡片 | PASS | 冷启动重投影后，`<system-reminder>`、`<available_skills>`、`【世界状态 · 事实基准】` 100% 被过滤，画布纯净 |
| 3 | 卡片显示 72 字摘要 | PASS | 三行 CSS 截断，悬停 title 预览前 400 字，不再撑爆画布 |
| 4 | 按钮文案剧情语义化 | PASS | 卡片底部 `[详情] [回溯] [归档]`；悬停提示「从此处开辟新世界线」；详情页 `[回溯至此] [开辟新世界线] [返回画布]` |
| 5 | 回溯跳回原生对话指定位置 | PASS | 点击第 1 轮卡片 `[回溯]`，平滑切回【对话】并精准滚动到 `seq: 34` 的台词与正文 |

原 `SYNAPSE_RP_CHANGES.md` §五 中「人工验证（待做）」清单即本轮 5 项，已全部完成。

---

## 二、发现的隐患：删缓存必须重启 DSH

### 现象

只执行 `rm ~/.dsh/synapse/workspaces.json` 而不重启 DSH，画布上的旧系统卡片会再次出现。

### 根因

DSH 运行时 `WorkspaceStore` 在内存维护 `this.state`。进程存活时外部删掉磁盘文件，下一次 `flush` 会把内存里的旧状态**写回磁盘**，所以删除无效。

### 正确操作

**必须「重启 DSH + 删文件」同时做**：

```bash
# 先停 DSH，再删
Stop-Process -Id <dsh-pid> -Force
Remove-Item "$env:USERPROFILE\.dsh\synapse\workspaces.json" -Force
dsh --profile rp-dev --port 3099 --no-open
```

重启后 Synapse 会按新的 `projectableEvent` 从会话日志重投影，画布即干净（本轮已实测确认）。

### 建议的健壮性加固（未实施，待下一位）

在**读取历史 JSON** 与**渲染**两处补上 `isRpInjectionText` 过滤，这样即使本地残留旧版数据，也能在读取/渲染时静默剔除，玩家永远不必手动删文件：

| 落点 | 现状 | 建议 |
|:---|:---|:---|
| `index.js:535` `normalizeState()` | 只过滤 `isRuntimeContextMessage` | 追加 `&& !isRpInjectionText(message.text)` |
| `app.js:410` `messagesFor()` | 只过滤 runtime context 前缀 | 同样追加 RP 注入文本过滤 |

> 注意：这是**防御性兜底**，不是新增功能。主过滤仍在 `projectableEvent`（写入侧），这三处不冲突。

---

## 三、两条可选增强（评估为「高性价比」，未实施）

### 1. 分支节点微状态变迁（推荐）

从当轮注入的 `worldState` 提取 1~2 个关键标签，显示在卡片角落，例如：

```
📍 平民公寓 · 玄关      ❤️ 米娅: 7
```

玩家扫一眼分支树，就能像看《底特律：变人》流程图一样看清哪条分支达成了什么好感度。

- 数据源：`diffWorldState()` 已产出人类可读摘要；activity 账本 `detail` 字段已有类似内容。
- 成本：~50 行模板改动；关键是**不得丢掉 `data-seq` 属性**（回溯依赖它）。
- 详见 `SYNAPSE_RP_ADAPTATION.md` §任务 2 / §与 dsh-rrp 的协同点。

### 2. 开辟世界线时的命名引导（低成本）

分叉输入框当前默认生成 `女仆大小姐 (1)`、`...分支`。

- 把占位符从「输入分支的新问题」改为「为此世界线命名（如：雪夜长谈线、坦白身份线）」。
- thread 已有 `title` 字段，纯文案改动，~20 行。
- 目标：让分叉带存仪式感，避免一堆无意义编号分支。

---

## 四、交接提示

- 本 fork 只服务个人 RP，**不向上游提 PR**（见 `README.rp.md`）。
- 自动化：`cd /d/projects/dsh-synapse-rp && node --test test/*.test.js` —— 68 / 68 通过。
- 服务边界：只用 `rp-dev:3099`，**绝不碰**日常 `web:3080`。
- 改动方向见 `SYNAPSE_RP_CHANGES.md` §六「后续可选」。
