# 票据 03 · 真机验收与归档

> Status: resolved（2026-09-28）· 依赖：票据 02 · 分支：`feat/gallery-v2`
> 规格：`.scratch/gallery-v2/spec.md` 验收条件 5

## 范围

- 内置浏览器 MCP 起宿主（host-runner 3099）逐项核对：网格渲染、封面（含回退占位）、详情层级、开局流端到端、导入流、双主题、窄窗口、暗色可读；
- DEF 编号接续 `dsh-rrp-test-report/` 既有序列，截图归档；
- worklog 回填验收结论；票据 01–03 状态收尾。

## 验收

- DEF 报告落盘 `dsh-rrp-test-report/`；发现的缺陷按惯例热修+回归测试+提交（参考 `ac1aa88` 模式）；
- 最终观感由所有者拍板后才合并。

## Out of scope

新功能；二期范围。
