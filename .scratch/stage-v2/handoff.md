# 交接摘要 · 舞台 v2（stage-v2）

> 交接时间：2026-09-27。本文档供新会话/新代理无损接手。**合并必须等用户明示「推送合并」。**

## 当前状态（一句话）

舞台 v2 一期五个提交已落在 `feat/stage-v2`，质量门全绿（59 文件/465 用例），服务端真机验收已过；
**唯一剩余项 = 浏览器四原语 e2e**（当时机器输入被用户会话占用而暂停），过后用户说「交接」，
未做合并。宿主 3099 正在运行新构建。

## 分支与提交

- 基线：`main`（与世界线 v2 合并后同步 origin）。分支 `feat/stage-v2` 领先 5 提交：
  1. `29b8cd7` D25 决策落盘（DECISIONS/GLOSSARY/DESIGN/HOST_ALIGNMENT/CARDS）
  2. `addd696` 票据 01 服务端契约层
  3. `c2ce51c` 票据 02 客户端重写
  4. `50c650d` 票据 03 pjsk-saki 测试卡 + 文档
  5. `ac1aa88` 真机热修：宿主 prefix 路由尾斜杠约定
- 工作区干净；`.scratch/stage-v2/`（规格+票据+本文档）按惯例不入库。

## 交付内容速览

- **契约**：`ui/` 多文件资产目录（路由双形态：exact 查询参数 + prefix 路径段 `/dsh-rrp/card-ui/<card>/<file>`；
  白名单扩展名、穿越防护、`ACAO:*`、ETag）；桥协议 v2（`UI_BRIDGE_PROTOCOL=2`，hello→ready 能力协商，
  v1 兼容；CSP `default-src 'self'` 族；shim 在路由侧 `assembleSandboxDoc` 注入 HTML）。
- **写面四原语**：`correct_state`（唯一状态写通道）/ `ask_copilot` / `send_message`（代拟发言，
  宿主 `inputActions.setDraft+submit`，设置 `allowSendMessage` 默认开可关）/ `draft_lore`
  （lore-route `action:'stage'` 仅写 PENDING，过 D8 确认环）。
- **客户端**：stage-tab 重写（app 全幅 + L1 抽屉、manifest `theme`→`--rrp-*` 变量、三态骨架、
  入口记忆、热重载修 MANIFEST_ERRORS 脏读）；stage-frame src 化 + 节流 100ms 推送；
  RiskConfirmation 大 patch；P0–P2 质量债清零。
- **stage-kit**：`assets/stage-kit/kit.css|kit.js`，路由 `/dsh-rrp/stage-kit/`。
- **测试卡**：`cards/pjsk-saki/`（16.7MB，32 本地资产；状态栏 HUD 26 槽位、四原语测试条=
  manifest buttonRow；`chronicler.md` 卡包推演纪律新机制——`buildChroniclerPrompt` 增可选
  `cardNote`，src/chronicler.ts `cardNoteOf` 按会话卡包读取；资产脚本 `scripts/fetch-pjsk-assets.mjs`）。

## 环境速查

- 质量门：`pnpm run check:environment && pnpm run format:check && pnpm run typecheck && pnpm run lint && pnpm test --silent && pnpm run build && git diff --check`
- 宿主：`node scripts/host-runner.mjs status|start|stop`（3099，rp-dev profile；token/cookie 在 `.scratch/dsh-host.json`）。
- 浏览器自动化：**本会话无内置浏览器 MCP**；KimiCU 桌面工具可用但需机器输入空闲
  （上次因用户占用而失败，可先 `list_apps` 探测再 `launch_app` Chrome）。
- 宿主源码只读参考 `D:/projects/deepseek-harness`（tag dsh-v0.1.6-alpha.2；改动前先读其 AGENTS.md）。
- eg.png 解剖产物在桌面：`eg-ccv3.json`、`eg-script0~3.html`（交接后如确认无用可删）。

## 已验证 / 未验证

- ✅ 全量质量门（465 用例含新增：路径形态路由、theme 保留、chronicler cardNote、
  pjsk 发布门「零外链/资产存在」）。
- ✅ 真机服务端矩阵：manifest/HTML(注入 shim+CSP)/CSS/JS/webp/jpg 全 200 + ACAO；
  旧卡兼容；穿越 400；stage-kit 200。
- ⬜ **浏览器四原语 e2e**（spec §6 清单）：状态栏实时刷新、四按钮实际效果、断网可用（
  已由「全部资产本地+零外链」构造性保证，浏览器层未点过）。

## 继续操作手册

1. **重试 e2e**：确认机器输入空闲 → `launch_app` Chrome 打开 `.scratch/dsh-host.json` 的
   tokenUrl → 开 pjsk-saki 新会话 → 舞台页签逐项点四按钮。发现 bug 按惯例
   热修+回归测试+提交（参考 `ac1aa88` 模式）。
2. **用户可能自己玩**：玩过说「推送合并」→ 流程：worklog 回填 e2e 结论（
   `docs/dev/worklog.md` 的「真机 e2e：待办」那行）→ `git push -u origin feat/stage-v2`
   → 切 main `--no-ff` 合并 → 推送 → 质量门复跑 → worklog 记合并。
3. 若 e2e 暴露客户端渲染问题：入口文件 `src/client/stage-tab.tsx` / `stage-frame.tsx`；
   桥词表 `src/ui-bridge.ts`；路由 `src/card-ui-route.ts`。

## 已知风险 / 遗留

- `inputActions` 接线为源码级证实（宿主 `ui-conversation/apply.ts:220` provide），
  浏览器运行时未点过 send_message——e2e 首验项。
- 单体提交 `50c650d` 含 32 个二进制资产，合并时留意体积。
- L1 四新组件 / tab 布局、建团页级交互、stage-kit 扩充 = D25 二期，用户提及才动。
- 票据 02 自代理曾报告 happy-dom 测试有无害 stderr 噪音（localhost:3000 fetch 尝试），非产品问题。

## 下一板块候选（用户定）

月停（#21/#33）→ 展厅 → 设定集（D8）→ 剧情脉络 → 导出（#31）；或世界线二期。
