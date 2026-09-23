Status: ready-for-human

# 固化 Windows/Linux 共享开发基线

## Scope

按 `.scratch/cross-platform-development/spec.md` 落地共享版本文件、环境预检、贡献入口、开发指南和 GitHub Actions 质量门禁；不修改业务代码。

## Blocked by

无。

## Acceptance

- `.node-version` 为 Node `24.16.0`；`package.json` 声明 pnpm `10.14.0` 与匹配的 Node engines；
- `pnpm run check:environment` 在错误运行时给出明确失败原因；
- `CONTRIBUTING.md` 与 `docs/DEVELOPMENT.md` 说明两台机器的同步、分支、安装、验证和本地状态边界；
- GitHub Actions 覆盖 PR 与 `main`，在 Ubuntu + Windows 矩阵上使用 frozen lockfile 并执行 format、typecheck、lint、test、build；
- 现有静态检查和测试通过，构建结果按实际运行时诚实报告。

## Comments

- 2026-09-23：所有者要求将 Windows/Linux 的共享开发规则、文档和 GitHub 协作门禁一次性落地；采用单一 `main` 共享基线 + 按功能命名分支，不建立按操作系统长期分叉。
- 2026-09-23：已落地 `.node-version`、`packageManager`、环境预检、跨平台开发指南、贡献入口、Ubuntu + Windows GitHub Actions 矩阵和 POSIX/Windows 目录链接处理；未修改业务逻辑。
- 2026-09-23：`format:check`、`typecheck`、`lint`、42 个测试文件/371 个用例、`docs:build`、CI YAML 解析通过。当前 Linux 为 Node `22.22.1`，环境预检和 build 按设计阻断，待切换 Node `24.16.0` 后在本机复跑 build；因此票据交给人完成运行时对齐与 GitHub 推送前确认。
