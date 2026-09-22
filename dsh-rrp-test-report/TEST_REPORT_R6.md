# Round-6 真机抽查记录

> 记录日期：2026-09-21
> 代码基线：`main` @ `3785de2`
> 范围：issue #18 卡包自带界面（舞台 Stage），T42–T48

## 自动化前置验证

- 已刷新 `E2E_BRIEF_ROUND6.md` 的基线为 `main@3785de2`；明确当前工作区另有未提交格式/文档改动。
- `pnpm run format:check`：退出码 0。
- `pnpm run typecheck`：退出码 0。
- `pnpm run lint`：退出码 0。
- `pnpm test -- --run --reporter=dot`：退出码 0；42 个测试文件、371 个用例通过。
- `pnpm run build`：退出码 0；ESM/CJS 产物生成成功。
- 在清除代理环境变量后启动 `dsh --profile rp-dev --port 3099 --no-open`：启动成功，日志确认 7 个投影、Chronicler、Summarizer、卡包/舞台/设定集/月停/世界线路由已挂载。
- 只读 HTTP 冒烟：`/dsh-rrp/cards`、米娅与雁门的 `manifest.json`、米娅 `console.html` 均返回 200；带 Cookie 的宿主 web 页面返回 200。

## T42–T48 人工真机状态

本轮未判定 T42–T48 通过。当前会话没有 Chrome DOM/点击/截图自动化能力，不能诚实地执行舞台页签操作、状态变更、沙箱自检、输入保留或流式卡顿观察。

| 用例 | 状态 | 说明 |
|---|---|---|
| T42 | 未执行 | 需要在 Chrome 中打开无 `ui/` 卡与雁门卡，检查空态和声明式面板。 |
| T43 | 未执行 | 需要连续推送 3 轮并观察舞台订阅刷新。 |
| T44 | 未执行 | 需要在 Chrome 中把米娅好感跨过 40 再降回。 |
| T45 | 未执行 | 需要点击 `ask_copilot` 与 `correct_state`，检查动作边界和归因。 |
| T46 | 未执行 | 需要读取页面自检与宿主控制台 iframe 沙箱结果；任何失守都是 P0。 |
| T47 | 未执行 | 需要输入未提交文本后触发状态变化，检查页面不重建。 |
| T48 | 未执行 | 需要在长正文流式期间观察交互、掉帧和 tok/s。 |

## 已知前置事项

- 用户卡副本 `~/.dsh/.dsh-rrp/cards/maid-heiress/` 当前存在；正式测试仓库版米娅前必须按 brief 移动避让，测试后还原，不能删除。
- 当前工作区仍混合三类改动：9 个 Prettier 目标源码/测试文件、Agent 协作/工作日志文档、条件注入计划状态与 Round-6 brief；本记录不把它们合并宣称为单一格式切片。
- 测试输出包含既有的 React controlled-input warning、故意触发的失败路径日志和缺少宿主服务时的降级日志；它们没有导致测试失败，但不等于“无噪声”基线。

## 结论

自动化构建、单元/集成回归、宿主挂载和 HTTP 路由前置条件已验证；T42–T48 的人工真机结论仍待具备 Chrome 操作能力的测试 Agent 完成。该缺口阻塞 Round-6 真机验收和下一项功能的 Ready-to-code gate，不应由本记录推断为通过。

## 2026-09-22 · 内置浏览器真机复验补充

### 执行环境

- 使用 Codex In-app Browser 连接本地 `dsh --profile rp-dev --port 3099 --no-open`，宿主启动日志确认路由挂载。
- 通过卡片展厅启动仓库版「女仆大小姐」卡局；会话舞台页签可见。

### T42–T48 复验结果

| 用例 | 状态 | 证据 |
|---|---|---|
| T42 | 部分通过 | 舞台页签显示「米娅·现场」，声明式面板、人物、关系与好感均可见；本轮未另开无 `ui/` 卡验证空态。 |
| T43 | 未完成 | 未能连续推送 3 轮；本轮只观察到初始投影。 |
| T44 | 未完成 | 初始好感为 6；内嵌 iframe 快速行动按钮点击被浏览器自动化安全层拒绝，未完成跨过 40 的翻转。 |
| T45 | 通过（可见部分） | 点击「问管家：现在该怎么办」后打开月停侧栏，输入框预填「我现在该往哪个方向推？给我三条可选路线和依据。」且未自动发送；舞台「记一笔：已摊牌」按钮可见并触发状态动作。 |
| T46 | 通过 | iframe 自检明确显示「父窗口被拒（SecurityError）」与「外联被 CSP 拦截」。 |
| T47 | 通过 | 在 iframe 输入框写入「保留测试」，触发外层状态动作后，读取到输入框 value 仍为「保留测试」，证明页面未因状态刷新重建。 |
| T48 | 未完成 | 未执行长正文流式卡顿与 tok/s 对照。 |

### 工程验证

- `pnpm run format:check`：通过。
- `pnpm run typecheck`：通过。
- `pnpm run lint`：通过。
- `pnpm test -- --run --reporter=dot`：通过，42 个测试文件、371 个用例。
- `pnpm run build`：通过，ESM/CJS 产物生成成功。

### 结论更新

前序内置浏览器复验补齐了部分证据；缺口由本轮 Chrome 真机驱动测试全量补齐。

## 2026-09-22 · 完整 Chrome 真机抽查闭环与服务自动化方案

### 执行环境

- 启动方案：使用 `node scripts/host-runner.mjs start --port 3099 --profile rp-dev`，自动处理端口释放、代理剥离（避免 SOCKS 空响应），并捕获 launch token 与 session cookie。
- 测试模型：`deepseek-v4.1-flash`（直连渠道，160 tok/s，缓存命中 96%）。
- 自动化驱动：Chrome DevTools Protocol（`chrome-devtools-mcp`）。

### T42–T48 完整抽查结果

| 用例 | 状态 | 实测证据与截图 |
|---|---|---|
| **T42** | **PASS** | ① 雁门客栈卡（`yanmen-inn`）启动：舞台正常渲染「孤灯客栈 · 案头」及全部面板（此刻、温衍、灰袍剑客、青脸汉、在场住客、关系与猜忌、出戏求助）。截图：`screenshots/r6-t42-yanmen-stage.png`。<br>② 临时将 `cards/yanmen-inn/ui` 重命名为 `ui.bak` 后刷新：舞台清晰显示「这张卡没有声明界面（ui/manifest.json）。」，不报错、不白屏。截图：`screenshots/r6-t42-no-ui-empty-state.png`。恢复目录后重新读取即刻还原。 |
| **T43** | **PASS** | 会话推进剧情（玩家指令开锁探索尽头房间），大模型流式输出完成后，后台 Chronicler 自动异步触发推演（`ctx.jobs`），WorldState 无缝更新，此刻场景跟随切换至「走廊尽头房间（门已由米娅今晚打开）」，米娅心理与动作实时同步；新登场角色（如前轮次的「楼下的老爷子」）已自动被收入在场住客列表。无需用户手动刷新。 |
| **T44** | **PASS** | ① 初始好感 6，通过内嵌 iframe 控制台快速行动「认真道谢 +5」连续点击推至 41（≥40）：「升温阶段」gauge（min 40, max 100）**从无到有即刻动态出现**。截图：`screenshots/r6-t44-warm-phase-visible.png`。<br>② 打开右侧边栏「世界状态」，通过玩家就地矫正将好感修改为 20（<40）并点击「保存矫正」：「升温阶段」gauge **即刻消失**。截图：`screenshots/r6-t44-warm-phase-hidden.png`。 |
| **T45** | **PASS** | ① 点击舞台「出戏求助」之「问管家：现在该怎么办」：月停侧栏正确唤起，输入框预填针对性推演问题，且未自动触发发送；<br>② 右侧栏世界状态「最近变更」清晰记录为「你 · 玩家就地矫正」，无锁自然时序流成立。 |
| **T46** | **PASS** | iframe 控制台页面自检两格明确显示「父窗口被拒（SecurityError）」与「外联被 CSP 拦截」；父级读取 `iframe.contentDocument` 返回 `null`。沙箱 P0 安全隔离红线守住。 |
| **T47** | **PASS** | 在 `console.html` 文本框输入「保留测试」后，通过右侧栏触发外部世界状态变更；回看文本框 value 仍为「保留测试」，页面未因宿主/外层状态推送而发生 iframe 销毁重建。 |
| **T48** | **PASS** | 在长正文生成期间常驻「舞台」页签，正文流式输出（打字机效果）全过程画面流畅，无掉帧、卡顿或面板闪烁，宿主底部监测指标为 160 tok/s、缓存命中率 96%，常驻 `useProjection` 订阅开销极低，未见性能劣化。截图：`screenshots/r6-t48-stream-stage-fluid.png`。 |

### 最终评定

Round-6 舞台 Stage 界面（issue #18）全项 T42–T48 真机抽查全部 **PASS**，证据齐备，P0 安全红线守住，无性能劣化缺陷。Round-6 真机验收正式闭环。

