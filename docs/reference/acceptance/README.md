# 真机验收档案

一个功能一份验收报告。文件名 `<FEATURE>_ACCEPTANCE.md`，证据截图存同目录 `screenshots/`，
报告正文用相对路径引用截图。

## 现行档案

| 报告 | 功能 | 日期 | 结论 |
| :--- | :--- | :--- | :--- |
| [DEF02_GALLERY_V2_ACCEPTANCE.md](./DEF02_GALLERY_V2_ACCEPTANCE.md) | 展厅 v2 | 2026-09-28 | 10 项 PASS，含 2 项宿主边界说明 |

## 归档约定

**同一功能的复验、回归、重测一律覆盖更新原文件**，追加一个「复验轮次」小节记录日期、
代码基线和差异结论。**不新增 `R2`/`R3`/`ROUND-N` 平行文件。**

曾经同时存在 `TEST_REPORT.md` + `R2`→`R7` 六轮 + `E2E_BRIEF_ROUND2/3/4/6/7` 五份任务书，
共 81 个文件堆在仓库根。R1 已经不知去向，后来者无从判断哪份是当前结论——这正是要废掉的模式。

真机缺陷与抽查结论的落盘位置见 [`docs/dev/workflow.md`](../../dev/workflow.md) 第 4 节。
报告里的代码基线请写明分支与 commit；测试轮次结论另见
[`docs/dev/worklog.md`](../../dev/worklog.md)。
