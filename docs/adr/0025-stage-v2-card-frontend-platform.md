# 舞台 v2 重做：卡包前端应用平台（2026-09-26 拍板）

> 状态：已实现（一期交付，Round-6 T42–T48 全 PASS）
> 原编号：D25 · 索引见 [README.md](./README.md)


**背景**：issue #18 交付后（Round-6 T42–T48 全 PASS）进入功能维护期。重做前三路勘察确认：① 工程质量债确凿（宿主接缝未声明、response body 双读、静默失败、类型洞、模块级全局缓存脏读、`characterCard` 不在场过滤）；② 宿主边界明确（无官方 iframe 桥/沙箱页服务；`InputActions.setDraft/submit` 输入机可程序化发消息，`ui-conversation/contract/input.ts:222`；`RiskConfirmation` 原子可用）；③ 社区参照卡 `eg.png`（酒馆 pjsk 天马咲希前端卡，17.4MB，456 条 lorebook + 160KB 注入式状态 HUD + CDN 变量框架 mvu）解剖显示：玩家真实期待是**卡包自带完整前端应用**（开局表单、状态 HUD、拖拽面板、驱动叙事），其越权能力（写世界书/变量/触发续写）在本插件架构内均有确认环等价物。

**决策（40 题拷问访谈全部按建议锁定）**：

1. **定位**：舞台 = 卡包前端应用平台。L1 声明式 HUD（卡作者零前端）与 L2 完整应用两档并存；世界状态页签=编辑面，舞台=呈现面+叙事交互，分工不合并。
2. **渲染面**：维持 `conversation.view` 第三页签（D21 不动，聊天流内仍零插件内容）；入口强化=会话记住上次停留页签；舞台存在感靠页签内做强（全幅布局、卡自绘主题）。`ui-schema` 契约兼容保留（旧卡零改动）。
3. **资源政策**：`ui/` 升级为**多文件资产目录**（html/css/js/图片/字体，类型白名单），插件只读路由整树伺服 + `Access-Control-Allow-Origin: *`（opaque origin 下字体/@font-face、fetch、ESM 均依赖 CORS）；iframe 由 srcdoc 改 **src 指向插件路由**，CSP 从 `default-src 'none'` 放宽为 **`'self'`**（仍是 `allow-scripts` 且不给 `allow-same-origin`，父窗口不可达不变）；**外链零放行**（个人单机，离线可玩，图床不失效）；卡包零外部 JS 框架依赖，官方 **stage-kit**（css+js runtime，主题 token 对齐宿主）补偿开发体验；卡页面无持久存储（单一事实源=投影）。
4. **写面修订**（DESIGN.md §2.4 与 CARDS.md §13.3 同步修订）：状态写唯一通道仍是 `correct_state`（归因 player）；叙事动作扩展为三原语——`ask_copilot`（预填月停）、`send_message` **代拟发言**（卡内按钮按预写 `trigger` 模板以玩家身份发送，走宿主输入机 `setDraft+submit`，归因玩家，RP 设置可关）、`draft_lore`（设定集草稿暂存，必须玩家过 D8 确认环才落盘）。**绕过确认环的状态写永远不存在**。危险动作（大 patch / lore 草稿）弹宿主 `RiskConfirmation`。
5. **桥协议 v2**：`rrp:hello` 带版本号，父侧回能力集（协议号+动词表），v1 卡按旧语义兼容；入向=世界状态全量推送（player 过滤后）+卡身份+最新回合正文，投影更新即推+100ms 节流；出向=四原语+`resize`；`event.source` 校验与 20 次/秒限流维持。
6. **L1 扩充**：新增 image / progressRing / tagList / richText 四组件；布局加 tab 分组+折叠+响应式列宽；L1/L2 混排维持。表达不了的仍引导 L2，L1 不图灵完备的红线不变。
7. **布局视觉**：app 面板全幅优先，L1 面板收侧栏抽屉；宿主 `--dsw-*` token 打底，卡包可声明主题变量覆盖；官方统一空态/加载/失败三态（骨架屏+错误卡+重试），修掉静默失败。
8. **工程质量**：P0–P2 债纳入本票（宿主接缝声明、错误处理、类型收紧、缓存修复、在场过滤、按钮校验）；author-time 校验激活（`when` 路径警告补传初始状态、绑定路径、资产存在性）；开发模式热重载（manifest/资产变更即重校验，修复 error→absent 脏读）；测试=桥协议单测+沙箱 doc 快照+组件行为测试+eg 卡 e2e 真机。
9. **eg 改编测试卡**：`cards/pjsk-saki/`，一期范围=**状态栏 HUD 完整复刻**（26 角色面板、拖拽、幻灯片背景）；mvu 变量（affection/chars）映射为 WorldState 追踪对象+动态字段，Chronicler 提示词约束维护、按钮矫正兜底；456 条 lorebook **精选改编**（只留建团相关）进设定集；62 个图床 URL 构建期**全量本地化**进卡包 assets；建团页一期不做，其四原语能力由 eg 卡附「原语测试条」面板验收；归属 `cards/` 官方目录作长期测试资产。

**宿主关系**：程序化发消息=宿主输入机标准动作（`InputActions.setDraft/submit`，`conversation.view` 会话页签标准 props 直达），不绕过输入管线、不归因伪造；iframe 桥/CSP 仍全自维护（宿主无此服务）；静态资产伺服走 `ctx.webServer.register`（红线不破）。

**红线重申**：卡界面不进模型上下文/会话载荷；不发明会话事件类型；沙箱无 `allow-same-origin`；不自建 HTTP 服务器/SPA；多文件伺服保持只读、类型白名单、路径穿越防护。

**分期**：一期=决策 3/4/5/7/8/9（资源政策+写面+桥 v2+布局视觉+质量债+eg 状态栏）；二期=L1 四新组件与 tab 布局、建团页级复杂交互、stage-kit 扩充——视一期实测再排。

**实现状态**：待实现（规格 `.scratch/stage-v2/`，分支 `feat/stage-v2`）。
