# Issue tracker: Local Markdown

本项目是个人单机玩具，需求与任务使用仓库内的本地 Markdown，不调用 GitHub、Linear 或其他外部 Issue 服务。外部仓库只承担代码同步，不承担日常工作状态。

## Conventions

- 一个工作主题一个目录：`.scratch/<feature-slug>/`
- 需求规格：`.scratch/<feature-slug>/spec.md`
- 实现票据：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始，阻塞者排在前面
- `Status:` 写在票据顶部；有效值为 `needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`、`claimed`、`resolved`
- 对话与补充结论追加到 `## Comments`，不覆盖旧内容
- 文件名使用小写短横线；标题使用 `GLOSSARY.md` 中的标准术语

## Publishing

- `to-spec` 把规格写入 `.scratch/<feature-slug>/spec.md`，并标为 `ready-for-agent`。
- `to-tickets` 为每个垂直切片创建一个票据文件，并在 `Blocked by:` 中列出真实阻塞票据。
- `triage` 只处理尚未成形的外部请求或 Bug 报告；`to-tickets` 产出的票据已经是 `ready-for-agent`，不再重复 triage。
- Agent 开始处理票据前，先把 `Status:` 改为 `claimed`；完成后追加答案并改为 `resolved`。

## Wayfinder

- 地图：`.scratch/<effort>/map.md`
- 子决策票据：`.scratch/<effort>/issues/NN-<slug>.md`
- `Blocked by:` 用票据编号列出前置决策；只有全部前置票据为 `resolved` 才进入 frontier。
- 决策结论写在票据的 `## Answer` 下，并把一句话指针追加到地图的 `Decisions so far`。

本配置只描述本地流程；第一次创建具体主题时再创建 `.scratch/<feature-slug>/`，不预先制造空目录。
