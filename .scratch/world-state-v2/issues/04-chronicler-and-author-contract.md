Status: resolved

# Chronicler/Author 的 WorldState v2 契约

## Scope

重写 Chronicler 输出和提示词契约：输出完整当前 WorldState + 面向玩家的变更摘要；基于明确剧情证据更新对象、认知、目标、矛盾、事件和卡包字段；抑制无必要的新对象/字段；不写玩家行动、对白或心理。同步 Author 输入分层：卡包/Skills 硬设定、WorldState 近期状态、剧情脉络高维视角。

## Acceptance

- Chronicler 无变化、失败、取消路径不写 WorldState Timeline。
- 可建立追踪对象但需持续剧情证据；暂时出现对象保持外部引用。
- 目标/矛盾关闭需证据，不因未提及自动关闭；认知更新合并同一角色+命题。
- Author 能消费 model-visible/hidden 状态而不把受保护内容直接泄漏给玩家。
- Agent contract、schema、解析和提示词测试通过。

## Blocked by

01-domain-model-and-projection
02-card-schema-and-official-cards
03-persistent-worldstate-timeline

## Agent implementation record

- Replaced the v1 Chronicler contract with a v2 envelope: complete `state`, player-facing `changeSummary`, and bounded `evidence`; prompts now require explicit narrative evidence, v2 sections, external references for temporary objects, evidence-backed closure, cognition merging, visibility/secret boundaries, and no player action/dialogue/inner-life writes.
- Chronicler runner preserves the existing `ctx.jobs` async flow, covering reruns, and D6 player-correction discard. Actual changes publish the complete snapshot with `stateFoldSeq` and an atomic `worldStateTimelineBatch` carrying `actor: 'chronicler'`, story turn, wall-clock time, local origin, field-level diff, and player-facing evidence. No-change, failed, and cancelled paths do not publish timeline data.
- Added Author's layered prompt builder for card/Skills hard setting, WorldState v2 recent state, Summarizer macro compass, and player input. The Author prompt states model-visible/hidden handling and card/Skills secret-disclosure rules without changing prose-only output.

## Verification

- Passed: `pnpm exec vitest run tests/chronicler.spec.ts tests/agents-contract.spec.ts --reporter=dot` (2 files, 24 tests).
- Passed: targeted ESLint, Prettier, and `git diff --check` for the five changed source/test files.
- Passed: Phase 2/3 regression set (`chronicler`, `agents-contract`, `state-publisher`, `world-state-timeline`, `fork-replay`, `start`, `transcript`, `preset`): 8 files, 60 tests.
- Blocked globally: `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, and full `pnpm test` remain non-zero because later v1 consumers/tests (Correction, Copilot, client/UI, lore-condition, old world-state tests, and related route consumers) are outside this slice. The Chronicler/Author source and tests no longer contribute typecheck or targeted lint errors.

## Remaining risk / deferred work

- Correction, Copilot, client, cards, and lore-condition remain v1 consumers and are intentionally untouched per slice boundary; their migration belongs to later tickets.
- The Author builder is a pure contract seam; host-native agent assembly still owns the actual message stream and secret filtering at runtime.
