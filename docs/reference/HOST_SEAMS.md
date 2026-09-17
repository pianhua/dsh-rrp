# HOST_SEAMS.md — DSH 宿主能力勘察（只读参考）

> 勘察对象：已安装的 DSH 宿主 0.1.5-rc.2（2026-09 快照）。
> 目的：为 dsh-rrp 的「卡片展厅 / 编年史 / 状态变更可见化 / 新建会话 / 右侧栏」寻找**原生宿主接缝**，不引入平行世界。
> 性质：**只读勘察**；除本文件外未修改、创建任何文件，未运行构建/测试。

## 0. 证据路径约定与版本

| 记号 | 绝对路径 |
| :--- | :--- |
| `HOST` | `/c/Users/10697/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai` |
| `WRK` | `/d/projects/dsh-rrp/node_modules/@deepseek-ai` |
| `SRC` | `/d/projects/deepseek-harness`（本机源码检出，版本 **0.1.1-rc.2，偏旧**；仅在安装树缺失类型时兜底引用） |

- 下文凡写 `dsh-xxx/lib/...`，均指 `HOST/dsh-xxx/lib/...`。
- **关键坑**：`@deepseek-ai/dsh-client-ui-slots` 与 `@deepseek-ai/dsh-client-store` **不在 HOST 安装树里**（构建期依赖，已被 tsdown 打进各 client bundle；各 .d.ts 里的同名 import 是悬空声明）。`dsh-client-ui-slots` 的类型可在工作区 pnpm store 读到：`WRK/dsh-client-ui-slots/lib/types/index.d.ts`（同版本 0.1.5-rc.2）；`dsh-client-store` 在本机完全缺失类型。
- 版本核实：`HOST/dsh-client-ui-renderer/package.json:4` = `0.1.5-rc.2`；`WRK/dsh-client-ui-slots/package.json` = `0.1.5-rc.2`。

---

## A. 客户端 Slot 与「卡片展厅」入口

### A1. ctx.slots 在哪个包？注册 API 精确签名

**结论**：ctx.slots 是 **@deepseek-ai/dsh-client-ui-renderer**（客户端 renderer 插件）提供的 Cordis Service，类型为 SlotRegistry；纯注册语义与类型词汇在 **@deepseek-ai/dsh-client-ui-slots**。

证据：
- `dsh-client-ui-renderer/lib/types/client/index.d.ts:24-29`：`interface Context { slots: SlotRegistry; uiRenderer: UiRendererService }`。
- `dsh-client-ui-renderer/lib/types/client/registry.d.ts:46`：`export declare class SlotRegistry extends Service`；`:84` `readonly register: SlotCore['register']`；`:100` `inject(...)`；`:148` `renderSlot(...)`；`:154` `entries`；`:164` `entriesOfSlot`；`:170` `snapshot`。
- 注册语义与类型在 `WRK/dsh-client-ui-slots/lib/types/index.d.ts`：
  - `:80` `type SlotKind = 'single' | 'list' | 'keyed' | 'chain'`
  - `:82` `type SlotScope = 'root' | 'session-maybe' | 'session'`
  - `:405` `KindOptions`（list 需 id；keyed 需 key；chain 需 select；可选 priority）
  - `:442` `BaseOptions`：`{ name; children?; store?; locale?; registrant? } & KindOptions`
  - `:589` 与 `:602` **两个 SlotCore.register 重载**（后者带 inject 业务面工厂）
  - `:119` SlotSpec、`:137` ChildrenDecl、`:315` SlotComponent、`:385` ComposedProps

**精确签名（register）**：

```ts
// 重载 1（无 inject） —— 见 ui-slots index.d.ts:589
register<K extends keyof SlotMap & string,
         const EntryKey extends EntryKeyOf<K> = EntryKeyOf<K>,
         const D extends ChildrenDecl = Record<never, never>,
         H extends StoreDecl | undefined = undefined,
         M = never,
         N extends (keyof LocaleNamespaceMap & string) | undefined = undefined,
         C extends SlotComponent<never> = SlotComponent<never>>(
  options: BaseOptions<K, EntryKey, D, H, M, N> & { inject?: undefined },
  component: C & SlotComponent<ComposedProps<K, NoInfer<EntryKey>,
             keyof NoInfer<D> & keyof SlotMap & string,
             HandleOf<NoInfer<H>>, object, NoInfer<M>, NoInfer<N>>> & RendersCheck<C, D>
): () => void

// 重载 2（带 inject） —— 见 ui-slots index.d.ts:602
register<..., I extends object, ...>(
  options: BaseOptions<K, EntryKey, D, H, M, N> & { inject: (...args: InjectParams<K, H>) => I },
  component: C & SlotComponent<ComposedProps<K, EntryKey, ..., I, ...>> & RendersCheck<C, D>
): () => void
```

要点（`registry.d.ts:63-107` 模块注释）：
- register 是**原型方法**，Cordis 服务代理会把 this.ctx 绑定到**调用者的 ctx**，因此注册的 effect 与卸载级联都归调用者 fiber；返回的 disposer 幂等。
- `inject(key, cb)`：cb 在 slot 声明已存在时同步执行，否则等到声明发生时执行；返回的 effect 由调用者 fiber 拥有。
- 注册进一个**未被声明**的槽会 throw；相同 cell 且相同 priority（默认 0）的二次注册会 throw（单/键/列表）；chain 由 select 路由。
- `locale: 'ns'` 会在组件 props 上合成 t；`inject: () => ({...})` 会把返回值合并进 props。
- **声明即独占渲染**：父条目用 children 声明子槽后，只有它能 renderSlot 这些子槽。

最小可用示例（宿主自带示例，见 `dsh-cordis-client-runner/lib/client.js:3399`）：

```ts
return {
  inject: ['slots'],
  apply(ctx) {
    ctx.slots.inject('main', () => ctx.slots.register(
      { name: 'main', key: '<一个由 owner 派发的 key>' },
      () => React.createElement('div', null, 'hello'),
    ))
  },
}
```

> 现成模板：`dsh-rrp/src/client/world-state-tab.tsx:321-338` 已用 `ctx.sidebarRightTabs.register` + `ctx.slots.register({ name:'sidebar.right.pane.tab', key: TAB_ID, locale:'rrp', inject:()=>({t}) }, WorldStatePanel)`，可直接照搬。

### A2. 宿主里实际存在的 slot 名（共 61 个，实测枚举）

方法：扫描全部 `dsh-client-ui-*` 的 `interface SlotMap` 增强块（类型级唯一权威），并比对 `dsh-cordis-client-runner/lib/client.js` 内嵌的 Slot 目录。kind/scope 来自类型块，容器包为声明它的包。

**(a) 框架 / 布局（dsh-client-ui-layout，root 级）**

| Slot | kind | scope | 声明处 |
| :--- | :--- | :--- | :--- |
| root | single | root | dsh-client-ui-renderer registry.d.ts:32（**不要注册**，见 A3 警告） |
| sidebar | single | root | dsh-client-ui-layout/lib/types/client/index.d.ts:39 |
| main | keyed | root | 同上 :48 |
| rightbar | single | root | 同上 :65 |
| shell.overlay | list | root | 同上 :80 |

**(b) 左栏 / 导航（dsh-client-ui-sidebar，root 级）**

| Slot | kind | scope | 声明处 |
| :--- | :--- | :--- | :--- |
| sidebar.brand.mark | single | root | .../contract/slots.d.ts:21 |
| sidebar.brand.name | single | root | 同上 :30 |
| sidebar.panellist | list | root | 同上 :39（**全局导航图标；list id 与 main 的 key 对应**） |
| sidebar.workspaces | single | root | 同上 :50 |
| sidebar.settings | single | root | 同上 :60 |
| sidebar.footer.action | list | root | 同上 :69 |

**(c) 主区会话（dsh-client-ui-conversation）**

| Slot | kind | scope | 声明处 |
| :--- | :--- | :--- | :--- |
| main.conversation | single | session-maybe | .../contract/slots.d.ts:113 |
| conversation.session | single | session | 同上 :118 |
| conversation.session.header | single | session | 同上 :123 |
| conversation.session.header.lineage | single | session | 同上 :128 |
| conversation.session.header.actions | list | session | 同上 :134 |
| conversation.session.header.utilities | list | session | 同上 :140 |
| conversation.session.header.corner | single | session | 同上 :151 |
| conversation.view | list | session | 同上 :157（视图 Tab：Chat / Trajectory） |
| conversation.composer | chain | session | 同上 :163（可整体接管输入区） |
| conversation.composer.bar | single | session-maybe | 同上 :213 |
| conversation.composer.dock | list | session | 同上 :198 |
| conversation.hero.workspace | single | root | 同上 :169 |
| conversation.hero.brand.mark | single | root | 同上 :175 |
| conversation.hero.agentPreset | single | root | 同上 :181 |
| conversation.input.dock | list | session | 同上 :187 |
| conversation.input.overlay | list | session | 同上 :193 |
| conversation.input.left | list | session | 同上 :203 |
| conversation.input.right | list | session | 同上 :208 |
| conversation.input.attachments | single | session-maybe | 同上 :219 |
| conversation.input.plan | single | session | 同上 :225 |
| conversation.input.model | single | session | 同上 :231 |

**(d) 聊天正文（dsh-client-ui-chat，session 级）**

| Slot | kind | scope | 声明处 |
| :--- | :--- | :--- | :--- |
| conversation.chat.node | keyed | session | .../contract/slots.d.ts:144（**正文行唯一扩展点，按 kind 注册**） |
| conversation.chat.commandview | keyed | session | 同上 :171 |
| conversation.chat.turnTail | chain | session | 同上 :181 |
| conversation.chat.assistant-actions | list | session | 同上 :191 |
| conversation.message.images | single | session | 同上 :161 |

**(e) 右栏（dsh-client-ui-sidebar-right 等，session 级）**

| Slot | kind | scope | 声明处 |
| :--- | :--- | :--- | :--- |
| rightbar.session | single | session | .../contract/slots.d.ts:14 |
| sidebar.right.pane.tab | keyed | session | 同上 :26（**tab 正文**） |
| sidebar.right.pane.tab.title | keyed | session | 同上 :40（**tab 标题 chip**） |
| sidebar.right.tab.guide | chain | session | 同上 :51（引导页替换） |
| sidebar.right.tab.menu.item | list | session | 同上 :66 |
| sidebar.right.tab.document | keyed | session | dsh-client-ui-sidebar-documentpreview/.../document/contract.d.ts:25 |

**(f) 其它宿主功能槽**

| Slot | kind | scope | 容器 |
| :--- | :--- | :--- | :--- |
| conversation.approval.detail | single | session | dsh-client-ui-approval/.../contract/slots.d.ts:19 |
| conversation.trajectory.images | single | session | dsh-client-ui-trajectory/.../trajectory-contract.d.ts:85 |
| tool.call.toolview | keyed | session | dsh-client-ui-tool/.../contract/slots.d.ts:7 |
| tool.call.images | single | session | 同上 |
| tool.view.cordis | keyed | session | dsh-client-ui-cordis/.../slots.d.ts:16 |
| settings.trigger / settings.close / settings.header / settings.section / settings.onboarding / settings.plugins.tab / settings.general.item / settings.action | root | — | dsh-client-ui-settings/.../contract/slots.d.ts:12 起 |
| settings.models.provider-card / settings.models.footer | keyed/list | root | dsh-client-ui-settings-models/.../slot-contract.d.ts:21 |
| settings.plugin.item | keyed | root | dsh-client-ui-settings-plugins/.../slot-contract.d.ts:17 |
| conversation.hero.workspace.directoryFlow | single | root | dsh-client-ui-workspace/.../contract/slots.d.ts:49 |
| sidebar.workspaces.directoryFlow | single | root | 同上 |

> 说明：conversation.hero.agentPreset 由 dsh-client-ui-agent-preset 实际占用；sidebar.panellist / main 的占用示例见 A3。

### A3. 有没有适合「编年史 / 卡片展厅」的顶栏或导航槽？

**结论**：
1. **没有独立的「顶栏」slot**。帧只声明四个子槽：sidebar（左栏）、main（主区，keyed）、rightbar（右栏）、shell.overlay（全帧浮层）。所谓「头部」是**会话头部** conversation.session.header.*（在会话视图内部，不是全局顶栏）。
2. **最正统的「展厅」入口 = 一个 main 主区面板 + 一个同名的 sidebar.panellist 导航图标**。sidebar.panellist 文档明确写着：\"Each list id addresses the matching main panel; the sidebar owns the button and resolves its label from list metadata.\"（`dsh-client-ui-sidebar/lib/types/client/contract/slots.d.ts:35-43`；目录文档 `dsh-cordis-client-runner/lib/client.js:4120`）。侧栏按钮点击实现是 `selectPanel(id)`（`dsh-client-ui-sidebar/lib/client.js:117-119`），面板元数据从 list 注册项读出（同文件 :344-361）。
3. 若只想放一个**帧级浮动入口/徽章/抽屉**，用 shell.overlay（list/root，可叠加、默认 click-through，条目需自行开启 pointer-events）。
4. 若想复用现有右栏形态，用 sidebar.right.pane.tab（见 D12）；但主区面板更适合大尺寸「卡片展厅」。

**注册示例（主区展厅 + 左栏导航）**：

```ts
import type { Context } from '@deepseek-ai/cordis'
import { h } from 'react' // 或 JSX

export const inject = ['slots', 'layout', 'locale']

export function apply(ctx: Context): void {
  const t = ctx.locale.bind('rrp')
  const KEY = 'rrp-chronicle'

  // 1) 主区面板：keyed/root，key 就是导航 id
  ctx.slots.inject('main', () => ctx.slots.register(
    { name: 'main', key: KEY },
    ChronicleGallery,           // 组件收到 usePanelInfo / useSessions / ... 标准 props
  ))

  // 2) 左栏导航图标：list/root，id 必须与 main 的 key 相同
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
    { name: 'sidebar.panellist', id: KEY, order: 40, label: () => t('chronicle') },
    ({ size, active }: { size: number; active: boolean }) => h(ChronicleGlyph, { size, active }),
  ))

  // 3) 可选：帧级浮动「卡片展厅」按钮（注意浮层是 click-through）
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    { name: 'shell.overlay', id: 'rrp-chronicle-fab', order: 10 },
    () => h('div', { style: { pointerEvents: 'auto' } }, h(ChronicleFab)),
  ))

  // 4) 程序化切到该主区（MainPanelId 是 brand，插件侧用字符串即可，必要时 as never）
  // ctx.layout.selectPanel(KEY as never)
}
```

> ⚠️ 不要注册进 root：`registry.d.ts:17-31` 警告——root 是 single，二次注册会**阴影**掉整个 AppFrame（侧栏、会话、右栏全部消失）。

### A4. 复用宿主原子库：`@deepseek-ai/dsh-client-ui-primitives`（platform module）

**结论**：插件客户端 bundle **可以直接复用宿主自己的 UI 原子**，观感与主题（亮/暗）自动一致，无需自建样式栈。

**证据链**（已装宿主 0.1.5-rc.2）：

1. 宿主 web 前端的模块表（`dist/assets/index-*.js`）里，`PLATFORM_MODULES` 固定注入以下模块给所有插件 bundle 的 `require`：

   ```
   react · react/jsx-runtime · react-dom · react-dom/client
   @deepseek-ai/cordis · @deepseek-ai/dsh-client-store
   @deepseek-ai/dsh-client-ui-slots
   @deepseek-ai/dsh-client-ui-primitives
   @deepseek-ai/dsh-client-ui-dockkit
   ```

2. `dsh-client-ui-primitives` 的运行时导出（自宿主 bundle 实测）：`Button` / `Pill` / `Input` / `StateDot` / `DisclosureRow` / `Tooltip` / `Modal` / `Menu` / `HoverCard` / `Toast` / `JsonTree` / `MarkdownText` / `MessageText` / 以及全部 `Icon*` 图标；**只吃 `--dsw-*` token**，天然跟随明暗主题。

3. 构建侧：把该裸标识符列为 externals（见 `tsdown.config.ts` 的 `CLIENT_EXTERNALS`），**不要打进 bundle**——运行时由模块表提供；打进反而会与宿主重复且拿不到 CSS module 的哈希类名。

**落地做法（本项目）**：

- 类型：`src/client/primitives.d.ts` 声明**结构面**（只声明用到的原子），因为该包不是已安装依赖，构建期也不需要解析它。
- 测试：vitest 里 Node 解析不到该裸标识符，用 `vitest.config.ts` 的 alias 指向 `tests/stubs/ui-primitives.ts`（永不渲染，中性组件即可）。
- 组件样式：宿主 CSS 在构建期已产成哈希类名（如 `_button_cfgyt_4`），导入的原子自带样式；我们只负责布局，并在需要时叠加 `--dsw-alias-*` token。

**边界**：模块表是**冻结**的（列表固定），不能 require 任意宿主内部模块；要新增原子依赖必须走「自建设计 token 的普通 React 组件」，或直接复用上面这张表里已有的原子。

### A5. 会话事件词表是「封闭」的：插件**不得自造事件类型**

**结论（血的教训）**：插件用 `Session.append('my-plugin/event', ...)` 写自定义事件类型，会让**整个会话日志之后都无法被宿主读取**，前端出现红色 `历史加载失败 … unknown to this harness and not marked ignorable`。

**证据链**（已装宿主 0.1.5-rc.2）：

1. `dsh-session-persistence` 的读路径 `validateStoredEvents` / `assertEventsSupported`：

   ```js
   if (!KNOWN_SESSION_EVENT_TYPES.has(event.type) && event.ignorable !== true)
     throw unsupported('… contains event type "…" unknown to this harness and not marked ignorable; refusing to interpret the log')
   ```

2. `KNOWN_SESSION_EVENT_TYPES` 是**构建期生成**的常量集合（`gen-persistence-catalog`，本机 56 个），注释明确写着：out-of-repo 插件事件天然不在表内，**事件名注册被否决**（"would make reads composition-dependent"），唯一兼容机制是事件信封上的 `ignorable: true`。

3. **但是** `Session.append(type, data, opts?)` 的 `opts` 只接受 `surfaceOp/sourceEventSeqs`（surface 事件）或什么都不接受（非 surface 事件）——**没有任何公开 API 能设置 `ignorable`**。消费方可读 `ignorable`，生产者却写不出，所以在本版本上「自造事件类型」= 制造不可读日志。

**正确做法（本项目采用）**：状态**寄生在已知的 `user/message` 事件里**，放在消息的 `source` 字段（模型只看 `content`，`source` 不进 provider 请求）：

```ts
session.append('user/message', {
  id, role: 'user',
  content: [{ type: 'text', text: renderWorldState(state) }],   // 模型可见
  source: { kind: 'plugin', plugin: 'dsh-rrp', rrp: { worldState: state } }, // 结构面，仅本地投影读
}, { surfaceOp: 'append' })
```

> 校验器 `validateSessionEventData` 对 `user/message` 的 `source` **不做字段白名单**，所以附加 `rrp` 字段是安全的。

**日志修复**：老版本写下的 `rrp/*` 事件可用 `scripts/repair-legacy-sessions.mjs` 补上 `ignorable:true`（默认 dry-run，`--apply` 会留 `*.pre-ignorable.bak`）。**注意 zstd 物理格式**：会话日志是**多帧**拼接，且宿主断言**第一帧必须恰好是一行 header**（`assertZstdHeaderFrame`）；把整个文件重压成单帧会得到 `corrupt Zstandard session log: first frame is not exactly one header line`。

**旁注**：活动账本（谁改了状态）刻意**不进会话日志**——它是玩家可见、模型不可见的簿记，改为宿主内存 + `GET /dsh-rrp/activity` + 面板轮询。

## B. 从客户端以「指定 preset + 开场白」新建会话

### B4. 编程式新建会话并设置 agent preset

**结论**：
- 新建（含列表集成）：`ctx.sessions.create(opts)`，**opts 里没有 preset 字段**。
- preset 有两条原生路径：
  1. **建后再选**（宿主自带 UI 的正规路径）：`ctx.remote.agentPresets.select(sessionId, presetId)`，只允许会话**仍是空白**时切换。
  2. **建时直传**（底层 remote，绕过 client 列表集成）：`ctx.remote.session.create({ agentPreset })`。

证据：
- `dsh-api-session-controller/lib/types/client/contract/sessions.d.ts:33-37`：`create(opts?: { workspaceId?; cwd?; sessionId? }): Promise<SessionId>`。
- 具体类实现与同步可寻址保证：`.../client/sessions/service.d.ts:247-251`（promise resolve 时新会话已在 list store 且 binding 可解析）。
- 选择的远端方法：`dsh-agent-presets/lib/typert.remote-client.d.ts:15` `select: (agentId, agentPreset) => Promise<RemoteResult<string>>`；`:22` `'agentPresets/select'`；语义见 `dsh-agent-presets/lib/types/index.d.ts:361-369`（仅空会话可换、`agent-preset/locked` 拒绝）。
- 建时直传字段：`dsh-api-session-controller/lib/types/types.d.ts:253-258` `SessionCreateRequest { workspaceId?, cwd?, sessionId?, agentPreset? }`；远端入口 `.../typert.remote-client.d.ts:19,41` `'session/create'`。
- `ctx.remote` 服务声明：`dsh-api-remotes/lib/types/client/index.d.ts:51-55` `interface Context { remote: ClientRemote }`；注入名 inject（同文件 :58）。宿主自带 client 调用示例：`dsh-client-ui-agent-preset/lib/client.js:1356` `const result = await this.ctx.remote.agentPresets.select(session.id, staged)`。

**推荐最小流程**（与宿主 dsh-client-ui-agent-preset 的 seat-store 一致：先 create 得到空白会话，再 select）：

```ts
// client 插件 context 需要 inject 里含 'sessions'（对象层）与 'remote'（远层）
const sessionId = await ctx.sessions.create({ workspaceId, cwd })
// 会话此时仍是空白；立即指定 preset（否则宿主用部署默认值）
const r = await ctx.remote.agentPresets.select(sessionId, 'rp')
if (!r.ok) throw new Error(r.error.message)
ctx.sessions.open(sessionId)          // 切为当前会话
// 之后即可拿 binding 发首条消息（见 B5）
```

> 注意：ctx.sessions.create 的 opts 有意不暴露 agentPreset（`dsh-client-ui-agent-preset/lib/types/client/seat-store.d.ts:1-11` 解释了原因：新会话屏上没有会话，选择是 staged 的）。若直接调 ctx.remote.session.create({ agentPreset })，client 端列表/对象层不会自动感知，需要自行 ctx.sessions.refresh() 或依赖 api-session/added 事件；**不推荐**。

### B5. 能否在新建时注入首条 user 消息（开场白）？

**结论**：没有「带首条消息的 create」。原生做法是建完后对会话 prompt 一条 user 消息。

证据：
- `dsh-api-session-controller/lib/types/client/contract/session.d.ts:81-83`：
  `prompt(content: PromptContentPart[], mode: 'queue'|'steer', signal?, requestId?): Promise<RemoteResult<{accepted:true}>>`
- 乐观回显：`beginSubmission(input): SubmissionHandle`（同文件 :72；`BeginSubmissionInput` 在 :30-39）。
- 正文部件：`dsh-api-session-controller/lib/types/types.d.ts:64-75` `PromptContentPart = {type:'text',text} | {type:'image',...} | {type:'file',receiptId}`。
- 宿主真实调用：`dsh-client-ui-conversation/lib/client.js:2938-2958`（beginSubmission → session.prompt(content, mode, signal, submission.requestId)）。
- 也可用 scope 版：`ctx.conversation.send(text)`（`dsh-client-ui-conversation/lib/types/client/service.d.ts:38`；仅对当前会话）。

**最小片段**：

```ts
const binding = ctx.sessions.binding(sessionId)   // SessionBinding
if (!binding) throw new Error('session not addressable')
await binding.session.prompt([{ type: 'text', text: '（开场白）……' }], 'queue')
```

> 若开场白属于「卡包/模式」的一部分，宿主没有「preset 自带开场白」机制（见 B7），应由插件在创建后显式发出，或由卡片展厅选择卡包后拼出文本。

### B6. 宿主「命令」机制（/xxx）

有**两套**互补机制：

**(1) 宿主侧 ctx.commands**（在主机执行，直接对 agent 生效，不经过模型）
- `dsh-commands/lib/types/index.d.ts:91` `register(definition: CommandDefinition): () => void`
- CommandDefinition 于 :37-52：`{ name; description; input?; recordInput?; handler(invocation): CommandResult | Promise<CommandResult> }`
- CommandInvocation 于 :18-35：`{ commandId; agent; rawInput; attachments; signal }`
- `list(agent)` :103、`find(agent,name)` :110、`execute(...)` :139
- 生命周期事件 `command/run` / `command/done`（`dsh-commands/lib/types/types.d.ts:88-117`），会进会话日志。
- 限制：handler 在主机、拿到的是 Agent，**不能直接驱动浏览器 UI**（不能开面板/建会话）。适合「改状态、触发总结」这类后端操作。

**(2) 客户端 ctx.commandUi**（在浏览器执行，可驱动 UI）
- 服务：`dsh-client-ui-commands/lib/types/client/service.d.ts:34` `CommandUiRuntime implements CommandUiContract`；服务名 commandUi（同文件 :19-23）。
- `register(contribution)`：contract.d.ts:91；`decorate(decoration)`：:96。
- CommandContribution 于 :58-67：`{ name; description():string; available(session):boolean; ui: CommandUiSpec }`。
- ActionSpec 于 :42-49：`{ kind:'action'; run(session: ClientSessionContext): void }` —— **纯客户端动作**，可调用 ctx.sessions.create / ctx.remote.agentPresets.select / ctx.layout.selectPanel。
- PopupSelectSpec 于 :31-35：`{ kind:'popupSelect'; options(session, signal): Promise<SelectOption[]>; onSelect(option, session) }` —— **适合「选择卡包」**。
- ClientSessionContext 只有 `{ sessionId }`（`dsh-client-ui-input-trigger/lib/types/types.d.ts:19-21`）。
- 约束：客户端命令名与宿主命令名**同名会 fail-loud，不覆盖**（contract.d.ts:52-56）。

**最小片段（客户端 /gallery 打开卡片展厅；/pack 弹选择）**：

```ts
ctx.commandUi.register({
  name: 'gallery',
  description: () => t('cmd.gallery'),
  available: () => true,
  ui: { kind: 'action', run: () => { ctx.layout.selectPanel('rrp-chronicle' as never) } },
})

ctx.commandUi.register({
  name: 'pack',
  description: () => t('cmd.pack'),
  available: () => true,
  ui: {
    kind: 'popupSelect',
    options: async () => listCardPacks().map(p => ({ id: p.id, label: p.name, detail: p.description })),
    onSelect: async (opt, session) => { await applyCardPack(ctx, session.sessionId, opt.id) },
  },
})
```

> 宿主命令要能被 / 菜单看到，需要 client 的 ctx.commandUi 目录从 host catalog 拉取；客户端命令则无需宿主项。

### B7. dsh-agent-presets 的 preset 目录规范：除 agent.cordis.yml 还能声明什么？

**结论**：一个 preset = 一个目录，目录名即 id。必需 agent.cordis.yml；可选同目录 preset.yml（显示元数据）。**没有** icon、首条消息/开场白、其他模式字段。目录内其余文件（如 skills/）由 composition 行以相对路径引用。

证据：
- 组合文件常量：`dsh-agent-presets/lib/types/discovery.d.ts:25` `COMPOSITION_FILE = 'agent.cordis.yml'`。
- 元数据文件：`dsh-agent-presets/lib/types/metadata.d.ts:20` `METADATA_FILE = 'preset.yml'`；`PresetMetadata` 于 :22-33，**仅** `{ name?; description?; order? }`。
- id = 目录名、trust 来自扫描根，**均不可由 preset 自声明**（metadata.d.ts:10-12）。
- 发现与健康：discovery.d.ts:63-80；运行时行对象 `preset.d.ts:18-38` `AgentPreset { id; trust; path; name?; description?; order?; broken? }`。
- 客户端读到的 roster 行：`dsh-agent-presets/lib/types/types.d.ts:9-29`（path-free）。
- 本项目现值：`dsh-rrp/presets/rp/agent.cordis.yml`（persona + skill-filesystem + tool-skill）、`dsh-rrp/presets/rp/preset.yml:1-3`（name/description/order），与规范一致。

> 因此「开场白/图标」必须由插件自己承担：图标可用 slug 约定或插件侧映射；开场白在创建会话后由 B5 发出。


## C. 让「状态变更 Agent」的产出对玩家可见（可归因）

### C8. 会话事件类型总目录

**权威结构**：SessionEventMap 是 declaration-merge 可扩展接口；每个事件形如 `{ type: K; seq; time; data: SessionEventMap[K]; ignorable?: true }`（`dsh-session/lib/types/types.d.ts:460-483`）。内置 13 个（`dsh-session/lib/types/types.d.ts:242-404`）：

turn/start、turn/end、step/start、step/end、user/message、system/message、assistant/message、assistant/attempt、tool/call、tool/result、request/header、request/context、session/end-seed。

其中**只有 4 个是 ordered surface 事件**（必须携带 surfaceOp）：`type SurfaceEventType = 'system/message' | 'user/message' | 'assistant/message' | 'tool/result'`（types.d.ts:413，SurfaceOp :429）。

宿主安装树内全部 SessionEventMap 增强（实测 52 个，按包归属）：

| 事件类型 | 声明包 |
| :--- | :--- |
| turn/start, turn/end, step/start, step/end, user/message, system/message, assistant/message, assistant/attempt, tool/call, tool/result, request/header, request/context, session/end-seed | dsh-session |
| agent-preset/selected | dsh-agent-presets |
| agent/inbox/spliced | dsh-agent |
| approval/asked, approval/decided, approval/policy | dsh-user-approval |
| command/run, command/done | dsh-commands |
| compaction/start, compaction/end, compaction/prune, compaction/summary | dsh-compaction |
| deliverables/presented | dsh-tool-present |
| feedback/message-delete, feedback/message-put | dsh-message-feedback |
| feedback/record | dsh-command-feedback |
| goal/change | dsh-goal |
| hook/invoked, hook/result | dsh-hook-protocol |
| llm/retry, llm/retry-started | dsh-llm-retry |
| model/selection | dsh-api-session-controller |
| permission/preset | dsh-permission-presets |
| plan/mode | dsh-plan-mode |
| sandbox/mode | dsh-sandbox-policy |
| schedule/change | dsh-schedule |
| session-log-deepseek/delivery-accepted | dsh-session-log-deepseek |
| session/title | dsh-session-title |
| session/title-llm-request | dsh-session-title-llm |
| subagent/catalog, subagent/descriptor | dsh-subagent |
| subagent/model-selection-policy | dsh-tool-subagent |
| todo/write | dsh-tool-todo |
| tool-workflow/run-start, run-end, agent-start, agent-end | dsh-tool-workflow |
| tool/ptc-dispatch, tool/ptc-dispatch-start | dsh-tools |
| web/deepseek-search-llm-request | dsh-web-search-deepseek |

> 追加事件：`declare module '@deepseek-ai/dsh-session/types' { interface SessionEventMap { 'rrp/chronicler': {...} } }`。日志只认本仓库已知 type；**外部插件事件必须带 ignorable: true**，否则持久化读路径会拒绝整个日志（`dsh-session/lib/types/known-event-types.d.ts:8-19`）。jobs 的 SessionJob 行只列 `id/kind/label/status/detail/startedAt/finishedAt`（`dsh-api-session-controller/lib/types/types.d.ts:499-508`）。

### C9. 哪些事件会在聊天/会话视图里渲染成可见内容？渲染分支在哪？

**两套可见渲染面，别混淆**：

**(a) 聊天正文（Chat target）** —— 由 ChatNodeDataMap（declaration-merge 可扩展）的 kind 决定，渲染注册在 `dsh-client-ui-chat/lib/client.js:3689-3774`（每个 kind 对应一个组件）：

| Chat node kind | 触发事件 | 渲染组件（注册处） |
| :--- | :--- | :--- |
| user / steering / context | user/message（按 source 分：人/steering/注入上下文） | UserMessageNodeView / ContextMessageNodeView（client.js:3690-3704） |
| assistant-step | assistant/message（含流式/中断） | AssistantNodeView（:3710） |
| tool-call | tool/call + tool/result（+ tool/ptc-dispatch） | Tool 渲染器（:3769 前；kind 定义 conversation-nodes/tool.d.ts:5） |
| command / manual-compaction | command/run + command/done（+ compaction 关联） | CommandNodeView / ManualCompactionNodeView（:3715-3728；定义 conversation-nodes/command.d.ts:4-9） |
| compaction | compaction/start/summary/end | CompactionNodeView（:3729） |
| model-retry | llm/retry、llm/retry-started | RetryNodeView（:3734） |
| turn-error | turn/end reason error | TurnErrorNodeView（:3739） |
| turn-max-tokens | turn/end reason max-tokens | TurnMaxTokensNodeView（:3744） |
| system-prompt | system/message / request/header | SystemPromptNodeView（:3705；定义 conversation-nodes/request-prompt.d.ts） |
| turn-process / turn-tail | turn 级聚合（工具/思考折叠、尾部动作） | TurnProcessNodeView / TurnTailNodeView（:3749-3768） |
| unknown | 未被任何 Definition 认领的 **surface append** 事件 | UnknownNodeView（:3769；fallback） |
| command-input | command/run（/goal 专用） | 见 dsh-client-ui-goal/lib/types/client/goal-command-input.d.ts:12-16 |
| workflow-run | tool-workflow/run-* | dsh-client-ui-workflow-run/.../workflow-definition.d.ts:27-31 |

**(b) 会话内其它可见面**（不是正文行）：conversation.session.header.*（标题/动作/工具）、conversation.view（Chat / Trajectory 两个视图 Tab）、conversation.composer（审批接管，见 dsh-client-ui-approval/.../contract/slots.d.ts:86-88）、conversation.input.dock（todo dock：dsh-client-ui-conversation/.../TodoPanel.d.ts:12-20；goal bar：dsh-client-ui-goal/lib/types/client/slots.d.ts:1-8）、conversation.input.plan（plan chip）。

**(c) 只进轨迹面板（Trajectory target）**：dsh-client-ui-trajectory 作为 conversation.view 的一个 Tab，自己组装 TrajectorySnapshot（trajectory-contract.d.ts:47-64）。诸如 request/header、request/context、assistant/attempt、tool/ptc-dispatch、step/* 等「过程证据」主要在这里以阶段账本形式呈现，而不是聊天正文行。

**哪些事件「不直接可见」**（只进投影/面板/日志）：goal/change、todo/write、plan/mode、permission/preset、sandbox/mode、model/selection、session/title*、approval/*（走 composer 接管而非正文）、feedback/*、subagent/*、hook/*、schedule/change、agent-preset/selected、session/end-seed、step/start、step/end、turn/start、request/context、tool/ptc-dispatch。deliverables/presented 通过 turn-tail 链可见（dsh-client-ui-deliverables/.../turn-deliverables.d.ts:19-23,52）。

**让自定义事件（如纪事官产出）可见的正规扩展点**：

1. 声明合并一个 Chat node kind：
   `declare module '@deepseek-ai/dsh-client-ui-chat/client' { interface ChatNodeDataMap { 'rrp-chronicle': MyData } }`
2. 用 ctx.uiConversation 注册一个 event Definition（把事件折成 Context 并产出 Node）：
   - UiConversation 服务类型：dsh-client-ui-conversation/lib/types/client/conversation/assembly.d.ts:31-37 `{ events: ConversationEventRegistry; views: ConversationViewRegistry }`；服务名 uiConversation（.../client/index.d.ts:32-33）。
   - `events.register(definition)`：.../conversation/event-registry.d.ts:11；`registerFallback(...)`：:17。
   - ConversationNodeDefinition<State> 形状：.../contract/conversation.d.ts:157-208（kind、target、match(event)、start(...)、update(...)、buildViewNode(context)）。
   - View target：`views.register(viewDefinition)`（conversation/view-registry.d.ts；ConversationViewDefinition 在 contract/conversation.d.ts:237-247）。
3. 把组件注册进 conversation.chat.node，key = 你的 kind：
   `ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name:'conversation.chat.node', key:'rrp-chronicle', locale:'rrp' }, ChronicleNodeView))`

> 关键点：**未知 surface 事件**会被 unknown fallback 兜底渲染（可能不是你想要的样式）；**非 surface** 的自定义事件（如 rrp/chronicler）默认完全不出现，必须靠上面的 Definition 认领。若只想「系统提示/旁白」式一行可见文本，最省事的是追加一条 user/message（带 source）或 system/message，但会进入模型可见历史（dsh-session types.d.ts:274-298），RP 场景要慎用。

### C10. ctx.jobs：spec 类型、客户端展示、进度上报

**完整 spec**（`dsh-jobs/lib/types/types.d.ts:39-83`）：

```ts
interface JobStart {
  kind: JobKind                      // 'bash' | 'subagent' | 你的 merge 扩展
  label: string                      // 单行、面向模型的标签
  outputLimitBytes?: number
  owner?: Agent                      // 省略 => 无主任务
  run(): JobHooks                    // 同步返回 hooks；抛错则什么也不注册
}
interface JobHooks {
  cancel(reason?: string): void
  done: Promise<JobOutcome>          // { status:'completed'|'killed'|'failed'; detail?; output? }
  readOutput?(): string              // 消费自上次以来的增量；存在 => 流式任务
}
```

- 启动：`dsh-jobs/lib/types/index.d.ts:56` `abstract start(spec: JobStart): JobId`；相关 list/get/read/kill/wait/onJobDone/onJobsChanged/attachController 于 :63-142。
- kind 可扩展：types.d.ts:19-24 `interface JobKindMap { bash:'bash'; subagent:'subagent' }` —— 用 `declare module '@deepseek-ai/dsh-jobs/types' { interface JobKindMap { rrpChronicler: 'rrp-chronicler' } }` 注册自己的 kind。
- snapshot：types.d.ts:88-119 `JobSnapshot { id; kind; label; outputLimitBytes?; ownerSession?; status; detail?; startedAt; finishedAt?; reported }`。

**客户端 dsh-client-ui-jobs 怎么显示**：它不接受独立 RPC，数据来自会话列表镜像 jobsBySession（`dsh-client-ui-jobs/lib/types/client/index.d.ts:1-7`），注册一个**会话头部动作** conversation.session.header.actions（JobListAction.d.ts:4,12），渲染逻辑在 `dsh-client-ui-jobs/lib/client.js:178-198`：
- job.kind（副标题，:188-192）、job.label（主标题，:192-193）、`job.detail ?? statusLabel(status)`（状态行，:196-198）。
- **owner 不显示**（owner 只用于鉴权/归属）。

**能否上报进度/中间消息？**
- **没有 progress API，也没有运行中可变的 detail**（detail 只在 JobOutcome 结束时提供）。
- 唯一的中间输出通道是 JobHooks.readOutput?() 的**流式增量**；它面向 ctx.jobs.read / 工具的 job_output，**头部 popover 不渲染它**。
- 想让玩家在 UI 看到「纪事官推演中…/进度」：用**会话投影**（ctx.sessionProjections）或你自己的 client 组件读取 useProjection，而不要指望 job 行。项目现在正是这么做的：dsh-rrp/src/activity.ts + world-state-tab.tsx:245-259 的「最近变更」区块。
- 任务完成要「对玩家可见」：job 本身只是头部一行；更可靠的是 job 的 done 里把结果写成**会话事件/投影**，再由正文或右栏渲染。

### C11. 文档里的 custom/notify 是什么？

**结论：它不是宿主真实事件，而是文档里的「声明合并示例」。**

证据：`dsh-rrp/docs/reference/dsh-plugin-development-research.md:130-137` 在「2.5 Typed Events and Dispatch Modes」用一段示意代码演示如何用 `declare module '@deepseek-ai/cordis' { interface Events { 'custom/notify'...; 'custom/intercept'... } }` 声明自定义事件——custom/notify 和 custom/intercept 都是**虚构名字**。在安装树里检索 custom/notify **零命中**。

语义（若真按 Cordis 事件声明）：它是 ctx.emit 的 emit 模式同步广播（同一文档 :140-148 的模式表）。它与会话日志**无关**：不写 SessionEventMap 就不会持久化、不会渲染；若想让「状态变更通知」留档，应改用 Session.append + 自定义 SessionEventMap 事件（见 C8），或直接用会话投影。

---

## D. 右侧栏 / 布局服务

### D12. dsh-client-ui-sidebar-right 注册 tab 的精确 API

**两阶段注册**（tab 类型 + tab 正文），服务名 sidebarRightTabs 与 sidebarRight（`dsh-client-ui-sidebar-right/lib/types/client/index.d.ts:40-46`）：

**阶段一：类型** —— `SidebarRightTabRegistry.register(definition)`（`tab-registry.d.ts:153`）：

```ts
interface SidebarRightTabDefinition {
  readonly id: string          // 实现身份，也是正文/标题注册的 key（唯一）
  readonly kind: string        // 类型判别，openTab 用
  readonly patterns?: readonly string[]  // 资源地址 glob；page 类型省略
  readonly priority?: 'extension' | 'builtin' | 'fallback'  // 默认 extension
  readonly canOpen?: (address: string) => boolean
  readonly title: (address: string) => string   // chip 初始文本
  readonly guide?: readonly SidebarRightGuideEntry[]  // { order, title(), description?, icon? }
}
```

**阶段二：正文 / 标题**（keyed seat，key = definition.id）：

```ts
// 正文：sidebar.right.pane.tab  (slot contract:26)
ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
  { name: 'sidebar.right.pane.tab', key: TAB_ID, locale: 'rrp',
    inject: () => ({ t }) },
  PanelBody,
))
// 可选动态标题：sidebar.right.pane.tab.title (slot contract:40)
ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register(
  { name: 'sidebar.right.pane.tab.title', key: TAB_ID, locale: 'rrp', inject: () => ({ t }) },
  PanelTitle,
))
```

- 正文组件通过注入面拿到 hooks.tabInfo（SidebarRightTabInjected，contract/slots.d.ts:141-145），可读 SidebarRightTabInfo（:117-134：sidebar.expanded/fullscreen、panel.id、tab.visible/navigation/actions、signal）。
- **能否 open/activate？** 通过 ctx.sidebarRight（ISidebarRight，service.d.ts:105-168）：
  - openTab(kind, options?) :125；openResource(address, options?) :118
  - toggleExpanded() :142；focus(tabId) :147；active() :135；isExpanded() :140
  - close/split/float/dock :130/156/162/167
  - openResource 文档明确「The column expands in the same step」（:113-114）。
- 资源地址 glob 规则与优先级：tab-registry.d.ts:9-26,32-43；同 kind 的 builtin/extension 共存与顶替见 :18-23。
- 本项目现成模板：`dsh-rrp/src/client/world-state-tab.tsx:320-338`（ctx.sidebarRightTabs.register + ctx.slots.register({name:'sidebar.right.pane.tab', key:TAB_ID, ...})）。

> 若只想「打开已有右栏 tab」：`ctx.sidebarRight.openTab('rrp-worldstate')`。若只想展开右栏：`ctx.sidebarRight.toggleExpanded()`。

### D13. ctx.layout（dsh-client-ui-layout）viewing-state 服务

服务名 layout（`dsh-client-ui-layout/lib/types/client/index.d.ts:17-21`），面为 ILayout（`service.d.ts:24-48`）：

```ts
interface ILayout {
  selectPanel(panelId: MainPanelId | null): void   // 选主区全局面板；null = 回到当前会话
  beginNavigation(): AbortSignal                    // 异步导航竞态控制
  toggleSidebar(): void                             // 左栏开合
  openRightbar(track: boolean, fullscreen: boolean): void  // 只报告右栏呈现，不改 expanded 状态
  closeRightbar(): void
}
```

- 实现类 LayoutController（service.d.ts:50-71）；PanelInfo.activePanelId（:17-20）。
- **没有「切换右栏 tab」的方法**：tab 导航属于 ctx.sidebarRight（见 D12）。openRightbar 只做几何/呈现报告（由右栏占用者自己调用，见 sidebar-right/lib/types/client/index.d.ts:14-16）。
- **程序化打开某个右侧栏 tab**：`ctx.sidebarRight.openTab(kind, options?)`（自带展开）；或先 `ctx.sidebarRight.toggleExpanded()` 再 `ctx.sidebarRight.focus(tabId)`。
- **程序化切主区**：`ctx.layout.selectPanel(key or null)`；key 需已被 main 槽注册，否则 throw（layout/service.d.ts:27-29）。
- 主区面板的导航按钮外观由 sidebar.panellist 提供（A3）。

---

## E. 一句话摘要

- **最省事的可见化入口**：把纪事官产出写成**会话投影**（已有 ctx.sessionProjections + 右栏 tab 范式），或对**自定义会话事件**用 ctx.uiConversation.events.register + conversation.chat.node 注册一个正文卡片；「卡片展厅」最正统的落点是 **main 主区面板 + 同名 sidebar.panellist 导航**。
- **新会话 + preset + 开场白**：ctx.sessions.create({workspaceId}) → ctx.remote.agentPresets.select(id,'rp')（空会话才可）→ ctx.sessions.binding(id).session.prompt([{type:'text',text}],'queue')；**没有「create 时带首条消息」的 API**。
- **不存在/需绕路的能力**：① 没有全局顶栏 slot（用 main/shell.overlay/会话头部代替）；② preset 目录**没有开场白/图标字段**（preset.yml 只有 name/description/order）；③ job **没有进度 API**，dsh-client-ui-jobs 只显示 kind/label/detail/status（不显示 owner、不渲染 readOutput 流）；④ custom/notify 是文档虚构示例，不是真事件；⑤ ctx.layout 不能切右栏 tab，只有 ctx.sidebarRight.openTab/focus/toggleExpanded。
- **文档状态**：本文件为唯一产出物；未改动任何源码、未运行构建/测试。

