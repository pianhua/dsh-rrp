# DeepSeek Harness Plugin Development Research Report

**Repository**: `deepseek-ai/deepseek-harness`  
**Checkout Version**: `0.1.6-alpha.1` (Commit: `0d1f5000`)  
**Target Architecture**: Cordis-based All-Plugin Agent Harness  
**Report Destination**: `/root/reports/dsh-plugin-development-research.md`  

---

## 1. Executive Summary & Foundational Paradigm

DeepSeek Harness (`dsh`) is an **all-plugin agent harness** built upon a vendored fork of the Cordis micro-kernel framework (`vendor/cordis`, `@deepseek-ai/cordis` v4.0.0-rc.7). In DeepSeek Harness, **there is no privileged core application to patch**. Every subsystem—including the agent loop driver (`dsh-agent-loop`), the system prompt assembler (`dsh-system-prompt`), the scoped tool pipeline (`dsh-tools`), LLM adapters (`dsh-llm-deepseek`), persistent session storage (`dsh-session`), filesystem drivers (`dsh-fs-local`), and Web GUI components—is mounted as a Cordis plugin into a shared dependency injection container (`Context`).

Extending DeepSeek Harness does not involve modifying core code. Instead, developers build and mount plugins alongside existing plugins. Registrations within plugins are strictly **reversible effects** that unwind cleanly when a plugin unloads or is hot-reloaded.

Plugin development in DeepSeek Harness exists across two primary modalities:
1. **Static / Monorepo / External Bundle Plugins**: Standard Node.js ESM packages published to npm, linked via pnpm, or authored within the monorepo workspaces. These plugins are statically or dynamically composed via **Profiles** and **Bundles** declaring YAML patch layers (`cordis.patch.yml`).
2. **Dynamic In-Memory Plugins**: Ephemeral plugins defined at runtime in plain JavaScript by an agent or user through the extensions subsystem (`packages/extensions/tool-cordis`). These run within process memory, support dual Host/Browser execution, and are garbage-collected on restart without modifying configuration or disk files.

This report documents the end-to-end technical mechanics, APIs, lifecycle rules, testing patterns, and version-specific caveats governing plugin development in DeepSeek Harness.

---

## 2. Cordis Framework Architecture & Core Runtime Model

The foundational framework underpinning DeepSeek Harness is vendored at `vendor/cordis` and rescoped to `@deepseek-ai/cordis`.

### 2.1 The Context (`Context`)

The `Context` object (`vendor/cordis/src/context.ts`) is the central dependency injection and event container:
- **Proxy-based resolution**: `Context` instances are JavaScript `Proxy` objects wrapped around a internal state machine. Accessing `ctx.foo` executes reflection hooks (`ReflectService.handler`) that resolve the service named `foo`.
- **Hierarchical tree**: Contexts form a parent-child tree. Calling `ctx.extend(meta)` produces a prototypically inherited child context that shadows or adds scoped metadata (e.g., scoping a registration to a specific session or agent via symbols).
- **Service isolation**: `ctx[symbols.isolate]` enables service name isolation. Two isolated plugin groups can each see a distinct implementation of `ctx.shell` without collision.
- **Root access**: `ctx.root` provides access to the application root context.

### 2.2 The Fiber State Machine (`Fiber`)

Every loaded plugin instance is managed by a runtime `Fiber` (`vendor/cordis/src/fiber.ts`). The fiber tracks lifecycle state, injected dependencies, validated configuration, and registered disposers.

```
       ┌──────────┐
       │ PENDING  │◄─────────────────┐ (dependency lost)
       └────┬─────┘                  │
            │ (all dependencies met) │
            ▼                        │
       ┌──────────┐                  │
       │ LOADING  │                  │
       └────┬─────┘                  │
            ├───► FAILED (throw)     │
            ▼                        │
       ┌──────────┐                  │
       │  ACTIVE  │──────────────────┤
       └────┬─────┘                  │
            │ (unload / HMR / stop)  │
            ▼                        │
       ┌──────────┐                  │
       │UNLOADING │                  │
       └────┬─────┘                  │
            ▼                        │
       ┌──────────┐                  │
       │ DISPOSED │──────────────────┘
       └──────────┘
```

The `FiberState` enum defines:
1. `PENDING` (0): The plugin is registered, but one or more services declared in its `inject` list are not yet registered or active in the context. Fibers in `PENDING` do not execute `apply()` and do not prevent the Node event loop from idling.
2. `LOADING` (1): All dependencies are satisfied; the plugin's `apply()` function or class constructor is currently executing.
3. `ACTIVE` (2): `apply()` completed successfully. All effects, services, tools, and event listeners are active.
4. `FAILED` (3): Configuration schema validation failed or `apply()` threw an unhandled error.
5. `UNLOADING` (5): Cleanup is running. Disposers are being invoked.
6. `DISPOSED` (4): The fiber is completely torn down and removed from the registry (`fiber.uid === null`).

### 2.3 Plugin Entrypoint Shapes

Cordis natively supports three plugin shapes (`vendor/cordis/src/registry.ts` lines 91-134):

#### Shape 1: Function Plugin (Most Common)
```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-function-plugin'
export const inject = ['tools']

export function apply(ctx: Context, config: Config) {
  // Setup logic
}
```

#### Shape 2: Object Plugin
```ts
import type { Context } from '@deepseek-ai/cordis'

export const myPlugin = {
  name: 'my-object-plugin',
  inject: ['tools'],
  apply(ctx: Context, config: Config) {
    // Setup logic
  },
}
```

#### Shape 3: Class Plugin (`Service` Subclass)
Used when a plugin provides a named service to other plugins:
```ts
import { Service, type Context } from '@deepseek-ai/cordis'

export class GreeterService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'greeter') // Registers ctx.greeter immediately
  }

  greet(name: string): string {
    return `Hello, ${name}!`
  }
}
```

### 2.4 Reversible Effects and Disposers

In DeepSeek Harness, registrations are **effects**. Unloading a plugin fiber must tear down everything it introduced:
- `ctx.on(event, listener)` returns a disposer function and registers it with the fiber. Unloading the plugin removes the listener.
- `ctx.effect(callback)` runs `callback()` during load and expects a disposer function (or iterable of disposers) to run during unload.
- `ctx.plugin(child)` mounts a child plugin whose fiber is automatically disposed when the parent is disposed.
- **Teardown ordering**: Disposers execute in reverse registration order (LIFO). However, multiple asynchronous disposers run concurrently. When sequential teardown is mandatory, wrap all steps in a single async disposer and `await` them sequentially.

### 2.5 Typed Events and Dispatch Modes

Services announce lifecycle milestones and state transitions via typed events on `EventsService` (`vendor/cordis/src/events.ts`).

TypeScript types are augmented via **declaration merging**:
```ts
declare module '@deepseek-ai/cordis' {
  interface Events {
    'custom/notify''(message: string): void
    'custom/intercept''(payload: Data, next: () => Promise<Data>): Promise<Data>
  }
}
```

Every event has an explicit `@mode` that dictates its execution semantics:

| Mode | Invocation Method | Awaited? | Execution Order | Return Value | Semantics |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `emit` | `ctx.emit(name, ...args)` | No | Registration order | None (`void`) | Synchronous broadcast. Listeners observe in order; return values are ignored. |
| `parallel` | `await ctx.parallel(name, ...args)` | Yes | Concurrent | None (`Promise<void>`) | All listeners execute concurrently via `Promise.all`. |
| `serial` | `await ctx.serial(name, ...args)` | Yes | Registration order | First bail value | Listeners execute in order, awaited. First non-`null`/`false`/`undefined` returns. |
| `bail` | `ctx.bail(name, ...args)` | No | Registration order | First bail value | Synchronous version of `serial`. Stops at the first non-null/false/undefined value. |
| `waterfall` | `ctx.waterfall(name, ...args, next)` | Yes/No (as typed) | Around-middleware chain | Outermost return value | Around-middleware pattern. Listeners receive `(..., next)`. Must call `next()` to delegate. |

#### Critical Rule: Cordis Waterfall Semantics
In a `waterfall` event (such as `agent/request`, `tools/pre-execute`, or `approval/request`):
- Each listener wraps downstream execution. Calling `next()` delegates to the next listener (or default handler).
- **A listener that only observes or annotates MUST call `next()`**.
- Returning without calling `next()` deliberately short-circuits (vetoes) the pipeline. Forgetting `next()` silently swallows all downstream processing.

---

## 3. Package Boundaries, Monorepo Topology & Constraints

DeepSeek Harness enforces strict architectural boundaries across its package graph (`AGENTS.md`, `packages/AGENTS.md`, and `scripts/check-workspace-constraints.ts`).

### 3.1 Repository Layout
```
/root/deepseek-harness/
├── vendor/                # Vendored dependencies (cordis, cosmokit, schemastery, loader, include)
├── packages/              # Modular workspaces grouped by functional domain
│   ├── core/              # core agent loop, session log, tools, system-prompt, scope
│   ├── llm/               # model adapters (deepseek, pi-ai, retry, streaming)
│   ├── shell/             # command execution (bash, pwsh, local, sandbox)
│   ├── boot/              # application startup and profile loading (dsh-app-boot)
│   ├── bundle/            # profile bundles (dsh-base, dsh-web-app, dsh-headless)
│   ├── client/            # Web GUI plugins (ui-conversation, ui-settings-plugins, etc.)
│   ├── host/              # host-side GUI backends (plugin-inventory, webserver)
│   ├── extensions/        # dynamic in-memory plugins (tool-cordis, cordis-host-runner)
│   └── util/              # zero-dependency utility packages (brand, values, home-paths)
├── apps/
│   ├── cli/               # The dsh executable CLI
│   ├── web/               # Web client frontend shell
│   └── desktop/           # Electron desktop application
```

### 3.2 Package Topology and Capability Seams

A swappable capability in DeepSeek Harness follows the **Capability Seam** model consisting of three distinct roles (`docs/capability-seams.md`):
1. **Service Definition**: Declares the interface, types, and TypeScript declaration merging on `Context` (e.g., `packages/shell/shell`).
2. **Service Provider**: Implements the capability behind the defined interface (e.g., `packages/shell/bash-local` or `packages/shell/bash-sandbox`).
3. **Consumer**: Uses the capability, typically exposing it to the model or user (e.g., `packages/shell/tool-bash`).

#### Context Key Naming Conventions
- **Singular key** (`ctx.shell`, `ctx.llm`, `ctx.systemPrompt`): Represents a single active engine, runtime, controller, or policy.
- **Plural key** (`ctx.tools`, `ctx.agents`, `ctx.sessions`, `ctx.commands`): Represents a registry or service that manages multiple dynamic members.

### 3.3 Workspace Constraints & `package.json` Invariants
Every monorepo package under `packages/<group>/<pkg>` must satisfy automated hygiene checks:
- `"type": "module"`: Pure ESM repository-wide.
- `"main": "lib/index.js"` and `"types": "lib/types/index.d.ts"`.
- Explicit export mapping:
  ```json
  "exports": {
    ".": {
      "types": "./lib/types/index.d.ts",
      "default": "./lib/index.js"
    },
    "./src/*": "./src/*",
    "./package.json": "./package.json"
  }
  ```
- **Peer & Dev Dependencies**: `@deepseek-ai/cordis` must appear in **both** `peerDependencies` and `devDependencies` using `workspace:^`. Every peer dependency must be mirrored in `devDependencies`.
- **Runtime Schemas**: `@deepseek-ai/schemastery` belongs in `dependencies` if `Config` schemas are exposed.
- **In-source relative imports**: Must explicitly include `.ts` extensions (e.g., `import { foo } from './foo.ts'`). TypeScript compiles these to `.js` in emitted output while retaining `.d.ts` cross-references.
- **No mixed planes**: Static gates and tests resolve workspace packages via `tsconfig.base.json` paths directly to `src/`. Built `lib/` artifacts are never loaded during ordinary unit tests.

---

## 4. Plugin Registration, Discovery, and Composition

DeepSeek Harness applications boot by assembling an ordered stack of configuration layers rather than running hard-coded bootstrap code.

### 4.1 Profiles and Bundles Architecture

The boot system is managed by `packages/boot/app-boot` (`src/profile.ts`):
- **Profile**: A named directory under `$DSH_HOME/profiles/<name>` holding:
  - `package.json`: Contains out-of-tree plugin dependencies and a `dsh.profile` manifest listing an ordered array of `bundles`.
  - `cordis.patch.yml`: The user's local patch overrides.
  - `pnpm-workspace.yaml`: Hoisted dependency configuration (`nodeLinker: hoisted`, `autoInstallPeers: false`).
- **Bundle**: An installable npm package that ships a configuration layer. It declares in its `package.json`:
  ```json
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
  ```

### 4.2 Configuration Layer Precedence

When `dsh --profile <name>` launches, `app-boot` starts with an empty plugin entry list (`[]`) and applies layers in this exact sequence:
1. **Bundle Layers**: Applied in the exact order listed in `dsh.profile.bundles` (`@deepseek-ai/dsh-base` is always first in base-backed profiles).
2. **Profile Patch**: The profile-level `$DSH_HOME/profiles/<name>/cordis.patch.yml`.
3. **Home Patch**: The global `$DSH_HOME/cordis.patch.yml` (machine-level preferences).
4. **CLI Overlays**: Any `--patch <path>` arguments passed on the command line.

```
┌────────────────────────────────────────────────────────┐
│ Empty Entry List: []                                   │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 1. Bundles in order: dsh-base -> dsh-web-app -> ...    │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. Profile Patch: $DSH_HOME/profiles/<name>/cordis...  │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 3. Global Patch: $DSH_HOME/cordis.patch.yml            │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 4. Command Line Overlays: --patch <file>               │
└────────────────────────────────────────────────────────┘
```

### 4.3 Patch Semantics

A Cordis patch file (`cordis.patch.yml`) contains top-level array directives:
- **Insert**: Appends new plugin entries.
  ```yaml
  - insert:
      - id: my-tool
        name: 'dsh-my-tool'
        config:
          timeoutMs: 5000
  ```
- **Override by ID**: Targets an existing row by `id` and **replaces its entire `config` object** (it does *not* deep-merge).
  ```yaml
  - id: webserver
    config:
      host: 127.0.0.1
      port: 8080
  ```
- **Disable**: Disables a plugin without deleting the entry.
  ```yaml
  - id: hmr
    disabled: true
  ```

### 4.4 The `dsh plugin` CLI Manager

The `dsh plugin --profile <name> <args...>` command (`apps/cli/src/plugin.ts`) is a thin forwarder to `pnpm`:
1. Initializes `$DSH_HOME/profiles/<name>` if it does not exist.
2. Rewrites relative file paths (e.g., `./my-plugin`) against the user's current working directory.
3. Spawns `pnpm <args>` inside the profile directory.
4. Reads the installed packages in the profile. For every package that declares `dsh.bundle.patch` in its `package.json`, it reconciles `dsh.profile.bundles`:
   - If newly added, appends it to `bundles`.
   - If removed from dependencies, drops it from `bundles`.
   - If installed without `dsh.bundle`, warns: `warning: <pkg> declares no dsh.bundle — installed as a plain dependency, not a profile layer`.

---

## 5. Configuration Architecture & Validation

Plugins declare their runtime configuration contracts using `@deepseek-ai/schemastery` (`docs/cordis-tutorial/05-config.md`).

### 5.1 Defining a Config Schema
```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export interface Config {
  apiKey?: string
  timeoutMs: number
  endpoints: string[]
}

export const Config: Schema<Config> = Schema.object({
  apiKey: Schema.string().description('Optional API authorization token'),
  timeoutMs: Schema.number().default(10000).description('Execution timeout in ms'),
  endpoints: Schema.array(String).default([]).description('Candidate endpoint URLs'),
})

export function apply(ctx: Context, config: Config) {
  // config is fully typed and pre-validated against Config schema
}
```

### 5.2 Schema Validation Mechanics
- Cordis implements Standard Schema v1 (`~standard`).
- Before `apply(ctx, config)` is invoked, `resolveConfig` (`vendor/cordis/src/fiber.ts` line 50) executes schema validation.
- Missing values with `.default(v)` are automatically filled in.
- Type mismatches throw a `ValidationError` containing formatted field paths and error messages.
- If validation fails, the fiber transitions to `FAILED`. In production startup (`installFailLoud`), failing a required plugin halts startup immediately.

### 5.3 Computed Config Expressions (`!!js`)
The YAML loader supports `!!js` expressions for runtime evaluation:
1. **Inside `config`**: Evaluated *after* declared `inject` services become active, scoped to the plugin's own context (`ctx.serviceName`).
   ```yaml
   - id: my-service
     name: '@example/my-service'
     inject: ['credentials']
     config:
       token: !!js ctx.credentials.get('MY_TOKEN')
   ```
2. **In `disabled: !!js <expr>`**: Evaluated at every mount decision against the loader context, allowing environment- or platform-gated row activation:
   ```yaml
   - id: pwsh
     name: '@deepseek-ai/dsh-pwsh-local'
     disabled: !!js process.platform !== 'win32'
   ```

---

## 6. Plugin Runtime Types & Authoring Patterns

### 6.1 Model-Facing Tool Plugins (`packages/core/tools`)

A tool plugin exposes operations that the LLM can invoke. Tools are registered with `ctx.tools` via `defineTool` (`docs/cookbook/adding-a-tool.md`).

#### The `defineTool` Contract
```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'my-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'calculate_sum',
    description: 'Calculate the sum of two numbers.',
    parameters: {
      a: { type: 'number', required: true, description: 'First number' },
      b: { type: 'number', required: true, description: 'Second number' },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          sum: { type: 'number', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `Sum is ${value.sum}` }],
    },
    async execute(args, exec) {
      // args is statically typed: { a: number; b: number }
      if (exec.signal.aborted) throw new Error('Aborted')
      return { sum: args.a + args.b }
    },
    presentCall(args) {
      return { card: 'generic', title: `Adding ${args.a} + ${args.b}` }
    },
    presentResult(args, result) {
      return { card: 'generic', title: 'Result', content: result.content }
    },
  }))
}
```

#### Tool Pipeline Rules
- **Argument validation**: `defineTool` validates model JSON arguments against `parameters` before calling `execute()`.
- **Cancellation**: Tools must honor `exec.signal` and cancel asynchronous operations when aborted.
- **Canonical Output Schema**: `execute()` must return a canonical JSON value matching `output.schema`. `output.render` translates that value into model-facing `ContentBlock[]`.
- **UI Card Presenters**: `presentCall` and `presentResult` return pure, side-effect-free render intents (`generic`, `terminal`, `diff`, `read`, `search`, `web`). They execute during live streaming and upon session log replay.
- **Programmatic Tool Calling (PTC)**: Any tool registered via `defineTool` is automatically available to PTC scripts (`await tools.calculate_sum({ a: 1, b: 2 })`).

### 6.2 Service Provider Plugins

A service provider introduces a persistent API onto `Context` for consumption by other plugins:
```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    cache: MemoryCacheService
  }
}

export class MemoryCacheService extends Service {
  private store = new Map<string, unknown>()

  constructor(ctx: Context) {
    super(ctx, 'cache') // Mounts onto ctx.cache
  }

  get<T>(key: string): T | undefined {
    return this.store.get(key) as T | undefined
  }

  set(key: string, value: unknown): void {
    this.store.set(key, value)
  }
}

export const name = 'memory-cache'
export function apply(ctx: Context) {
  ctx.plugin(MemoryCacheService)
}
```

### 6.3 Web Client UI Plugins (`packages/client/*`)

The Web GUI frontend uses Cordis inside the browser (`packages/client/AGENTS.md`).

#### Non-Negotiable Client Invariants
1. **Components never see `ctx`**: React components receive data and callbacks strictly through the **four props shares**:
   - `PropsRuntime`: Session/workspace state and IDs.
   - `PropsRenderSlots`: Child slot renderers.
   - `PropsStore`: Local store state and action dispatches.
   - `inject` face: Plain callbacks and values exposed by the plugin's `apply()` closure.
2. **Slots Discipline**: UI composition occurs exclusively via `ctx.slots.register()`.
   ```ts
   ctx.slots.inject('sidebar.footer', () => ctx.slots.register(
     { name: 'sidebar.footer', id: 'my-action' },
     (props) => <MyButton onClick={props.actions.doSomething} />
   ))
   ```
3. **Locale-owned Copy**: All product copy must be routed through typed locale dictionaries (`ctx.locale.register()`). Hardcoded UI strings are rejected by `verify-client-ui-i18n`.

### 6.4 Dynamic Runtime Plugins (`packages/extensions/*`)

Agents can self-extend by defining in-memory plugins using `@deepseek-ai/dsh-tool-cordis`:
- **Lifecycle Tools**:
  - `cordis_inspect_list`: Inspects available Host and Client providers, slots, and methods.
  - `cordis_inspect_query`: Queries exact signatures, schema parameters, and slot properties.
  - `cordis_define`: Compiles plain JavaScript code strings into an immutable in-memory package under a `pluginId`.
  - `cordis_run`: Mounts the package into the live Cordis runtime.
  - `cordis_stop`: Pauses plugin execution without deleting code or version history.
  - `cordis_undefine`: Permanently unmounts and removes the plugin.
- **Execution Constraints**: Dynamic code is plain JavaScript function bodies returning `{ apply(ctx) {} }`. JSX, TypeScript syntax, ES imports, and `require()` are forbidden. Host and Client communicate via JSON RPC: `harness.handle(method, fn)` on Host and `await host.call(method, args)` on Client.

---

## 7. Testing Strategy & Quality Gates

Testing policy is defined in `docs/testing.md`. DeepSeek Harness maintains strict quality gates enforced in CI.

### 7.1 Testing Tiers

| Tier | Command | Purpose | Requirements |
| :--- | :--- | :--- | :--- |
| **Unit Tests** | `pnpm run test` | Fast package unit testing with Vitest. | Must test logic, failure paths, and HMR safety. |
| **Coverage Gate** | `pnpm run test:coverage` | **Per-file 100% coverage** on all files under `packages/*/*/src`. | CI gating requirement. Uncovered lines fail the build. |
| **Real-API E2E** | `pnpm run test:e2e` | Live integration with DeepSeek API. | Self-skips when `DEEPSEEK_API_KEY` is not set. |
| **Expected Output** | `pnpm run test:expected` | Assembled CLI/process verification. | Tests CLI profiles and outputs without full replay. |
| **Recorded Snapshots** | `pnpm run test:snapshot` | Keyless deterministic replay of recorded sessions. | Runs recorded sessions through profiles. |
| **Web Browser Tests**| `pnpm run test:web` | Playwright/Chromium UI tests. | Tests frontend rendering against recorded sessions. |

### 7.2 The Mandatory HMR Safety Test
Every registry and plugin in DeepSeek Harness must verify that unloading its fiber completely undoes all registrations.

Example from `packages/shell/tool-bash/tests/tools.spec.ts` (lines 412-426):
```ts
it('unregisters everything when the plugin fiber is disposed (HMR safety)', async () => {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(LocalSubprocessRuntime)
  await ctx.plugin(LocalBashExecutor, {})
  await ctx.plugin(BashEnvPlugin)

  // Mount plugin fiber
  const fiber = await ctx.plugin(ToolBash)
  expect(ctx.tools.schemas()).toHaveLength(1)

  // Dispose fiber
  await fiber.dispose()

  // Assert complete cleanup
  expect(ctx.tools.schemas()).toHaveLength(0)
})
```

### 7.3 Real Implementation vs. Mocks
DeepSeek Harness adheres to a strict testing philosophy:
- **Mock only external network and expensive LLM boundaries**.
- Do not mock the Cordis framework, `Context`, `ToolRuntime`, `AgentLoop`, or persistence layers. Tests must run against real Cordis plugin instances to verify that dependency injection, event dispatching, and fiber lifecycles execute as configured.

---

## 8. Build, Packaging, and Distribution Workflow

### 8.1 Build Architecture

The repository build is orchestrated by `scripts/build.ts` and `tsdown.config.ts`:
1. **TypeScript Emit (`tsc`)**:
   - `tsc -b tsconfig.host.json` compiles Host packages, emitting JavaScript and declarations into `lib/types/`.
   - `tsc -b tsconfig.client.json` compiles Client packages into `lib/types/`.
2. **Runtime Bundling (`tsdown`)**:
   - `tsdown --env.DSH_BUILD_FACE host` reads `lib/types/{index,invariant,startup}.js` and bundles the distribution entrypoint into `lib/index.js`.
   - `tsdown --env.DSH_BUILD_FACE client` packages browser-facing code into `lib/client.js`.
3. **Static Checks**:
   - `pnpm run constraints`: Validates `package.json` structures, exports, and files lists.
   - `pnpm run hygiene`: Runs publint, dependency validation, and NodeNext consumer resolution.
   - `pnpm run lint`: Runs oxlint with strict rule suites.

### 8.2 Distributing an External Plugin

External developers building out-of-tree plugins should follow the bundle distribution pattern:
1. **Package Format**:
   - Create an npm package exporting ESM (`"type": "module"`).
   - In `package.json`, declare:
     ```json
     {
       "name": "dsh-plugin-example",
       "version": "1.0.0",
       "type": "module",
       "main": "lib/index.js",
       "types": "lib/index.d.ts",
       "files": ["lib", "cordis.patch.yml"],
       "dsh": {
         "bundle": {
           "patch": "./cordis.patch.yml"
         }
       },
       "peerDependencies": {
         "@deepseek-ai/cordis": "^4.0.0"
       }
     }
     ```
2. **Bundle Patch (`cordis.patch.yml`)**:
   ```yaml
   - insert:
       - id: example-plugin
         name: 'dsh-plugin-example'
         config:
           enabled: true
   ```
3. **Distribution Channels**:
   - **npm Registry**: Publish prebuilt `lib/` output via `npm publish`.
   - **Tarball**: Distribute tarball via `pnpm pack`.
   - **Git Repository**: Include a `prepare` script in `package.json` that runs `tsdown`. Note that pnpm ≥10 requires users to add the package to `allowBuilds` in their profile's `pnpm-workspace.yaml`.

---

## 9. Minimal End-to-End Plugin Example

Below is a complete, working, production-grade example of an out-of-tree external plugin named `dsh-tool-uuid` that provides a UUID generation tool to DeepSeek Harness.

### 9.1 Directory Structure
```
dsh-tool-uuid/
├── package.json
├── tsconfig.json
├── cordis.patch.yml
├── src/
│   └── index.ts
└── tests/
    └── index.spec.ts
```

### 9.2 `package.json`
```json
{
  "name": "dsh-tool-uuid",
  "version": "0.1.0",
  "description": "UUID generation tool plugin for DeepSeek Harness",
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/index.d.ts",
  "files": [
    "lib",
    "cordis.patch.yml"
  ],
  "scripts": {
    "build": "tsdown src/index.ts --dts -o lib",
    "test": "vitest run"
  },
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.0-rc.7",
    "@deepseek-ai/dsh-tools": ">=0.1.6-alpha.1"
  },
  "dependencies": {
    "@deepseek-ai/schemastery": "^3.18.0"
  },
  "devDependencies": {
    "@deepseek-ai/cordis": "^4.0.0-rc.7",
    "@deepseek-ai/dsh-tools": ">=0.1.6-alpha.1",
    "tsdown": "^0.5.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

### 9.3 `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

### 9.4 `cordis.patch.yml`
```yaml
- insert:
    - id: tool-uuid
      name: 'dsh-tool-uuid'
      config:
        prefix: 'id_'
```

### 9.5 `src/index.ts`
```ts
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-uuid'
export const inject = ['tools']

export interface Config {
  /** Optional prefix prepended to generated UUIDs */
  prefix?: string
}

export const Config: Schema<Config> = Schema.object({
  prefix: Schema.string().default('').description('Prefix prepended to generated UUIDs'),
})

export function apply(ctx: Context, config: Config = {}) {
  const prefix = config.prefix ?? ''

  ctx.tools.register(defineTool({
    name: 'generate_uuid',
    description: 'Generate a random UUID v4 string with an optional custom prefix.',
    parameters: {
      uppercase: {
        type: 'boolean',
        required: false,
        description: 'Whether to return the UUID in uppercase characters.',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          uuid: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.uuid }],
    },
    async execute(args, exec) {
      if (exec.signal.aborted) {
        throw new Error('UUID generation aborted')
      }

      let uuid = randomUUID()
      if (args.uppercase === true) {
        uuid = uuid.toUpperCase()
      }

      return {
        uuid: `${prefix}${uuid}`,
      }
    },
    presentCall(args) {
      return {
        card: 'generic',
        title: 'Generating UUID',
        rawInput: JSON.stringify(args),
      }
    },
    presentResult(_args, result) {
      return {
        card: 'generic',
        title: 'Generated UUID',
        content: result.content,
      }
    },
  }))
}
```

### 9.6 `tests/index.spec.ts`
```ts
import { describe, it, expect } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import * as UuidPlugin from '../src/index.ts'

describe('dsh-tool-uuid', () => {
  it('registers the generate_uuid tool and executes correctly', async () => {
    const ctx = new Context()
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(UuidPlugin, { prefix: 'test_' })

    // Check schema is registered
    const schemas = ctx.tools.schemas()
    expect(schemas.some(s => s.name === 'generate_uuid')).toBe(true)

    // Execute call through the tool execution pipeline
    const result = await ctx.tools.execute({
      callId: brandString<ToolCallId>('uuid-call-1'),
      name: 'generate_uuid',
      arguments: { uppercase: true },
      signal: new AbortController().signal,
    })

    expect(result.isError).toBe(false)
    const textBlock = result.content[0]
    expect(textBlock.type).toBe('text')
    expect(textBlock.text).toMatch(/^test_[0-9A-F-]{36}$/)
  })

  it('unregisters tool when fiber is disposed (HMR safety test)', async () => {
    const ctx = new Context()
    await ctx.plugin(ToolRuntime)
    const fiber = await ctx.plugin(UuidPlugin)

    expect(ctx.tools.schemas()).toHaveLength(1)

    // Dispose fiber
    await fiber.dispose()

    // Verify tool is completely unregistered
    expect(ctx.tools.schemas()).toHaveLength(0)
  })
})
```

### 9.7 How to Build, Install, and Run
1. **Build the plugin**:
   ```sh
   pnpm run build
   ```
2. **Install into a DSH profile**:
   ```sh
   dsh plugin --profile custom-profile add ./dsh-tool-uuid
   ```
   *`dsh plugin` detects `dsh.bundle` in `package.json`, links the dependency, and appends `dsh-tool-uuid` to `bundles` in `$DSH_HOME/profiles/custom-profile/package.json`.*
3. **Verify configuration composition without booting**:
   ```sh
   dsh --profile custom-profile --dump-config
   ```
   *Prints the merged YAML tree showing the `# == dsh-tool-uuid` layer and the inserted `tool-uuid` entry.*
4. **Run the profile**:
   ```sh
   dsh --profile custom-profile
   ```

---

## 10. Version-Specific Caveats & Current Checkout Nuances

This section records critical facts and potential pitfalls specific to the current checkout (`0.1.6-alpha.1`, commit `0d1f5000`):

### 10.1 Pre-stable API Status
- As stated in `AGENTS.md`, public APIs are **pre-stable**. Types, service contracts, and session formats may change across alpha releases.
- Any change to durable session events must observe `SESSION_FORMAT_VERSION` and monotonic schema version rules.

### 10.2 Local Modifications to Vendored Cordis
The vendored Cordis (`vendor/cordis`) contains 19 deliberate local modifications (`vendor/README.md`) that differ from upstream Cordis:
1. **Lazy Config Evaluation**: Loader resolves raw config via the `internal/config` waterfall *only after* declared injections are active. If an injected service is missing, config expressions (`!!js`) are deferred rather than failing early.
2. **`disabled: !!js` Mount Gate**: `disabled: !!js` is evaluated against the Loader context on every mount decision.
3. **Incremental Patch Indexing**: `applyEntryPatches` in `cordis-plugin-include` indexes inserted entries incrementally. This enables a patch later in the same patch list to modify or configure rows inserted by an earlier patch.
4. **Reentrant Fiber Teardown Hardening**: `fiber.ts` rejects effect creation during `UNLOADING`, and child fibers register parent-owned disposers before `internal/plugin` publication.
5. **Debounced Durable Config Writes**: Windows filesystem locks during teardown are handled with retry backoffs to prevent `EBUSY`/`EPERM` unhandled rejections.

### 10.3 Node.js Engine Matrix Caveat
- `package.json` requires Node `^22.19.0 || >=24.0.0`.
- **Node 24 internal loader breaking change**: As documented in `vendor/README.md` entry 19, Node 24.12.0 introduced the v2 internal loader API (`getOrCreateModuleJob`), whereas Node 24.0 through 24.11.1 had v1 (`getModuleJobForImport`). The vendored loader contains specific runtime detection to prevent reversed arguments on `resolveSync`. Authors testing on Node 24 should use 24.12.0 or higher.

### 10.4 pnpm 10+ and 11+ Package Manager Behavior
- The workspace uses `pnpm@11.7.0`.
- Profile directories generated by `initProfile` explicitly configure `pnpm-workspace.yaml` with:
  ```yaml
  packages:
    - .
  nodeLinker: hoisted
  autoInstallPeers: false
  ```
- **Git-hosted dependency security block**: In pnpm ≥10, git dependencies with build scripts (`prepare`) are blocked from executing by default. Users installing git-hosted plugins via `dsh plugin add github:user/repo` must explicitly add the package to `allowBuilds` in `$DSH_HOME/profiles/<name>/pnpm-workspace.yaml`.

### 10.5 DeepSeek LLM API Extension Inventory
- When official DeepSeek LLM adapters are loaded, `@deepseek-ai/dsh-plugin-package-inventory-deepseek` (`packages/llm/plugin-package-inventory-deepseek/src/index.ts`) scans active Loader entries.
- It extracts the `name` and `version` of each active package and transmits them in LLM API request headers (`dsh_plugin_packages`). External packages must declare valid, non-empty `name` and `version` fields in their `package.json` to prevent inventory lookup failures.

### 10.6 Subprocess Execution in Tests
- Test suites must comply with `docs/testing.md`: Subprocesses running shipping Cordis profiles or configs must execute built artifacts from `lib/` using plain `node`, never `--import tsx`.
- In-source tests resolve imports to `src/` via tsconfig paths; stale `lib/` files must not be loaded during unit tests.

---

## 11. Verified Facts vs. Recommendations Matrix

| Domain | Verified Architectural Fact (with Repository Evidence) | Engineering Recommendation for Plugin Authors |
| :--- | :--- | :--- |
| **Plugin Architecture** | DeepSeek Harness has no privileged core; every subsystem is a Cordis plugin (`docs/architecture.md` lines 11-14). | Encapsulate features into focused plugins rather than modifying existing service logic. |
| **Dependency Injection** | `inject` delays fiber activation until all listed services exist (`vendor/cordis/src/registry.ts` line 106). Missing dependencies leave the fiber in `PENDING` without throwing (`vendor/cordis/src/fiber.ts` line 578). | Use `inject` for hard requirements; use `ctx.get('service')` with null-checks for optional capabilities. |
| **Event Handling** | Waterfall event listeners receive `next` and wrap downstream processing (`docs/cordis-primer.md` lines 29-36). | Always call `next()` in waterfall listeners unless intentionally short-circuiting/vetoing the action. |
| **Lifecycle & Teardown** | All registrations (`ctx.on`, `ctx.tools.register`, etc.) attach disposers to the owning fiber (`vendor/cordis/src/fiber.ts` lines 74-94). | For non-Cordis resources (sockets, timers, watchers), wrap them in `ctx.effect()` and return explicit cleanup logic. |
| **Tool Authoring** | `defineTool` validates inputs against schemas before `execute()` runs; `execute()` must return a canonical JSON value matching `output.schema` (`docs/cookbook/adding-a-tool.md` lines 40-50). | Do not return formatted text blocks from `execute()`; place human-readable presentation in `output.render`. |
| **UI Presentation** | Tool cards are pure render intents evaluated on both live runs and log replay (`docs/cookbook/adding-a-tool.md` lines 67-91). Web React components never access `ctx` (`packages/client/AGENTS.md` lines 38-41). | Implement pure `presentCall`/`presentResult` functions. For Web UI, pass data exclusively via the four props shares. |
| **Configuration** | Schemas are validated via `@deepseek-ai/schemastery` at load; invalid configs fail loudly (`vendor/cordis/src/fiber.ts` lines 50-62). | Export both TypeScript `interface Config` and `const Config: Schema<Config>` under the exact same name. |
| **Patch Semantics** | An ID-targeted patch replaces the entire target row `config` without deep-merging (`packages/boot/app-boot/README.md` line 169). | When patching an existing row in `cordis.patch.yml`, restate all configuration fields that must be preserved. |
| **Distribution** | Bundles declare `dsh.bundle.patch` in `package.json`; `dsh plugin add` automatically adds bundles to the profile manifest (`apps/cli/src/plugin.ts` lines 36-91). | Distribute prebuilt code via npm or tarball rather than raw git checkouts to avoid pnpm 10 `allowBuilds` friction. |
| **Testing** | CI gates enforce per-file 100% coverage on `packages/*/*/src` (`docs/testing.md` lines 9-10). Disposing a fiber must unregister all its contributions (`docs/testing.md` line 9). | Always include an HMR safety unit test asserting complete disposal of tools, listeners, and prompt sections. |

---

## 12. Conclusion

Plugin development in DeepSeek Harness is a first-class, principled discipline. By building on Cordis micro-kernel foundations, DeepSeek Harness provides a modular, reproducible, and verifiable architecture where capabilities can be dynamically composed, safely replaced, and completely unmounted without side effects or residue.

Developers authoring plugins for DeepSeek Harness should:
1. Treat every contribution as a **reversible effect**.
2. Declare strict schemas for runtime configuration.
3. Decouple capability seams into distinct Definition, Provider, and Consumer roles.
4. Structure packages as bundles with declarative `cordis.patch.yml` manifests.
5. Guarantee hot-reload safety with rigorous disposal tests.
