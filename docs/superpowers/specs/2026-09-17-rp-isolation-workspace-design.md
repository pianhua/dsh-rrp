# RP 隔离与宿主对齐重构设计

**日期：** 2026-09-17  
**状态：** 已确认，进入实施  
**依据：** `docs/DESIGN.md`、`docs/HOST_ALIGNMENT.md`、`docs/reference/DECISIONS.md`

## 目标

本轮把当前实现收敛为真正的 DSH 薄插件，解决四个相互关联的问题：卡包之间必须严格隔离；同一卡包可拥有多个互不影响的存档；分叉必须继承分叉点以前的全部 RP 状态；左侧工作目录只承担宿主导航与分组，不成为第二套 RP 状态容器。

重构不引入自建服务、数据库、任务队列、锁、会话系统或左侧栏框架。所有持久状态仍以 DSH `Session` 事件日志为真源，所有派生态由 `sessionProjections` 纯折叠得到。

## 身份与拓扑

### 卡包身份

`cardId` 是静态内容身份，必须使用规范化的小写 kebab-case：`[a-z0-9]+(?:-[a-z0-9]+)*`。卡包目录名必须与 frontmatter 的 `id` 完全一致。

这一约束同时解决三个问题：

- `rp-<cardId>` 与卡包一一对应，杜绝 `foo_bar`、`foo bar`、`foo-bar` 被压成同一 preset id；
- 卡包路径不能携带 `..`、斜杠或平台相关分隔符；
- 用户覆盖卡包时仍可按同一稳定 id 覆盖，而不会覆盖相邻卡包。

无效卡包在列表扫描时被忽略；按 id 读取时直接拒绝。基础 `rp` preset 不携带任何卡包知识；每个有效卡包只物化一个 `rp-<cardId>` preset，并只挂载自己的 bundled skills。

### 存档与分支

一张卡的一次游玩就是一个原生 `Session`。同一卡重新开档就是新建另一个 Session；重新生成或世界线分支使用宿主 `Session.fork`。插件不创建 save-slot、branch 或 story 数据表。

Session 的继承规则是：子会话包含分叉边界之前的事件前缀，之后只追加自己的事件。因此 WorldState、MacroSummary、摘要开关和动态典籍都必须落在已知 `user/message` 的 `source.rrp` 中；这样它们天然满足“分叉前继承，分叉后隔离”。

## 会话级摘要设置

当前进程级 `summaryEnabled` 会让一个存档的 `/summary off` 影响所有存档。重构后引入 `RrpSettings`：

```ts
interface RrpSettings {
  summaryEnabled: boolean
}
```

`rrpSettings` 投影默认返回 `{ summaryEnabled: true }`，每次设置变更写入当前命令调用所属 Agent 的 Session。Summarizer 在触发时读取该 Session 的投影，不再读取模块全局变量。`/summary on|off` 与无参数切换均只修改当前 Session；fork 会按事件前缀继承开关状态。

## 动态典籍的事件模型

当前 `<dshHome>/.dsh-rrp/sediment/sessions/**` 文件树不具备分叉边界语义，并重复实现了宿主已有的持久化与原子写能力。重构后，动态典籍的权威状态改为 Session 事件：

```ts
interface SedimentEntry {
  name: string
  description: string
  body: string
}

type SedimentChange =
  | { kind: 'snapshot'; skills: SedimentEntry[] }
  | { kind: 'add'; skill: SedimentEntry }
  | { kind: 'remove'; name: string }
```

`rrpSediment` 投影从空列表开始，顺序折叠以上变更。`add` 保持名称唯一，`remove` 只删除目标名称，`snapshot` 仅用于一次性旧数据迁移。投影输出是当前世界线的完整动态典籍。

Agent 级 Skill provider 继续使用宿主 `agent.ctx.get('skills').registerProvider`，但改为直接读取该 Agent Session 的 `rrpSediment` 投影，不再把文件目录当作实时真源。确认、手动添加和删除均先向 Session 追加事件，成功后只调用 provider control 的 `invalidate()`。

旧 sidecar 在 RP Agent 首次装载时惰性迁移：若事件投影为空且旧目录存在，则先追加一个 `snapshot` 事件；追加成功后把原 Session 目录改名为带 `.legacy.bak` 后缀的备份。若事件已存在或目录已备份，迁移不重复执行。失败时保留原目录并记录警告，绝不丢数据。

## Workspace 的边界

DSH Workspace 是左侧导航和 Session 分组，不是卡包、存档或世界状态。插件不接管原本的工作目录列表，也不创建平行左侧栏。

卡片展厅只做一层宿主适配：若 `ctx.workspaces` 可用，就读取宿主已有 Workspace，并在“开始”区域提供原生风格的可选归属；选择后把 `workspaceId` 直接传给 `ctx.sessions.create({ workspaceId })`。未安装 Workspace 能力或用户选择“未分组”时仍创建普通 Session。插件不会自行创建目录、猜测用户路径或自动删除 Workspace。

由此得到清晰映射：

| 概念 | 真源 | 用途 |
| --- | --- | --- |
| 卡包 | `cards/<cardId>` + `rp-<cardId>` preset | 静态人设、开场与技能范围 |
| 存档 | DSH Session | 一次独立游玩 |
| 分支 | `Session.fork` | 从事件边界派生世界线 |
| Workspace | DSH Workspace | 左侧分组与目录导航 |
| WorldState / Summary / Settings / Sediment | Session 事件 + projection | 可重放、可分叉的领域状态 |

## UI 与失败行为

新增控件只使用现有 DSH primitives、tokens 与 locale 文案；不引入新样式栈。Workspace 选择器仅在宿主能力存在且有可用 Workspace 时显示，不改变当前卡片展厅的信息架构。

所有写入遵循“事件先成功，UI 再报告成功”。创建 Session 后若 preset 选择或初始化失败，返回明确错误并不打开会话。摘要设置和典籍写入若缺少 Agent、Session 或 projection 服务，则返回不可用，不退化为进程全局状态或文件真源。

## 验证标准

- 两个不同卡包的 preset id 不冲突，彼此只看见自己的 bundled skills。
- 同一卡包创建两个 Session 后，WorldState、摘要设置和动态典籍互不影响。
- fork 在边界前继承设置与典籍，父子在边界后各自修改互不影响。
- `/summary off` 只影响调用命令的 Session。
- 旧 sidecar 只迁移一次，保留可恢复备份。
- Workspace 可用时新会话进入用户选择的宿主 Workspace；不可用时无回归。
- 完整单测、类型检查和构建通过。
