# 票据 01：服务端与契约层（资源政策 / 桥 v2 / 写面）

> Status: ready-for-agent · 依赖：无 · 分支：`feat/stage-v2`
> 规格真源：[`spec.md`](../spec.md) · 决策：D25（3/4/5 条）

## 目标

把 D25 的服务端侧契约一次落盘：卡包多文件资产路由、stage-kit 伺服、ui-schema v2 动词、桥协议 v2、lore 草稿暂存通道、RP 设置开关，并把新宿主接缝记入 HOST_SEAMS。

## 范围

### 1. `src/card-ui-route.ts` — 多文件资产伺服

- 文件读取从「仅 manifest.json + 裸 `*.html`」扩展为 `ui/` 目录整树相对路径伺服。
- **安全**：`..` 与绝对路径拒绝（400）；扩展名白名单：`.html .css .js .mjs .json .png .jpg .jpeg .webp .gif .svg .ico .woff .woff2 .ttf .mp3`（`isUiHtmlName` 泛化为 `isUiAssetName`，旧名保留 re-export 或直接改调用点，跟现有代码风格走）。
- Content-Type 映射表（html/css/js/json/图片/字体/音频）；`ETag`（mtime+size 弱校验即可）+ `Cache-Control: no-cache`（开发友好）。
- **全部响应** `Access-Control-Allow-Origin: *`（opaque origin 的 iframe 里 `@font-face`/fetch/ESM 依赖 CORS）。
- 目录索引禁止（请求目录 = 404）；manifest 旧查询参数形态兼容。
- 保持只读、零会话状态、try/catch 全包。

### 2. stage-kit 伺服

- 新增 `/dsh-rrp/stage-kit/` 路由：伺服插件自带的 `assets/stage-kit/kit.css` 与 `kit.js`（新建这两个文件；kit.css 用宿主 `--dsw-*` token 定义舞台常用类：面板/仪表/标签/按钮/滚动条，kit.js 提供 `rrpKit.ready` 助手与格式化小函数——**保持精简**，一期够用即可）。
- 同样白名单 + ACAO + 类型映射。

### 3. `src/ui-schema.ts` + `src/card-ui.ts` — 动词扩展与校验

- `UiActionKind` 增 `'send_message' | 'draft_lore'`。
- `UiButton`：按动词互斥校验——`correct_state` 必填 `patch`；`ask_copilot` 必填 `question`；`send_message` 必填 `trigger`（string）；`draft_lore` 必填 `entry`（lore 条目草稿对象，复用设定集词汇类型）。缺字段 = 语义错误，响亮报错。
- 按钮 `label` 会话内唯一校验。
- `loadUiManifest(dir, initialState)`：修复 `card-ui-route.ts` 未传第二参导致 `whenPathWarning` 死代码问题——路由现在能拿到卡包初始状态（`src/start.ts` 或卡目录读取路径，参照现有 `cards-route` 的做法），传入激活路径警告。
- author-time 资产存在性校验：`app` 面板 `src` 存在；新增 `assetRefs` 检查（manifest 中声明的相对资产路径存在，可选字段，先做 app src 即可）。

### 4. `src/ui-bridge.ts` — 桥协议 v2

- `UI_BRIDGE_PROTOCOL = 2`。
- `UiCall` 增：`{ t:'rrp:send_message', text }`（text 长度上限 4000，trim 后非空）、`{ t:'rrp:draft_lore', entry }`（entry 过 lore 词汇 zod 校验）。
- `UiPush` 增握手回包：`{ t:'rrp:ready', protocol, verbs }`——子侧 hello 到达后由父侧发送；v1 子侧（不发 hello 版本号）按现状「hello 即推全量」兼容。
- `UI_BRIDGE_CSP` 改为 `'self'` 族：`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; media-src 'self' blob:`。
- shim 更新：`window.rrp` 增 `sendMessage(text)` / `draftLore(entry)`；shim 里加协议号。
- `parseUiCall` 白名单与限流（20/s）维持。

### 5. `src/lore-route.ts` — `action:'stage'`

- POST body `action:'stage'` + `draft`：仅写入 PENDING（复用 `src/lore-drafts.ts` 机制），**不**调度 Scribe、**不**追加会话、**不** sediment；非 RP 会话同样拒绝（与 manual 同一守卫）。
- 响应 `{ ok:true, pending:true }`。GET 的 pending 输出兼容 lore-tab 现有审阅流（确认/丢弃原样可用）。

### 6. RP 设置投影 — `send_message` 开关

- `src/projection/settings.ts` + `src/settings.ts` 词汇增 `allowSendMessage: boolean`（默认 true）；客户端写路径放票据 02，本票只落投影与类型。

### 7. `docs/reference/HOST_SEAMS.md` 增补

- 记录：opaque-origin iframe + `ACAO:*` 的 CORS 事实（self CSP 下字体/fetch/ESM 可用性结论，真机验证后回填结论）。
- 记录：`inputActions.setDraft/submit` 接缝位置（`ui-conversation/contract/input.ts`）。

## 验收

- [ ] 路由单测：白名单放行/拒绝、`..` 穿越 400、Content-Type、ACAO、ETag/304、目录 404、manifest 兼容。
- [ ] stage-kit 路由单测 + 两个资产文件非空且通过 lint。
- [ ] ui-schema 单测：四动词必填字段、label 唯一、when 路径警告真触发一次。
- [ ] 桥单测：v2 握手（hello→ready）、send_message/draft_lore 解析与非法输入、CSP 快照更新、v1 hello 兼容。
- [ ] lore stage 单测：PENDING 落草稿、非 RP 拒绝、不过 LLM（mock 断言 scribe 未被调度）。
- [ ] 设置投影单测：默认 true、折叠幂等。
- [ ] 全量质量门绿（`pnpm run check:environment && pnpm run format:check && pnpm run typecheck && pnpm run lint && pnpm test --silent && pnpm run build && git diff --check`）。
