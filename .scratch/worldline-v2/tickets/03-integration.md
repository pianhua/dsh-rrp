# 票据 03 · 集成：质量门 + 真机验收 + 收尾

**状态**：resolved（2026-09-26）
**依赖**：票据 01、02
**规格**：`.scratch/worldline-v2/spec.md` §8（验收）、§9（风险）

## 任务清单

1. 全量质量门：`pnpm run check:environment && pnpm run format:check && pnpm run typecheck && pnpm run lint && pnpm test --silent && pnpm run build && git diff --check`。
2. 真机验收（`scripts/host-runner.mjs` 起宿主 + Kimi Code 内置浏览器）：
   - 长会话 fork 挂载正确（可临时降 TURN_CAP 验证 cap 保护）。
   - Chronicler 完成后徽标自动出现在正确回合。
   - 冷支线精确切口 / 超窗「位置未知」。
   - 分叉确认命名 → 新线可重命名/收起/恢复。
   - 当前回合精确高亮。
3. 文档同步：`docs/guide/worldline.md`（若描述旧流程图需重写）、DECISIONS.md D24 补「实现状态」、GLOSSARY 校对、worklog 追加。
4. AGENTS.md 目录架构注释中 worldline 文件清单校对（worldline-fork-marker.ts 新增等）。
5. 提交推送合并（**需用户明示后进行**）。

## 验收

- 质量门全绿 + 真机验收清单逐项通过 + 用户确认。
