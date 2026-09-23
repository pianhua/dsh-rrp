# [P2] host-runner 仅终止自身管理的 DSH 进程

Status: resolved
Blocked by: None

## 用户可验证结果

`scripts/host-runner.mjs` 在 `start`、`stop`、`status` 周期中仅向经强所有权验证的目标 DSH host 进程发送终止信号；面对非 runner 管理的端口占用或 PID 已复用场景安全退出并报错，绝不误杀外部无关进程。

## 范围

- 抽象进程身份提取逻辑（Windows 下读取 `Win32_Process` 的 `ProcessId`、`CreationDate` 与 `CommandLine`，POSIX 下读取 `/proc/${pid}/stat` 与 `/proc/${pid}/cmdline`）。
- 提取纯函数所有权决策逻辑至 `scripts/host-runner-ownership.mjs`，包含参数精确切分、非子串参数匹配、进程启动时间对比与端口所有权状态判定。
- 为 `scripts/host-runner-ownership.mjs` 提供 `scripts/host-runner-ownership.d.mts` 强类型声明。
- 在 `scripts/host-runner.mjs` 的 `startHost` 中持久化记录 `processStartedAt`，在 `stopHost` 终止前进行双重校验，遇冲突拒绝杀进程并退出。
- 编写 `tests/host-runner-ownership.spec.ts` 覆盖状态判定、过期与复用 PID 拒绝、非子串校验、Windows 与 POSIX 命令行切分。

## Out of scope

- 不改变 DSH CLI 的底层传参规范。
- 不引入系统级守护进程或复杂的跨进程锁。

## 验收

- 非 runner 进程监听目标端口时，start/stop 均不改变该进程状态。
- 过期状态 PID 已复用时不会误杀。
- runner 启动的 DSH 仍可可靠停止；测试覆盖 POSIX 与 Windows 识别路径或等价的抽象进程身份逻辑。
- 不引入命令行子串匹配导致的新误杀路径。

## Comments

- 2026-09-23：依据 GitHub #42 开展修复。提取 `host-runner-ownership.mjs` 纯函数模块与 `.d.mts` 声明；在 Windows 下使用 `execFileSync` 与 ISO 格式化安全读取进程信息并防御性解析；完善参数切分与全量单元测试。
