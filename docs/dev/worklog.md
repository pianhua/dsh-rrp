# WORKLOG.md — 工作区状态盘点（追加式，最新在上）

> 纪律（见 `docs/dev/workflow.md` 第 4 节）：已确认的内容必须落盘，上下文压缩后只认本文件。
> 每条带日期；事项关闭时标注（关闭 + 日期），不删旧条。

## 2026-09-22 · Round-7 条件注入机制 v1 全量真机闭环（issue #16 PASS）

### 已确认与已完成

- **工作区基线原子化固化**：
  - 经维护者明确指令，将既有工作区拆解并完成 3 个原子提交：
    1. `6597d35 style: 清理既有 Prettier 格式债务`（覆盖 9 个客户端与单测文件）
    2. `8fb1c11 docs: 建立人与 Agent 协作契约与开发工作流规范`（docs/agents/ 与 workflow 落地）
    3. `fb2e190 tool(dev): 落地 host-runner 自动化启动方案并忽略本地暂存`
  - 工作树彻底收敛恢复为纯净基线（clean working tree）。
- **Round-7 条件注入机制 v1（issue #16）真机验收全项通过（PASS）**：
  - **T49（初始未激活态）**：好感 10（<40）时，`GET /dsh-rrp/lore` 返回 `injectedChars: 0`，`triggers` 中 `maid-mia-warm` 与 `maid-mia-intimate` 均为 `active: false`（截图：`screenshots/r7-t49-inactive.png`）。
  - **T50（跨档激活 ≥40）**：好感调至 42 时，`maid-mia-warm` 即刻翻转为绿色「生效中」徽章，`injectedChars: 388`；事实载荷中正确追加【条件注入 · 裁决块】，含穷尽声明与调用纪律（截图：`screenshots/r7-t50-warm-active.png`）。
  - **T51（高阶跨档激活 ≥80）**：好感调至 85 时，两条设定全部显示「生效中」，`injectedChars: 763`；注入块按 skill id 字典序排序输出（截图：`screenshots/r7-t51-intimate-active.png`）。
  - **T52（降档失效与撤销句）**：好感改回 20（<40）时，两条设定降档失效；事实通道精准生成撤销句（`撤销：以下条目现已失效，立即停止使用其内容——maid-mia-intimate、maid-mia-warm。`）；档内微调（20→25）不重复生成注入块（指纹去重生效）（截图：`screenshots/r7-t52-revoked.png`）。
  - **T53（真实正文承接与协议隔离）**：在好感 42 温热阶段下推进剧情，Author 创作正文生动融入温热期特质（敢小声吐槽茶一般并察言观色、缩脚上沙发），正文全篇零协议元文本渗漏；Chronicler 异步推演平稳触发（截图：`screenshots/r7-t53-prose-response.png`）。
- 编写任务书 `dsh-rrp-test-report/E2E_BRIEF_ROUND7.md` 与报告 `dsh-rrp-test-report/TEST_REPORT_R7.md`。
- 更新 `docs/plans/conditional-injection-v1.md`，正式标记 issue #16 全量闭环。

### 阻塞解除与未决项

- **阻塞解除**：issue #16 条件注入机制 v1 彻底完成真机闭环，不再有未验功能悬挂。
- **待决事项**：
  1. `HOST_ALIGNMENT.md §3.1` 酒馆卡导入 vs D14 字面冲突待拍板定性。
  2. 下一阶段玩法特性选型（如 issue #37 一卡一区，或新特性研发）。

## 2026-09-22 · Round-6 真机抽查全量闭环 + 宿主自动化启动方案落地

### 已确认与已完成

- **宿主启动方案落地与试错闭环**：
  - 定位旧 Agent 屡次卡在启动服务上的四大根因：1) 宿主启动未脱壳导致命令挂起；2) 3099 端口残留僵尸进程（EADDRINUSE）；3) 环境变量 SOCKS 代理污染导致 LLM 静默空响应；4) 缺少启动 Token 捕获导致首次浏览器访问 401。
  - 新增 `scripts/host-runner.mjs`：支持 `start`、`stop`、`status`；实现进程自动释放、代理环境变量剥离、直连 Node 派生、Launch Token 与 Session Cookie 自动捕获、健康探测及 `.scratch/dsh-host.json` 元数据落盘。实测 4~6 秒内一键稳定就绪。
- **Round-6 舞台 T42–T48 完整真机验收通过（PASS）**：
  - T42（空态与雁门舞台）：雁门客栈卡「孤灯客栈 · 案头」及 6 面板完整渲染；临时重命名 `ui/` 验证舞台空态提示「这张卡没有声明界面（ui/manifest.json）。」，不白屏不报错；恢复后即刻还原。
  - T43（随剧情刷新）：玩家推进一轮剧情（开锁探索尽头房间），流式结束后 Chronicler 异步推演（`ctx.jobs`），WorldState 与此刻场景自动无缝切换，在场人物与小动作实时同步，无需手动刷新。
  - T44（条件面板翻转）：通过 iframe 控制台将好感推至 41（≥40），「升温阶段」gauge（min 40, max 100）**从无到有动态出现**；通过右侧栏就地矫正调回 20（<40）保存后，该面板即刻消失。
  - T45（原语边界）：点击「问管家」唤起月停并预填不发送；右侧栏变更记录准确归因「你 · 玩家就地矫正」。
  - T46（P0 沙箱隔离）：iframe 自检两项全红拦截，父侧 `contentDocument` 为 null，安全红线未失守。
  - T47（输入保留）：iframe 输入框在外部触发世界状态刷新后，文本内容与滚动状态完整保留。
  - T48（流式刷新成本）：常驻舞台页签下长正文流式打字机生成平滑，无卡顿闪烁，宿主底部测定 160 tok/s，缓存命中 96%，`useProjection` 订阅开销极低。
- 截图证据归档至 `dsh-rrp-test-report/screenshots/`（`r6-t42-*.png`、`r6-t44-*.png`、`r6-t48-*.png`），`TEST_REPORT_R6.md` 更新为全项 PASS。

### 阻塞解除与未决项

- **阻塞解除**：Round-6 舞台（issue #18）真机验收正式闭环通过；真机缺口不再阻塞后续 Ready-to-code gate。
- **待决事项**：
  1. `HOST_ALIGNMENT.md §3.1` 酒馆卡导入 vs D14 字面冲突仍待所有者拍板定性。
  2. 工作区改动提交策略（建议拆分为：1. 格式债务清理；2. Agent 协作契约规范；3. host-runner 与真机验收归档）。

## 2026-09-22 · 内置浏览器复验 Round-6（前序）

### 已完成

- 使用 Codex In-app Browser 启动本地宿主并打开仓库版「女仆大小姐」卡局。
- 复验舞台页签、声明式面板、月停问管家预填、沙箱 SecurityError/CSP 双拦截、状态刷新后 iframe 输入保留。
- 重跑 format、typecheck、lint、全量测试（42/371）与 build，均通过。
- 详细结果已追加到 `dsh-rrp-test-report/TEST_REPORT_R6.md`。

### 未完成与阻塞（已被后序全量闭环解决）

- T43、T44、T48 仍缺完整真机证据；T42 缺无 `ui/` 卡空态证据。
- iframe 快速行动按钮被浏览器自动化安全层拒绝，无法完成好感阈值翻转。
- Round-6 当时未能标记完整通过，Ready-to-code gate 保持阻塞（关闭：2026-09-22 由 Chrome DevTools 驱动与 host-runner 全量闭环）。

## 2026-09-21 · Round-6 基线刷新与验证（自动化完成，真机待补）

### 已确认

- 执行前基线为 `main...origin/main [ahead 5]`；工作区有 13 个已跟踪改动文件，以及 `.scratch/`、`docs/agents/` 未跟踪目录。
- 已将 `dsh-rrp-test-report/E2E_BRIEF_ROUND6.md` 的代码基线从 `97653a3` 刷新为当前 `HEAD 3785de2`，并注明工作区另有未提交格式/文档改动。
- 格式债务票据只覆盖 9 个 `src/client` / `tests` 文件；已在规格中明确测试 seam 为 N/A + 现有全量 Vitest 回归，并在票据中明确不覆盖其他文档与 Round-6 brief。

### 新鲜验证

- `git diff --check`：通过，退出码 0。
- `pnpm run format:check`：通过。
- `pnpm run typecheck`：通过。
- `pnpm run lint`：通过。
- `pnpm test -- --run --reporter=dot`：通过，42 个测试文件、371 个用例；stderr 仍有既有 controlled-input warning、故意失败路径日志和宿主缺失服务的降级日志。
- `pnpm run build`：通过，ESM/CJS 产物生成成功。
- 清除代理变量后启动 `dsh --profile rp-dev --port 3099 --no-open`：成功；日志确认 7 个投影、Chronicler、Summarizer、卡包/舞台/设定集/月停/世界线路由已挂载。临时宿主已停止。
- 只读 HTTP 冒烟：宿主带 Cookie 页面、`/dsh-rrp/cards`、米娅/雁门 manifest、米娅 `console.html` 均返回 200。
- 已创建 `dsh-rrp-test-report/TEST_REPORT_R6.md`，明确区分自动化前置验证与尚未执行的 T42–T48。

### 未完成与阻塞

- 当前会话没有 Chrome DOM/点击/截图自动化能力，T42–T48 未执行，不能将 Round-6 标记为真机通过。
- `~/.dsh/.dsh-rrp/cards/maid-heiress/` 用户卡副本仍存在；正式测仓库版米娅前需按 brief 移动避让，测试后还原，不能删除。
- 当前工作区仍混合格式债务、Agent 协作基线、条件注入计划状态和 Round-6 文档；不能把整个 dirty worktree 宣称为单一格式切片或 Ready-to-code。

### 下一步

1. 由具备 Chrome 真机操作能力的测试 Agent 按最新 brief 执行 T42–T48，并补充报告与截图。
2. 真机证据到位后，再由维护者决定当前混合改动的逻辑分组提交策略；在此之前不进入新的 `src/`、`tests/` 或构建配置实现。
3. 条件注入 v1 仍以 T1–T8 已实现、等待真机证据为准，不重复实现。

## 2026-09-21 · 首个代码基线切片

### 已确认

- 盘点确认条件注入 v1 的 T1–T8 已有实现、测试和 UI；原计划状态“待动工”已经过期，下一轮重点是 Round-6 真机抽查，不重复实现这条能力。
- 本轮代码修改限定为清理既有 Prettier 格式债务：9 个源码/测试文件，只接受排版变化，不改变逻辑或契约。

### 已落盘

- 新增 `.scratch/format-debt/spec.md` 与 `.scratch/format-debt/issues/01-prettier.md`，票据状态已改为 `resolved`。
- 更新 `docs/plans/conditional-injection-v1.md`，反映 T1–T8 已完成、等待真机验证。
- 对 9 个既有文件运行 Prettier；未进入新功能代码实现。

### 新鲜验证

- `pnpm run format:check`：通过。
- `pnpm run typecheck`：通过。
- `pnpm run lint`：通过。
- `pnpm test -- --run`：通过，42 个测试文件、371 个用例。
- `pnpm run build`：通过，ESM/CJS 构建产物生成成功。
- 本机宿主冒烟：`dsh --profile rp-dev --port 3099 --no-open` 启动成功；日志确认 7 个投影、Chronicler、Summarizer、卡包/舞台/设定集/月停/世界线路由均已挂载，浏览器插件面板可读；测试进程已退出。

### 下一步

1. 用当前干净基线刷新 Round-6 真机 brief，并验证条件注入跨档、生效标记和降档撤销句。
2. 真机证据到位后，再从新的用户可验证玩法切片建立 `.scratch/<feature-slug>/spec.md`，不要继续扩写已完成的条件注入机制。

## 2026-09-21 · 人与 Agent 交互契约

### 已确认

- 维护者保留产品目标、优先级、体验取舍、不可逆操作和最终集成权；primary Agent 负责查证、编排、实施、验证和落盘；delegated Agent 只在明确票据范围内工作。
- 当前任务范围内的可逆阅读、文档、实现和验证默认直接推进，不为常规小选择反复请求确认；产品歧义、规则冲突、外部写入和不可逆决定才停下来提问。
- 提问采用“术语先行 + 多选项 + 30+20 检查点”；事实由 Agent 查证，确认内容立即写入唯一文档来源。
- `继续`、`采用 A`、`只读盘点`、`只改文档`、`先落盘`、`暂停`、`停止`、`重做` 已定义为跨会话可复用的控制词。

### 已落盘

- 新增 [`docs/agents/human-agent-contract.md`](../agents/human-agent-contract.md)，作为人和 Agent 的交互、汇报、上下文交接与完成条件的详细真源。
- `AGENTS.md` 与 `docs/dev/workflow.md` 只增加入口指针，避免复制同一套交互规则。

### 下一步

1. 以本契约接手下一项真实工作；开工时先做只读盘点，再把第一个可验证垂直切片写入 `.scratch/<feature-slug>/`。
2. 如果实际使用中出现重复提问、权限边界或交接格式不适用，把具体例子追加到本条并修改契约，不在聊天里形成第二套规则。

## 2026-09-21 · Agent 协作基线整理

### 已确认

- Matt Skills 作为日常主流程；Superpowers 只在项目启动、隔离工作区、系统性调试、TDD、完成验证和分支收尾等明确场景使用。
- 本项目继续以 `docs/reference/GLOSSARY.md`、`docs/DESIGN.md`、`docs/HOST_ALIGNMENT.md`、`docs/reference/DECISIONS.md` 和 `docs/dev/*` 作为唯一语义与流程来源，不创建平行 `CONTEXT.md` / `docs/adr/`。
- 需求、规格与任务票据采用本地 Markdown，约定见 `docs/agents/issue-tracker.md`；不会因为远程 GitHub 仓库存在就把日常协作状态外置。
- 本轮只整理 Agent 协作内容，不修改 `src/`、`tests/`、构建配置或运行逻辑。

### 已落盘

- 新增 `docs/agents/domain.md`、`docs/agents/issue-tracker.md`、`docs/agents/triage-labels.md`，为 Matt Skills 提供项目内文档和票据映射。
- 更新 `AGENTS.md`，明确人和 Agent 的分工、Matt/Superpowers 路由和 Ready-to-code gate。
- 重写 `docs/dev/workflow.md`，把术语统一、30+20、自检、确认即落盘、冲突检查、任务切片和完成验证串成可执行流程。

### 新鲜工程基线

- `pnpm run typecheck`：通过。
- `pnpm run lint`：通过。
- `pnpm test`：通过，42 个测试文件、371 个用例。
- `pnpm run format:check`：未通过，Prettier 报告 9 个既有 `src/client` / `tests` 文件；与本轮 6 个文档改动没有重叠，留作独立格式债务。
- 旧条目中“未提交改动、等待提交分组”的状态已经过期；当前 `main` 工作区干净，相关改动已分别落在 `a042b7e`、`f7edf17`、`9477a81`、`8c57b3b`、`3785de2`。

### 下一步

1. 把格式债务单独建票据；不要把它混入下一项功能或本轮协作规范整理。
2. 由所有者拍板 `HOST_ALIGNMENT.md` §3.1 的酒馆卡导入与 D14 字面张力。
3. 刷新 Round-6 真机 brief 的基线后，再从条件注入 v1 的最小垂直切片开始走 Ready-to-code gate。

---

## 2026-09-21 · 工作区盘点 + locale 红线修复 + 流程落地

### 盘点结论（冲突检查第 5 节执行结果）

工作区有一批**内聚度很高**的未提交改动（23 文件 +383/−1257，另有 8 个新文件），分六组：

1. **前端面板组件化**：世界状态页签拆 `components/world-state-{primitives,sections,dynamic}.tsx`；
   世界线页签重写为 Galgame 流程图（新增 `worldline-flowchart.tsx` / `worldline-inspector.tsx` / `worldline-layout.ts` + 布局测试）。
2. **循环依赖拆叶**：`stage-types.ts`（舞台共享类型）、`lore-drafts.ts`（lore 草稿暂存），均为原样 re-export，调用方路径不变。
3. **worldline-tree 折叠修复 + 特性**：孙代分叉被断成 root 的缺陷修复（`findNodeInLineage` 沿祖先上溯）；
   新增 `pending` 占位节点（零回合新 fork 显示「新分支起点」）。均有测试背书。
4. **文档跟随**：5 投影→7 投影、`ctx.storage`→`ctx.storageDomain`、5 智体名单、dsh-synapse 撤装等，全部为追代码的一致性更新，未发现语义冲突。
5. **已登记张力（待所有者拍板）**：`HOST_ALIGNMENT.md` §3.1 —— 酒馆卡导入与 D14 的字面冲突按「已知例外」记录，不改 D14 原文。
6. **基线健康**：typecheck / lint / vitest 全绿（41 文件 369 用例）。

### 本轮已修

- **locale 红线违例**：世界线新组件用了 15 个未注册字典键（`worldline.totalNodes` 等），此前靠硬编码中文
  `?? '…'` 兜底，违反 HOST_ALIGNMENT「UI 文案必须走 locale」红线，英文界面有显示裸键名风险。
  处置：字典抽为叶模块 `src/client/locales.ts`（沿用 stage-types / lore-drafts 先例），15 键补 ZH/EN；
  新增守卫测试 `tests/locale-keys.spec.ts`（ZH/EN 键集相等 + 源码所用键均已注册），把红线变成自动检查。
  注：组件里的 `?? '中文兜底'` 现已成为不可达死代码，下次触碰这些文件时顺手移除。
- **流程落盘**：新增 `docs/dev/workflow.md`（术语先行 → 30+20 拷问 → 确认即落盘 → 编码前冲突检查 → DoD），
  AGENTS.md §3 与 DEVELOPMENT.md 已挂指针。

### 待决事项

| 事项 | 阻塞什么 | 归属 |
| :--- | :--- | :--- |
| HOST_ALIGNMENT §3.1 酒馆导入 vs D14 的字面冲突拍板 | 导入功能的文档定性 | 所有者 |
| 未提交改动的提交策略（按逻辑分组切提交 or 一把梭） | 进入下一特性前的干净基线 | 所有者 |

### 待执行（按建议顺序）

1. **提交检查点**：上述六组改动测试全绿，建议按组切 3–5 个逻辑提交（组件化 / 拆叶 / worldline 修复+特性 / locale 修复 / 文档跟随）。
2. **Round-6 真机抽查**：brief 在案（`E2E_BRIEF_ROUND6.md`，T42–T48 舞台页签），但基线标注为 `97653a3`，已落后当前 HEAD，执行前先刷新 brief 的对照基线。
3. **条件注入 v1（issue #16）**：`docs/plans/conditional-injection-v1.md` 设计已对齐（R1 评审五条全采纳），T1–T8 待动工。

