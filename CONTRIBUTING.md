# 贡献与跨平台开发

本仓库由 Windows 与 Linux 共享维护。**操作系统不是长期分支维度**：两台机器共享 `main`，工作成果通过 GitHub 的功能分支和 Pull Request 汇合。

详细的宿主接入、构建、真机验证和红线规则以 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) 为准；产品目标与宿主约束仍分别以 [`docs/DESIGN.md`](docs/DESIGN.md) 和 [`docs/HOST_ALIGNMENT.md`](docs/HOST_ALIGNMENT.md) 为准。

## 首次准备

在 Windows PowerShell 或 Linux shell 中都执行同一套项目命令：

```bash
# 先让版本管理器加载仓库根目录的 .node-version
# nvm：nvm use 24.16.0
# fnm：fnm use 24.16.0

corepack enable
corepack prepare pnpm@10.14.0 --activate
pnpm run check:environment
pnpm install --frozen-lockfile
```

版本真源只有两个文件：`.node-version` 固定 Node.js，`package.json` 的 `packageManager` 固定 pnpm。仓库已有 `.gitattributes`，跟踪文本统一使用 LF，避免 Windows/Linux 只产生换行差异。不要用 `--ignore-scripts` 绕过环境检查；如果 `pnpm install` 被拒绝，先修正本机版本。

## 两台机器如何共享成果

1. 开始工作前同步基线：

   ```bash
   git switch main
   git pull --ff-only origin main
   git switch -c feature/<short-name>
   ```

2. 在功能分支上修改、验证并提交。分支按功能命名，不按操作系统命名；只有两台机器同时处理同一功能时，才临时使用明确的工作分支并尽快合并。
3. 推送功能分支并创建 Pull Request：

   ```bash
   git add <实际修改的文件>
   git commit -m "feat: ..."
   git push -u origin feature/<short-name>
   ```

4. GitHub Actions 通过后合并到 `main`；另一台机器再执行 `git pull --ff-only origin main`。
5. 不在两台机器之间复制 `node_modules`、`lib`、Token 或 DSH profile；这些内容由各自机器按文档生成。

## 提交前检查

```bash
pnpm run check:environment
pnpm run format:check
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
```

GitHub Actions 会在 Pull Request 和推送到 `main` 时重复这些质量检查，且分别在 Ubuntu 和 Windows runner 上执行。真实 DSH 宿主验证属于本机集成步骤，不能用 CI 的静态检查结果代替。

## GitHub 管理员一次性设置

如果要禁止绕过 CI 直接合并，仓库管理员需要在 GitHub 的 `Settings → Branches → main` 分支保护规则中启用：

- 必须通过 Pull Request；
- 必须通过 `quality (ubuntu-latest)` 与 `quality (windows-latest)` 两个 required status checks；
- 合并前分支必须与 `main` 保持最新（可选，但建议开启）。

仓库文件只能定义检查，不能替代 GitHub 账户权限下的分支保护设置。

## 不提交的本机状态

`.gitignore` 已排除依赖、构建产物、`.env*`、DSH host runner 状态、日志和编辑器/系统文件。DSH 的 profile、宿主源码路径、Token、端口占用和测试截图中的本机凭据都只保留在本机；若要共享结论，请提交脱敏后的文档或测试报告。
