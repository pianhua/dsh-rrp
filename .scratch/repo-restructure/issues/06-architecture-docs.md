Status: resolved

# 文档对齐：architecture.md 模块地图重写 + 文内引用修正

## Scope

- `docs/dev/architecture.md`：「模块地图」节按新目录结构逐目录重写（含一句话职责），数据主干图与五智体表保留；检查全文 `src/*.ts` 引用并修正为真实路径。
- grep `docs/dev/{DEVELOPMENT,host-seams,routes}.md` 与 `docs/DESIGN.md`、`docs/CONTRIBUTING.md` 中的 `src/<文件名>.ts` 引用，修正指向新路径。
- 历史 ADR、验收报告不改写（点-in-time 记录，见 spec 裁决 5）。

## Acceptance

- architecture.md 模块地图与 `find src -maxdepth 2` 实际结构一一对应（逐个目录核对）。
- 上述文档中所有 `src/*.ts` 路径引用真实存在（脚本批量验证）。
- `check:hygiene` 全绿（相对链接与体积门禁）。

## Blocked by

04 (publish/ + ui-contract/，以最终结构为准)

## Completion (2026-10-17)

- architecture.md 模块地图按新结构逐目录重写；6 篇现状文档 28 处 src/*.ts + 3 处 scripts/*.mjs 引用修正。历史 ADR / worklog 归档 / 旧项目反例（rp-web、rp-change-state、rp-admin）按 spec 裁决 5 不改。提交 `20507c7`。
