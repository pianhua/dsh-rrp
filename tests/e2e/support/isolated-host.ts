/**
 * tests/e2e/support/isolated-host.ts — Boot a throwaway DSH host that touches nothing else.
 *
 * Why this exists: the manual dev profile (`rp-dev`) is machine-local state, and it has already
 * evaporated once on this machine — `~/.dsh/profiles/` kept only `desktop`, so the acceptance run
 * recorded in the worklog on 2026-10-13 could no longer be reproduced. A harness that rebuilds its
 * own profile from source is the only boot path that cannot rot that way.
 *
 * Isolation guarantees, each asserted by a spec:
 * - `DSH_HOME`/`DSH_CWD` point at a temp directory, so no dev session, storage or profile is read;
 * - `--port 0` lets the OS pick, so port 3099 is never contended;
 * - the child gets an environment allow-list: provider credentials and proxies are deliberately NOT
 *   inherited, which is what makes "the stub model served this" a proven fact, not an assumption.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveDshScope } from '../../../scripts/host-runtime.mjs'

/** Bundles every RP session needs; the plugin row is appended by the patch file. */
const BASE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']

/**
 * Variables a Node process needs on Windows and POSIX alike. Anything credential-shaped is
 * intentionally absent — see the header note.
 */
const ENV_ALLOW_LIST = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'TMP',
  'TMPDIR',
  'TEMP',
  'LANG',
  'LC_ALL',
  'SYSTEMROOT',
  'SYSTEMDRIVE',
  'COMSPEC',
  'PATHEXT',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMDATA',
]

export interface IsolatedHostOptions {
  /** Absolute repository root; the profile links this package as `dsh-rrp`. */
  repoRoot: string
  /** Profile directory name under `<DSH_HOME>/profiles/`. Default `e2e`. */
  profileName?: string
  /**
   * Reuse an existing directory as `DSH_HOME` instead of minting a fresh one — the restart
   * half of "close the host, boot a new one, lose nothing". The profile inside is recomposed
   * (links replaced, manifests rewritten); everything else under the root is left alone.
   */
  root?: string
  /** Absolute path to a stub-model Cordis plugin, when the run has one. */
  stubPlugin?: string
  /** Provider id the stub registers; required together with `stubPlugin`. */
  stubProvider?: string
  /** Absolute path to a headless driver Cordis plugin (test scaffold routes). */
  driverPlugin?: string
  /** Absolute path to the played card's `state.json`, handed to the stub as its script base. */
  cardStateFile?: string
  /** Absolute JSONL path where the stub records every `stream()` entry. */
  auditFile?: string
  /** How long to wait for the startup URL. */
  bootTimeoutMs?: number
}

export interface IsolatedHostCloseOptions {
  /** Keep the `DSH_HOME` directory on disk (restart phase reuses it); default destroys it. */
  preserveRoot?: boolean
}

export interface IsolatedHost {
  /** Temp directory used as `DSH_HOME`; removed by `close()` unless preserved. */
  root: string
  /** Composed profile directory inside `root`. */
  profileDir: string
  /** `http://127.0.0.1:<port>` the host reported. */
  baseUrl: string
  /** OS-assigned port, never the dev runner's 3099. */
  port: number
  /** Captured stdout+stderr so far. */
  log(): string
  /** Terminate the child and destroy `root` (unless `preserveRoot`). Idempotent. */
  close(options?: IsolatedHostCloseOptions): Promise<void>
}

function pause(ms: number): Promise<void> {
  return new Promise((resolvePause) => {
    setTimeout(resolvePause, ms)
  })
}

/**
 * Link one directory into the isolated profile without following it on teardown.
 *
 * Windows uses a junction because a directory symlink needs developer mode while a junction does
 * not; POSIX uses a plain symlink. An existing link is replaced so recomposing a reused root
 * (the restart phase) stays idempotent.
 */
function linkDirectory(target: string, linkPath: string): void {
  rmSync(linkPath, { recursive: true, force: true })
  symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
}

interface ComposeInput {
  repoRoot: string
  root: string
  profileName: string
  stubPlugin?: string
  stubProvider?: string
  driverPlugin?: string
}

/** Compose the profile tree and return the runtime scope it must resolve against. */
function composeProfile(input: ComposeInput): { profileDir: string; scope: string } {
  const { repoRoot, root, profileName, stubPlugin, stubProvider, driverPlugin } = input
  const scope = resolveDshScope(repoRoot)
  if (scope === null) {
    throw new Error(
      '隔离宿主启动失败：找不到 @deepseek-ai/dsh。先按 docs/reference/HOST_BASELINE.md 安装基线宿主' +
        '（npm install --prefix ~/.dsh-rrp/host @deepseek-ai/dsh@<baseline>）。',
    )
  }
  const profileDir = join(root, 'profiles', profileName)
  const profileModules = join(profileDir, 'node_modules')
  mkdirSync(profileModules, { recursive: true })

  // The profile must resolve against the same runtime scope the host binary came from, or the E2E
  // would silently boot a different set of packages than the one we develop against.
  linkDirectory(scope, join(profileModules, '@deepseek-ai'))
  linkDirectory(repoRoot, join(profileModules, 'dsh-rrp'))

  const stubBundle = `dsh-rrp-${profileName}-model-stub`
  const hasStub = stubPlugin !== undefined && stubProvider !== undefined
  const driverBundle = `dsh-rrp-${profileName}-driver`
  const bundles = [
    ...BASE_BUNDLES,
    'dsh-rrp',
    ...(hasStub ? [stubBundle] : []),
    ...(driverPlugin === undefined ? [] : [driverBundle]),
  ]
  writeFileSync(
    join(profileDir, 'package.json'),
    JSON.stringify({
      name: `dsh-rrp-${profileName}`,
      private: true,
      dsh: { profile: { bundles } },
    }),
  )

  // The default-model row precedes the plugin rows, so the composition resolves the stub provider
  // before any agent assembles a request.
  const patch: string[] = []
  if (hasStub) {
    patch.push(
      `- id: agent-default-model\n  config:\n    provider: ${stubProvider}\n    model: fixed\n`,
      `- insert:\n    - id: ${stubBundle}\n      name: ${JSON.stringify(stubPlugin)}\n`,
    )
  }
  if (driverPlugin !== undefined) {
    patch.push(
      `- insert:\n    - id: ${driverBundle}\n      name: ${JSON.stringify(driverPlugin)}\n`,
    )
  }
  // Pin the session log to plaintext JSONL: the playthrough reads $DSH_HOME/sessions itself
  // (independent disk fold). Persistence semantics are encoding-independent, and the override
  // names the same root the default config resolves to.
  patch.push(
    '- id: session-persistence-jsonl\n  config:\n' +
      `    root: ${JSON.stringify(join(root, 'sessions'))}\n` +
      '    compression: none\n',
  )
  patch.push("- insert:\n    - id: dsh-rrp\n      name: 'dsh-rrp'\n")
  writeFileSync(join(profileDir, 'cordis.patch.yml'), patch.join(''))
  return { profileDir, scope }
}

/** Boot an isolated host and wait until it reports its URL. */
export async function startIsolatedHost(options: IsolatedHostOptions): Promise<IsolatedHost> {
  const {
    repoRoot,
    profileName = 'e2e',
    root: reuseRoot,
    stubPlugin,
    stubProvider,
    driverPlugin,
    cardStateFile,
    auditFile,
    bootTimeoutMs = 180_000,
  } = options
  const root = reuseRoot ?? (await mkdtemp(join(tmpdir(), 'dsh-rrp-e2e-')))
  let cleaned = false
  const cleanup = (): void => {
    if (cleaned) return
    cleaned = true
    rmSync(root, { recursive: true, force: true, maxRetries: 5 })
  }

  let child: ChildProcess | undefined
  try {
    const { profileDir, scope } = composeProfile({
      repoRoot,
      root,
      profileName,
      stubPlugin,
      stubProvider,
      driverPlugin,
    })
    const bin = join(scope, 'dsh', 'lib', 'bin.js')
    const env = Object.fromEntries(
      ENV_ALLOW_LIST.filter((key) => process.env[key]).map((key) => [
        key,
        process.env[key] as string,
      ]),
    )
    // Deliberately narrow test-only passthrough: the negative control reaches the stub as
    // DSH_RRP_E2E_WRONG_GOLD in the HOST process, not just in the vitest process.
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('DSH_RRP_E2E_') && value !== undefined) env[key] = value
    }
    child = spawn(
      process.execPath,
      [bin, '--profile', profileName, '--host', '127.0.0.1', '--port', '0', '--no-open'],
      {
        cwd: profileDir,
        env: {
          ...env,
          DSH_HOME: root,
          DSH_CWD: root,
          // The stub must subclass the host's own LlmAdapter class; this repository does not depend
          // on dsh-llm, so the path is handed over rather than imported.
          DSH_RRP_E2E_LLM_MODULE: join(scope, 'dsh-llm', 'lib', 'index.js'),
          ...(auditFile === undefined ? {} : { DSH_RRP_E2E_AUDIT: auditFile }),
          ...(cardStateFile === undefined ? {} : { DSH_RRP_E2E_CARD_STATE: cardStateFile }),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )

    let log = ''
    let spawnError: Error | undefined
    child.on('error', (error) => {
      spawnError = error
    })
    child.stdout?.on('data', (chunk) => {
      log += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      log += String(chunk)
    })

    const deadline = Date.now() + bootTimeoutMs
    let url: string | undefined
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError
      url = log.match(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+\S*/)?.[0]
      if (url) break
      if (child.exitCode !== null) {
        throw new Error(`隔离宿主提前退出（code ${child.exitCode}）：\n${log.slice(-4000)}`)
      }
      await pause(100)
    }
    if (!url) {
      throw new Error(`隔离宿主启动超时（${bootTimeoutMs}ms）：\n${log.slice(-4000)}`)
    }

    const parsed = new URL(url)
    const running = child
    return {
      root,
      profileDir,
      baseUrl: `${parsed.protocol}//${parsed.host}`,
      port: Number(parsed.port),
      log: () => log,
      async close(options?: IsolatedHostCloseOptions) {
        if (running.exitCode === null) {
          running.kill('SIGTERM')
          const exited = new Promise<void>((resolveExit) => {
            running.once('exit', () => resolveExit())
          })
          const timedOut = await Promise.race([
            exited.then(() => false),
            pause(10_000).then(() => true),
          ])
          if (timedOut) {
            running.kill('SIGKILL')
            await Promise.race([exited, pause(5_000)])
          }
        }
        if (options?.preserveRoot !== true) cleanup()
      },
    }
  } catch (error) {
    if (child && child.exitCode === null) child.kill('SIGKILL')
    cleanup()
    throw error
  }
}
