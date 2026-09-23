# Windows/Linux 共享开发基线

## Goal

让 Windows 与 Linux 两台开发机通过 GitHub 共享同一份可验证的项目成果，并把运行时、依赖安装、分支同步、验证命令和本机状态边界写成可执行协议，避免一台机器的本地环境差异污染另一台机器。

## User-visible outcome

维护者在任一系统按仓库文档执行后：

- 使用同一 Node.js / pnpm 基线；
- 通过 GitHub 的 `main` 与功能分支同步源码、测试和文档；
- 不提交 `node_modules`、构建产物、Token、profile 状态或宿主日志；
- 本地可运行环境预检；
- Pull Request 和推送到 `main` 时由 GitHub 自动复跑静态检查、测试和构建。

## Scope

- 添加 `.node-version`，固化 Node.js `24.16.0`；
- 在 `package.json` 声明 `packageManager`、收紧 Node engines，并增加环境预检脚本；
- 添加纯 Node.js 的 `scripts/check-environment.mjs`，检查 Node 与 pnpm 版本；
- 更新 `docs/DEVELOPMENT.md`，集中说明跨平台安装、GitHub 分支同步、本机状态隔离和验证顺序；
- 添加 `CONTRIBUTING.md` 作为 GitHub/人类协作者入口，仅指向详细开发文档，不复制领域规则；
- 添加 GitHub Actions 质量门禁，在 Ubuntu 与 Windows runner 上执行环境检查、format、typecheck、lint、全量测试和 build；
- 修正 README、AGENTS 和工作日志中的跨平台/环境基线描述。

## Acceptance

- Windows 与 Linux 都能从同一份 `.node-version`、`package.json` 和 `pnpm-lock.yaml` 得到明确版本要求；
- 错误 Node 或 pnpm 版本时，环境预检以可读错误退出并给出修复方向；
- 正确环境下 CI 使用 frozen lockfile，并执行现有质量命令；
- 文档明确哪些文件通过 GitHub 共享、哪些状态只保留在本机，以及功能分支合并流程；
- `pnpm run format:check`、`pnpm run typecheck`、`pnpm run lint`、`pnpm test -- --run` 通过；
- 当前 Linux 版本不符合新基线时，验证结果明确记录，不通过临时依赖绕过；
- 不修改业务运行逻辑，不引入自建服务、数据库或复杂协作基础设施。

## Out of scope

- 不替两台机器配置 Node 版本管理器、DSH CLI 或宿主 profile；
- 不自动提交、推送或创建 GitHub Pull Request；
- 不把 DSH 本机 Token、profile 数据、日志和宿主安装目录纳入 Git；
- 不在本轮解决 Node 22 下的 tsdown 兼容性；统一到项目基线后再验证构建。

## Test seam

- 纯脚本：在当前错误环境验证失败信息，在现有环境下复跑既有静态检查与测试；
- 配置：检查 GitHub workflow 使用 pinned version file、frozen lockfile 和既有命令；
- 构建：以 Node `24.16.0` 为目标环境，当前 Node `22.22.1` 只记录为未对齐，不能冒充构建通过。
