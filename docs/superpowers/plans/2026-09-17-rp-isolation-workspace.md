# RP Isolation and Workspace Refactor Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make cards, saves, branches, summary settings, and dynamic lore obey native DSH Session and Workspace boundaries without parallel infrastructure.

**Architecture:** Card packs keep static identity through collision-free preset ids. Every mutable RP value lives in known `user/message.source.rrp` payloads and is folded by session projections, so native Session creation and fork define save isolation. The native Workspace service is consumed only as an optional grouping capability. Legacy sediment files are read once, converted into a session event, and retained as a backup.

**Tech Stack:** TypeScript, Cordis effects, DSH Session projections, DSH agent-scoped Skill providers, React 18, DSH client primitives, Vitest, Zod.

---

### Task 1: Make card identity collision-free

**Files:**
- Modify: `src/preset-id.ts`
- Modify: `src/cards.ts`
- Modify: `tests/preset-id.spec.ts`
- Modify: `tests/cards.spec.ts`

**Step 1: Write failing identity tests**

Add tests proving that only lowercase kebab-case ids are accepted, that `readCard('../x')` is rejected, and that a frontmatter id differing from its directory name is not listed. Keep an assertion that valid ids map exactly to `rp-<cardId>`.

**Step 2: Run the focused tests and confirm RED**

Run: `pnpm vitest run tests/preset-id.spec.ts tests/cards.spec.ts`

Expected: failures for invalid ids and directory mismatch because the current parser accepts arbitrary non-empty ids.

**Step 3: Implement the minimum validation**

Add `isCardId(value): boolean` using `[a-z0-9]+(?:-[a-z0-9]+)*`; make `presetIdForCard` reject invalid ids; validate frontmatter ids in `parseCardMarkdown`; validate input before joining paths in `readCard`; require `entry.name === parsed.meta.id` in `listCards`.

**Step 4: Run focused tests and confirm GREEN**

Run: `pnpm vitest run tests/preset-id.spec.ts tests/cards.spec.ts tests/preset.spec.ts`

Expected: all selected tests pass and valid user overrides still win by card id.

### Task 2: Move the summary toggle into Session state

**Files:**
- Create: `src/settings.ts`
- Create: `src/projection/settings.ts`
- Modify: `src/state-payload.ts`
- Modify: `src/state-publisher.ts`
- Modify: `src/summarizer.ts`
- Modify: `src/index.ts`
- Modify: `src/contracts.ts`
- Modify: `tests/summarizer.spec.ts`
- Modify: `tests/state-publisher.spec.ts`
- Modify: `tests/fork-replay.spec.ts`

**Step 1: Write failing per-session tests**

Add tests with two fake Sessions proving `/summary off` appends settings only to the invoking Agent Session, the trigger continues scheduling for the other Session, and a fork replay inherits only settings events within its copied prefix.

**Step 2: Run the focused tests and confirm RED**

Run: `pnpm vitest run tests/summarizer.spec.ts tests/state-publisher.spec.ts tests/fork-replay.spec.ts`

Expected: failures because `summaryEnabled` is currently one module-level boolean and there is no settings projection.

**Step 3: Implement settings payload and projection**

Define `RRP_SETTINGS_KEY = 'rrpSettings'`, default `{ summaryEnabled: true }`, and a Zod-validated pure projection. Extend `RrpStatePayload` and `RrpStatePatch` with `settings`. Make the facts lane deduplicate against both rendered text and structured hidden state so a settings-only change still appends one known event.

**Step 4: Make command and trigger session-aware**

Remove the module global toggle. Read settings through `sessionProjections.stateOf(session, RRP_SETTINGS_KEY)`. Change the command invocation face to include `agent.session`; publish the new setting to that Session. Inject `sessionProjections` when registering the command.

**Step 5: Run focused tests and confirm GREEN**

Run: `pnpm vitest run tests/summarizer.spec.ts tests/state-publisher.spec.ts tests/fork-replay.spec.ts tests/contracts.spec.ts`

Expected: all selected tests pass; no exported API mutates process-global summary state.

### Task 3: Make dynamic lore a fork-aware projection

**Files:**
- Create: `src/sediment-state.ts`
- Create: `src/projection/sediment.ts`
- Modify: `src/state-payload.ts`
- Modify: `src/state-publisher.ts`
- Modify: `src/sediment-provider.ts`
- Modify: `src/sediment-runtime.ts`
- Modify: `src/index.ts`
- Modify: `src/contracts.ts`
- Modify: `tests/sediment-provider.spec.ts`
- Modify: `tests/sediment-runtime.spec.ts`
- Modify: `tests/state-publisher.spec.ts`
- Modify: `tests/fork-replay.spec.ts`

**Step 1: Write failing projection and provider tests**

Cover `snapshot`, `add`, duplicate-name refusal, `remove`, parent/child replay, and two providers reading different Session projections. Assert provider definitions are returned directly from projected entries and no filesystem path is required.

**Step 2: Run the focused tests and confirm RED**

Run: `pnpm vitest run tests/sediment-provider.spec.ts tests/sediment-runtime.spec.ts tests/fork-replay.spec.ts`

Expected: failures because the provider currently reads one sidecar directory and no sediment projection exists.

**Step 3: Implement types and pure folding**

Define bounded `SedimentEntry`, `SedimentChange`, validation helpers, and `RRP_SEDIMENT_KEY = 'rrpSediment'`. Add a pure projection whose state is an ordered array and whose apply function never mutates prior state.

**Step 4: Publish hidden sediment changes through known events**

Extend the facts lane fingerprint to include `sediment` operations. Preserve existing model-facing WorldState and MacroSummary text; sediment bodies remain only in `source.rrp` and are exposed to the model through the official Skill provider.

**Step 5: Switch the provider to projected state**

Change `createSedimentProvider` to receive a `read()` callback. In `registerSedimentRuntime`, capture the Agent Session and projection service, then read `rrpSediment` for every `list` and `get`. Keep agent-scoped registration and invalidation behavior unchanged.

**Step 6: Run focused tests and confirm GREEN**

Run: `pnpm vitest run tests/sediment-provider.spec.ts tests/sediment-runtime.spec.ts tests/state-publisher.spec.ts tests/fork-replay.spec.ts`

Expected: all selected tests pass and provider output contains only the owning Session's projected entries.

### Task 4: Route writes through Session and migrate legacy sidecars once

**Files:**
- Modify: `src/sediment.ts`
- Modify: `src/sediment-route.ts`
- Modify: `src/sediment-runtime.ts`
- Modify: `tests/sediment.spec.ts`
- Modify: `tests/sediment-route.spec.ts`
- Modify: `tests/sediment-runtime.spec.ts`

**Step 1: Write failing route and migration tests**

Assert that confirm/manual/delete append `SedimentChange` events, GET reads projection state, failed append reports failure without claiming success, and a legacy session directory becomes one `.legacy.bak` directory only after a successful snapshot append.

**Step 2: Run the focused tests and confirm RED**

Run: `pnpm vitest run tests/sediment.spec.ts tests/sediment-route.spec.ts tests/sediment-runtime.spec.ts`

Expected: failures because routes currently write/delete files directly and runtime has no migration.

**Step 3: Replace active file writes with event writes**

Validate drafts with the shared sediment-state validator, reject reserved or existing names, call `publishState(session, projections, { sediment })`, then invalidate the provider. GET and Scribe `existing` names come from `rrpSediment`. Delete appends `{ kind: 'remove', name }`.

**Step 4: Add a narrow legacy adapter**

Keep only read/list helpers needed to inspect old sidecars. Add an idempotent migration function that appends one `snapshot` event and then renames the old per-session directory to an explicit `.legacy.bak` path. Never use the legacy tree after a projected event exists.

**Step 5: Run focused tests and confirm GREEN**

Run: `pnpm vitest run tests/sediment.spec.ts tests/sediment-route.spec.ts tests/sediment-runtime.spec.ts tests/scribe.spec.ts`

Expected: all selected tests pass, including retained backup and failed-append behavior.

### Task 5: Add optional native Workspace assignment to the gallery

**Files:**
- Modify: `src/client/context-types.ts`
- Modify: `src/client/gallery-panel.tsx`
- Modify: `src/client/index.ts`
- Modify: `tests/client.spec.ts`
- Modify: `package.json`

**Step 1: Write failing client tests**

Add structural tests proving a selected Workspace id is passed to `sessions.create({ workspaceId })` and that missing Workspace capability falls back to `sessions.create({})` without hiding the gallery.

**Step 2: Run the client test and confirm RED**

Run: `pnpm vitest run tests/client.spec.ts`

Expected: failure because gallery start currently always calls `sessions.create({})` and client context has no Workspace face.

**Step 3: Add optional Workspace projection and control**

Model the minimal host `ctx.workspaces.list` snapshot/subscribe face locally. Supply existing Workspace rows to the gallery. Render a compact, locale-backed selector with DSH primitives/tokens only when rows exist; keep “未分组” as a valid choice.

**Step 4: Pass the native id into Session creation**

Change the start callback to accept the selected Workspace id and call `sessions.create(workspaceId === undefined ? {} : { workspaceId })`. Do not create directories, write Workspace metadata, or replace the native left sidebar.

**Step 5: Run client tests and confirm GREEN**

Run: `pnpm vitest run tests/client.spec.ts`

Expected: tests pass for both capability-present and capability-absent hosts.

### Task 6: Align docs, contracts, and complete verification

**Files:**
- Modify: `docs/HOST_ALIGNMENT.md`
- Modify: `docs/reference/DECISIONS.md`
- Modify: `docs/reference/CARDS.md`
- Modify: `docs/reference/SKILLS.md`
- Modify: `docs/reference/WORLDLINES.md`
- Modify: `docs/ACTIVE_TASK.md`
- Modify: `README.md`

**Step 1: Update the factual baseline**

Record that card ids are canonical, summary settings and D8 are Session projections, legacy sidecars are migration-only backups, and Workspace remains an optional native grouping layer. Remove statements that describe the old filesystem or global-toggle implementation as current behavior.

**Step 2: Run the complete verification suite**

Run: `pnpm test`

Expected: all tests pass.

Run: `pnpm run typecheck`

Expected: exit code 0 with no diagnostics.

Run: `pnpm run build`

Expected: host/client ESM bundles and declarations build successfully.

**Step 3: Inspect the final diff and forbidden patterns**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `rg -n "createServer|node:http|summaryEnabled\s*=|writeSediment\(|removeSediment\(" src`

Expected: no custom server, no process-global summary toggle, and no active route/runtime use of legacy sediment writes.

**Step 4: Perform a final self-review**

Check each requirement in the design document against code and tests, verify no user-owned changes were reverted, and report any residual host-version assumption explicitly.
