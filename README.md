# dsh-rrp · DSH-Chronicle

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的沉浸式角色扮演与交互小说插件，面向个人单机游玩。会话、Agent、投影、界面与后台任务都交给宿主，插件只提供叙事智能体、世界状态与卡包体系。

## 特性

- **开卡即玩**：宿主左栏「卡片展厅」选卡开局，内置两张官方卡（落魄大小姐女仆 · 米娅 / 雪夜雁门客栈）
- **三智体分立**：Author 纯正文（零代打）→ Chronicler 每轮异步推演世界状态 → Summarizer 大局编年（`/summary` 按局开关、周期可调）
- **无锁矫正**：右栏世界状态就地修改即生效（Last-Write-Wins），下一轮执笔以最新切面为准
- **副驾驶（Copilot）**：右栏常驻全知幕僚（OOC），咨询设定、人物秘密与破局思路，或代劳修改状态、起草典籍（诚实可撤销）
- **Skills 知识体系**：卡包设定全量 Skill 化、按需调取；剧情新设定经 `/lore` 或典籍面板审阅后沉淀进当前世界线
- **原生世界线**：分支 = DSH `Session.fork`，状态由会话投影纯数学重放，零幽灵状态

## 环境要求

- DeepSeek Harness `0.1.6-alpha.2`
- Node.js `^22.19.0 || >=24.0.0`

## 使用

**安装**（把一个 DSH profile 变成 RP 模式）：

```bash
dsh plugin --profile <你的profile名> add dsh-rrp
dsh --profile <你的profile名>
```

本地开发版改用 `dsh plugin --profile <name> add <本仓库路径>`（或 `pnpm run link:dev` 自动链入 `rp-dev`）。

启动宿主：左栏「**卡片展厅**」→ 选卡 → 「**开始这一局**」。

## 开发

```bash
pnpm install
pnpm run build        # 产物 lib/（host ESM + client bundle）
pnpm run typecheck
pnpm test
```

真实宿主验证：`node scripts/link-dev.mjs` 把本仓库链接进 `$DSH_HOME/profiles/rp-dev`，随后 `dsh --profile rp-dev --port 3099 --no-open`。

## 文档

- [`docs/DESIGN.md`](docs/DESIGN.md) — 唯一产品目标规格
- [`docs/HOST_ALIGNMENT.md`](docs/HOST_ALIGNMENT.md) — 宿主能力映射与反重复造轮子红线
- [`AGENTS.md`](AGENTS.md) — 协作准则与红线

## 许可

[MIT](LICENSE)
