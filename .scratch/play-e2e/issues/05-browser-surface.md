# 票据 05：浏览器面「刷新看得见」（待所有者裁决）

> Status: needs-info · 依赖：票据 04 + §6 决策 · 规格真源：[`spec.md`](../spec.md) §6

## 阻塞的选择

装不装 Playwright。两案已写在规格 §6，推荐案是「装，但只本地跑、不进 CI」。
**这条不由 Agent 决定**：它给单人玩具引入一个浏览器内核下载与一条只有本地会跑的作业，属取舍不属实现。

裁决前，本票据不进入实现。

## 若裁决为「装」

- devDependency 加 Playwright chromium，仅 `tests/e2e/browser-*.spec.ts` 使用；
- 鉴权：宿主 token query → 签名 cookie `dsh-auth-<authority>`（`dsh-client-connection/lib/index.js:226-227`、`authorizeIndex :391-410`），一条 `page.goto(tokenUrl)` 即进会话；
- 断言：重启宿主后，世界状态页签与舞台仍显示票据 04 已验证的同一份事实（**数据面已由 04 守住，本票只补"看得见"**）；
- 明确不进 CI，写进 `tests/README.md` 的发布前清单。

## 若裁决为「不装」

- 本票据标 `wontfix`，规格 §6 记一句"UI 可见性归人工 brief"，票据 04 的独立读盘断言即为最终证据面。
