# dsh-synapse 研究报告（v0.4.1）

> 源：https://github.com/liangmianya/dsh-synapse
> 本地：`/d/projects/dsh-synapse-new`（刚克隆最新版）
> 目的：为 dsh-rrp 的「非线性剧情地图」提供参考

---

## 一、它是什么

> 把同一工作区中的会话、追问和分支组织成一张可浏览、可拖拽、可缩放的地图，同时保留 DSH 原生会话作为唯一事实来源。

**核心定位：表现层 + 组织层，不替代任何 DSH 系统。**

| 它做的 | 它不做的 |
|:---|:---|
| 把已提交事件投影成卡片 | ❌ 不启动第二个 HTTP 服务器 |
| 按原生 fork 关系连线 | ❌ 不建第二个模型/agent 运行时 |
| 存画布布局元数据 | ❌ 不替换认证/权限 |
| 用户操作走原生会话桥 | ❌ 不制造另一套会话历史 |

---

## 二、架构要点

### 2.1 接入方式

```yaml
# cordis.patch.yml
- insert:
    - id: synapse
      name: dsh-synapse
      config:
        dataFile: !!js dshHomePath('synapse/workspaces.json')
        autoProjection: true
        projectionWorkspaceTitle: DSH 任务
        trustedHosts: []
```

- 复用现有 DSH Web Server（不启第二个进程）
- 贡献为一个 profile patch

### 2.2 数据分层（关键设计）

```
DSH session log  = 唯一事实来源（会话内容、生命周期）
        ↓ 只读投影已提交事件
Synapse 卡片与连线 = 派生视图
        ↓
workspaces.json  = 仅布局元数据（画布坐标、fork 锚点）
```

**存储位置**：`$DSH_HOME/synapse/workspaces.json`

**关键性质**：
- 删了它 → 重置画布组织，**不删除会话**
- 卸载插件 → 保留文件，重装恢复画布
- 旧 schema 自动迁移
- 多人共享会有 last-writer-wins（承认的局限）

### 2.3 投影模型

```
每个 user 提问 → 一张会话卡片
后续 assistant 消息 → 折叠进该 turn
最终 assistant 回复 → 作为答案展示
fork 的会话 → 连到父 turn 的 **durable DSH seed boundary**
              （而不是画布上的任意坐标）
```

**重要**：卡片坐标只是视觉元数据，**绝不决定会话血缘**。

**性能优化**：
- 卡片文本上限 8000 字符，超出截断（完整内容在详情视图）
- 事件爆发时合并投影写入
- 实时更新复用缓存 Markdown，只 patch 活跃卡片

### 2.4 工具调用折叠

- 按 `callId` 把 tool call 和 result 配对
- 渲染在相关 assistant 回复内部，而非独立卡片

---

## 三、fork/血缘的具体实现（最有价值）

### 3.1 关键代码（index.js）

```javascript
// 第 385 行：持久化 DSH 的 fork 切点
const seedLength = session.header?.seedLength
if (Number.isSafeInteger(seedLength) && seedLength >= 0)
  thread.sourceSeedLength = seedLength

// 第 389-391 行：父子关系与兄弟识别
const parentSessionId = session.header?.parentSession ?? null
const parent = workspace.threads.find(
  item => item.dshSessionId === parentSessionId)
const siblings = workspace.threads.filter(
  item => item.sourceParentSessionId === parentSessionId)

// 第 402 行：投影只存中性语义锚点
// 第 757 行：回放起点
const replayFrom = session.header?.parentSession === undefined
  ? 0 : session.firstLiveSeq
```

### 3.2 三个关键字段

| 字段 | 来源 | 作用 |
|:---|:---|:---|
| `parentSession` | Session header | 父会话 id |
| `seedLength` | Session header | fork 切点（继承的事件数）|
| `firstLiveSeq` | 计算得出 | 子会话自己的事件起点 |

### 3.3 设计哲学

> Forked sessions connect to the parent turn at the durable DSH seed boundary rather than at an arbitrary canvas coordinate.

**血缘来自 session header，不来自画布坐标。**

---

## 四、对 dsh-rrp 的启示

### 4.1 我们已有的优势

| 能力 | dsh-synapse | dsh-rrp |
|:---|:---|:---|
| 会话投影 | 只读事件 → 卡片 | ✅ 5 个领域投影（WorldState 等）|
| fork 血缘 | 读 header | ✅ 已依赖同一机制 |
| 前缀缓存 | 不涉及模型 | ✅ 已优化 |
| 卡片布局存储 | workspaces.json | ❌ 无 |
| 可视化画布 | ✅ 核心功能 | ❌ 无 |

### 4.2 关键差异：目标不同

```
dsh-synapse：面向「对话管理」
  - 一张卡片 = 一次提问
  - 关注：会话组织、追问、分支浏览

dsh-rrp 想要的：面向「剧情线」
  - 一个节点 = 一个剧情场景/决策点
  - 关注：galgame 式路线选择、回溯、世界状态差异
```

### 4.3 可以借鉴的机制

| 机制 | 说明 | 适配度 |
|:---|:---|:---:|
| **读 header 获血缘** | `parentSession` + `seedLength` | ✅ 直接用 |
| **坐标与血缘分离** | 布局是元数据，血缘是事实 | ✅ 直接用 |
| **独立元数据文件** | 不污染 Session log | ✅ 可借鉴 |
| **投影只读已提交事件** | 不写 Session | ✅ 已符合 |
| **卡片=一次提问** | | ❌ 我们要改成=剧情节点 |
| **8000 字符截断** | | ⚠️ 看需求 |

---

## 五、关于你要的「galgame 剧情线」

### 5.1 两种可能的形态

**形态 A：复用 dsh-synapse**
- 直接装 dsh-synapse，用它的地图
- 我们的插件只负责让每个 fork 点的**世界状态差异可视化**
- 优点：零重复造轮子，符合铁律
- 缺点：卡片语义是「提问」，不是「剧情节点」

**形态 B：自建剧情地图**
- 我们的插件注册一个新的主面板
- 节点 = 剧情场景（从 WorldState 差异 + turn 摘要生成）
- 连线 = fork 血缘（读 header）
- 优点：语义贴合 galgame
- 缺点：与 dsh-synapse 功能重叠

**形态 C：混合（我的建议）**
- 基础地图交给 dsh-synapse（不重复造）
- 我们增强：在节点上显示**世界状态快照差异**
- 比如：某节点的 scene.location、好感度、关键 flags
- 这样地图既有结构（synapse），又有剧情语义（我们）

### 5.2 需要你决策的关键问题

1. **是否依赖 dsh-synapse？**
   - 依赖 → 少写代码，但要协调两个插件
   - 独立 → 自由度高，但重复实现画布

2. **节点的语义是什么？**
   - 一次提问（synapse 的模型）
   - 一个剧情场景（需要我们定义边界）
   - 一个决策点（玩家做了重要选择的时刻）

3. **回溯时做什么？**
   - 只切换会话（synapse 的做法）
   - 显示状态差异（"从这里开始，好感度不同了"）
   - 提供对比视图

---

## 六、下一步建议

**先做的事**：
1. ✅ 沉浸视图已砍（本次完成）
2. ⏳ 在**原生 Chat** 里验证 fork 入口是否可用
3. ⏳ 装 dsh-synapse 实测地图体验
4. ⏳ 然后决策：形态 A / B / C

**我的倾向**：
先装 dsh-synapse 看效果。如果它的地图体验够好，走**形态 C**——
基础结构复用，我们只加「剧情语义层」（状态差异、路线标记）。

这符合 AGENTS.md 的「拒绝重复造轮子」铁律。

---

**研究完成**
