Status: resolved

# 重启开发路线图 restart-roadmap.md

## Scope

新建 `docs/dev/restart-roadmap.md`，把散落的待办收敛为单一入口，按优先级排列，每项注明：问题一句话、证据指针、预估档位（workflow.md §1）、依赖关系：

1. **issue 06**（P0，生产级）：turn numbering vs loop counter——`.scratch/play-e2e/issues/06-turn-numbering-vs-loop-counter.md`。
2. **P0 #4** Playwright 真实玩局 E2E——移植清单遗留，现状只有进程内模拟。
3. **P1 #5–8**：稳定前缀快照、卡提示变更检测、当轮生效注入、种子对话轨迹（注意 #8 与 D21 冲突，worklog 2026-10-16 待决 3 建议不做）。
4. **B2 / B3**：生产消费 AgentPromptContract 五对象（用户已裁决 B2 优先）、参照项目借鉴面。
5. 本次重构收尾项（worklog 切分后余量、host 升级两个阻塞项等）。

## Acceptance

- 文件存在，每项有证据指针；与 worklog 最新待决小节不矛盾（冲突处注明取舍）。
- `check:hygiene` 绿（新文件在 docs 白名单/链接规则内）。
- AGENTS.md 的文档真源表加一行指向它（若适合）。

## Blocked by

04（结构定型后写，路径引用才准确）

## Completion (2026-10-17)

- docs/dev/restart-roadmap.md 落盘：R1 issue 06（根因内联自足）/ R2 playwright 真玩局 / R3 P1#5-8 / R4 B2 / R5 B3 / R6-R8 余项；AGENTS.md 文档真源表登记；VitePress srcExclude 补 'dev/restart-roadmap.md'。提交 `c1176fa`。
