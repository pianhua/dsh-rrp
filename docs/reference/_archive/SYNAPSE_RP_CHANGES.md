# dsh-synapse RP 适配记录

> 日期：2026-09-17
> 状态：已完成第一批改造并安装到 rp-dev

---

## 一、做了什么

把 `dsh-synapse`（通用会话地图）改造成 RP 剧情分支/回溯地图。

| 项 | 上游 | 我们的 fork |
|:---|:---|:---|
| 位置 | — | `/d/projects/dsh-synapse-rp` |
| 版本 | v0.4.1 | v0.4.1-rp.1 |
| 安装 | npm | `link:` 到 rp-dev profile |
| 协议 | MIT | 沿用 |

**不上游提 PR**（纯个人使用）。

---

## 二、三项改造

### 1. 节点降噪（`index.js`，最高价值）

**问题**：dsh-rrp 的世界状态、卡包、编年、典籍都通过 `user/message`
（`source.kind = "plugin"`）注入，Synapse 把它们全渲染成巨幅卡片。

**改动**：在 `projectableEvent()` 加两道过滤：

```javascript
// 新增
if (isPluginInjected(event)) return null      // source.kind === "plugin"
if (isRpInjectionText(text)) return null      // system-reminder / available_skills
                                              // / 【世界状态 · 事实基准】等
```

**效果**：画布只剩玩家输入 + Author 正文。

### 2. 卡片轻量化（`app.js` + `styles.css`）

**问题**：卡片全文渲染几千字小说，画布臃肿。

**改动**：
- 新增 `renderCardExcerpt()`：72 字摘要，三行 CSS 截断
- 悬停 title 显示前 400 字
- 完整正文通过「详情」查看

### 3. 文案改剧情语义（`app.js`）

| 原 | 现 |
|:---|:---|
| 在 DSH 中打开 / DSH | 回溯至此 / 回溯 |
| 创建分支 / 分支 | 开辟新世界线 |
| 等待助手回复 / 正在回复 | 等待正文 / 执笔中 |

---

## 三、未改动的部分（沿用上游，已够用）

| 机制 | 位置 | 说明 |
|:---|:---|:---|
| fork 血缘 | `app.js:746` | 来自 `seedLength`，非画布坐标 |
| 一键回溯 | `app.js:1631` | `open-dsh` 已带 `seq` 锚点 |
| 从此分叉 | `app.js:372` | `synapse:fork-session` 已完整 |
| 布局存储 | `index.js` | `$DSH_HOME/synapse/workspaces.json` |
| Web 接入 | `cordis.patch.yml` | 复用 DSH server |

**结论：核心能力上游已实现，我们只做了「降噪 + 呈现 + 命名」。**

---

## 四、安装步骤（可重现）

```bash
# 1. 装本地 link
cd /d/projects/dsh-rrp
dsh plugin --profile rp-dev add /d/projects/dsh-synapse-rp

# 2. 若 pnpm 在 Git Bash 下解析路径出错，手动修软链接
cd ~/.dsh/profiles/rp-dev/node_modules
rm -rf dsh-synapse
ln -s /d/projects/dsh-synapse-rp dsh-synapse

# 3. 确认 profile 配置
#    ~/.dsh/profiles/rp-dev/package.json 的 dsh.profile.bundles
#    必须含 "dsh-synapse"

# 4. 启动
dsh --profile rp-dev --port 3099 --no-open
```

**注意**：pnpm 在 MSYS 环境下会把 `/d/...` 误解析为相对路径，
务必检查软链接指向。

---

## 五、验证

**自动化**：
```bash
cd /d/projects/dsh-synapse-rp && node --test test/*.test.js
# 68 个用例全通过（上游 64 + 新增 4）
```

**新增 4 个用例**（`test/rp-adaptation.test.js`）：
1. 插件注入被丢弃
2. system-reminder / available_skills 被丢弃
3. 玩家输入与正文保留
4. runtime context 仍被丢弃

**人工实机验证（已完成，2026-09-17）**：5 / 5 全部 PASS

- [x] 地图上不再出现系统提示卡片
- [x] 卡片显示 72 字摘要（三行截断，悬停 400 字）
- [x] 按钮显示「回溯」「开辟新世界线」
- [x] 回溯能跳回原生对话指定位置（实测滚动至 `seq: 34`）
- [x] 分叉后世界状态正确继承（dsh-rrp 侧已验证）

详细报告见 [`SYNAPSE_RP_VERIFICATION.md`](SYNAPSE_RP_VERIFICATION.md)。

---

## 六、后续可选与加固

### 6.1 健壮性（低风险，建议做）

即使不删缓存也能无感剔除旧卡片：在 `normalizeState()`（`index.js:535`）
与 `messagesFor()`（`app.js:410`）的过滤中追加 `isRpInjectionText`。
理由与精确落点见 [`SYNAPSE_RP_VERIFICATION.md`](SYNAPSE_RP_VERIFICATION.md) §二。

> 运维注意：当前「删 `workspaces.json`」**必须配合重启 DSH**，
> 否则运行中的 `WorkspaceStore` 会把内存旧状态写回磁盘。

### 6.2 可选增强

| 项 | 说明 |
|:---|:---|
| 分支节点微状态 | 卡片角落显示 `📍 平民公寓 · 玄关` / `❤️ 米娅: 7` |
| 世界线命名 | 分叉输入框改为「为此世界线命名」，改文案即可 |
| 按卡分组 | 用卡包名作为地图分组维度 |

