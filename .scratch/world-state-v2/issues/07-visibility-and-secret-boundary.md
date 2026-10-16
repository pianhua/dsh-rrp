Status: resolved

## Partial implementation record (2026-09-25)

Backend/shared visibility boundary implemented in `src/world-state-visibility.ts`, `src/projection/world-state.ts`, `src/card-types.ts`, `src/cards-route.ts`, `src/route-contract.ts`, and related tests. Internal/model views remain complete; player view filters protected objects/fields/collections, emits non-revealing notices, sanitizes references/text/diffs, and card detail routes strip filesystem paths plus non-player initial state/schema fields. Player writes preserve or reject hidden content through the Phase 5 safe-write path.

Targeted visibility/card-route/write tests and lint/format/diff checks pass. Phase 6 player-safe markup and timeline route tests now cover the UI boundary; Author/Copilot integration tests cover model/hidden handling and explicit confirmation.

# WorldState 可见性与秘密边界

## Scope

实现 `player`/`model`/`hidden` 可见性在 schema、projection、Author 输入、Chronicler 输入、玩家 UI、月停和路由中的一致边界。玩家只能看到不泄密提示；Author 可消费模型可见内容并遵守卡包秘密规则；不可见内容无直接玩家写入口。

## Acceptance

- player/model/hidden 三类字段、事件和认知可折叠与传输。
- 玩家 UI 不显示隐藏命题、值或正文，只显示不泄密提示。
- 玩家角色使用同一对象模型但有特殊标识；Author 不代写玩家。
- 月停不可静默改隐藏内容，只能按明确指令进入待确认建议；Chronicler 更新保留 actor/provenance。
- 真实卡包秘密和协议隔离测试覆盖。

## Blocked by

01-domain-model-and-projection
02-card-schema-and-official-cards
04-chronicler-and-author-contract
06-worldstate-dual-ui-and-shared-draft
