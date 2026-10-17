# 票据 05：浏览器面「刷新看得见」

> Status: wontfix（本轮由 primary Agent 代裁决，2026-10-16）· 原依赖：票据 04 + 规格 §6 决策

## 裁决与理由

**不引入 Playwright。** 三条理由：

1. 票据 01–04 已经把**整条事实链**（开局 → 正文 → 推演 → 世界状态 → 时间线 → 重启后仍可折叠）
   用真宿主 + 独立读盘断言覆盖完；浏览器只剩「看得见」这一层，而它不是新事实，是同一份事实的渲染。
2. 为一个**永远不进 CI**、只有本地会跑的作业引入浏览器内核下载，正是 ADR 0015 个人玩具定位要拒绝的
   东西——参照项目装它是因为它有社区用户要为 UI 回归负责，我们没有。
3. UI 观感与手感本来就归人工 brief（规格 §4 非目标已写明）。Playwright 不改变这点，
   只会新增一批脆弱的 DOM 断言。

## 重开条件（不是永远不做）

票据 01–04 落地后，若 B3 暴露的「18 个 `src/client/**` 模块零测试引用」仍未解决，
**另开一张票**专办客户端组件测试（优先 happy-dom 挂载级，成本远低于浏览器），浏览器面仍不做。
真到需要 DOM 级证据那天，隔离宿主已暴露 `baseUrl` 与 token URL，加 Playwright 是增量而非重构。

## 若将来翻案（配方保留，勿丢失）

- devDependency 加 Playwright chromium，仅 `tests/e2e/browser-*.spec.ts` 使用，不进 CI；
- 鉴权：宿主 token query → 签名 cookie `dsh-auth-<authority>`
  （`dsh-client-connection/lib/index.js:226-227`、`authorizeIndex :391-410`），一条 `page.goto(tokenUrl)` 进会话；
- 插件自己的 `webServer` 路由**不在鉴权门内**（`:644-652,829-838`），无需登录即可断言后端事实；
- 写进 `tests/README.md` 的发布前清单。
