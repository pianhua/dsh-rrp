/**
 * scripts/host-runner.mjs — Reliable DSH Host Lifecycle & Browser Ready Runner
 *
 * Solves the recurring pain points of agents testing dsh-rrp:
 * 1. Port conflict handling: automatically detects and terminates zombie processes on 3099.
 * 2. Proxy pollution removal: completely strips ALL_PROXY/all_proxy/HTTP_PROXY to prevent
 *    silent LLM stream empty responses caused by SOCKS proxies (R5 lesson).
 * 3. Direct Node execution (no .cmd wrapper): resolves @deepseek-ai/dsh/lib/bin.js directly
 *    and launches with node.exe, avoiding Windows cmd.exe grandchild piping issues.
 * 4. Auth token & cookie capture: parses stdout for launch token, executes health check,
 *    captures the session cookie, and records the full authenticated URL.
 * 5. Reusable state manifest: saves .scratch/dsh-host.json for downstream browser tools.
 *
 * Usage:
 *   node scripts/host-runner.mjs start [--port 3099] [--profile rp-dev]
 *   node scripts/host-runner.mjs stop [--port 3099]
 *   node scripts/host-runner.mjs status [--port 3099]
 */

import { execFileSync, execSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  decidePortOwnership,
  matchesRunnerArguments,
  parsePosixCommandLine,
  parseWindowsCommandLine,
} from './host-runner-ownership.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const scratchDir = join(repoRoot, '.scratch')
const logsDir = join(scratchDir, 'logs')
const stateFile = join(scratchDir, 'dsh-host.json')
const logFile = join(logsDir, 'dsh-host.log')

const DEFAULT_PORT = 3099
const DEFAULT_PROFILE = 'rp-dev'

function parseArgs() {
  const args = process.argv.slice(2)
  const action = args[0] || 'status'
  let port = DEFAULT_PORT
  let profile = DEFAULT_PROFILE

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1], 10)
      i++
    } else if (args[i] === '--profile' && args[i + 1]) {
      profile = args[i + 1]
      i++
    }
  }

  return { action, port, profile }
}

/** Locate @deepseek-ai/dsh lib/bin.js directly to bypass cmd wrapper. */
function resolveDshBin() {
  // The dsh package ships no "main"/"exports" entry (bin-only ESM package), so
  // require.resolve of the bare specifier fails even when installed. Resolve the
  // bin subpath instead, checking candidates in order:
  //   1. the repo's own node_modules (if a local dev install exists),
  //   2. the dedicated pinned host at ~/.dsh-rrp/host (self-consistent npm tree
  //      matching HOST_BASELINE.md; install with:
  //      npm install --prefix ~/.dsh-rrp/host @deepseek-ai/dsh@<baseline>),
  //   3. the global npm install (any version — last resort).
  const candidates = [join(repoRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')]
  try {
    candidates.push(
      join(
        process.env.USERPROFILE ?? process.env.HOME ?? '',
        '.dsh-rrp',
        'host',
        'node_modules',
        '@deepseek-ai',
        'dsh',
        'lib',
        'bin.js',
      ),
    )
  } catch {
    // ignore: no home directory to probe
  }
  try {
    const globalRoots = execSync('npm root -g', { encoding: 'utf8' }).trim()
    if (globalRoots) candidates.push(join(globalRoots, '@deepseek-ai', 'dsh', 'lib', 'bin.js'))
  } catch {
    // ignore: global lookup is best-effort
  }
  for (const binJs of candidates) {
    if (existsSync(binJs)) return binJs
  }
  return null
}

/**
 * Locate DSH runner processes whose command line carries the exact
 * `--profile <profile> --port <port>` pair, by scanning process command
 * lines instead of asking the OS which process owns the listening socket.
 *
 * Why not netstat/lsof: since DSH 0.2.x the web listener on Windows is
 * reported by netstat as PID 0 (unattributable), so port→PID mapping is
 * unreliable. The command line is the trustworthy identity: we only ever
 * stop a process whose argv matches exactly, and the ownership module
 * additionally re-checks PID + creation time against the recorded state.
 */
function findRunnerProcesses(port, profile) {
  const candidates = []
  if (process.platform === 'win32') {
    let rows
    try {
      const script =
        "Get-CimInstance Win32_Process -Filter \"Name='node.exe' AND CommandLine LIKE '%bin.js%'\" " +
        '| Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress'
      const raw = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        {
          encoding: 'utf8',
          windowsHide: true,
        },
      )
      rows = raw.trim() ? JSON.parse(raw) : []
      if (!Array.isArray(rows)) rows = [rows]
    } catch {
      return []
    }
    for (const row of rows) {
      const pid = Number(row.ProcessId)
      if (!isPositivePid(pid) || typeof row.CommandLine !== 'string') continue
      const argv = parseWindowsCommandLine(row.CommandLine)
      if (matchesRunnerArguments(argv, port, profile)) {
        const info = readProcessInfo(pid)
        if (info !== null) candidates.push(info)
      }
    }
    return candidates
  }

  try {
    const output = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' })
    for (const line of output.split('\n')) {
      if (!line.includes('bin.js')) continue
      const trimmed = line.trim()
      const space = trimmed.indexOf(' ')
      if (space < 0) continue
      const pid = parseInt(trimmed.slice(0, space), 10)
      if (!isPositivePid(pid)) continue
      const argv = parsePosixCommandLine(trimmed.slice(space + 1))
      if (!matchesRunnerArguments(argv, port, profile)) continue
      const info = readProcessInfo(pid)
      if (info !== null) candidates.push(info)
    }
  } catch {
    // ignore
  }
  return candidates
}

/** True when something answers HTTP on the port, whatever process it is. */
async function portAlive(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, { method: 'GET' })
    return res.status > 0
  } catch {
    return false
  }
}

function parseCreationDate(raw) {
  if (typeof raw !== 'string') return null
  const msMatch = /^\/Date\((\d+)\)\/$/.exec(raw)
  const date = msMatch ? new Date(Number(msMatch[1])) : new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function readProcessInfo(pid) {
  if (!isPositivePid(pid)) return null

  if (process.platform === 'win32') {
    try {
      const script =
        '$p = Get-CimInstance Win32_Process -Filter "ProcessId = ' +
        String(pid) +
        '"; if ($null -eq $p) { exit 2 }; $p | Select-Object ProcessId, @{Name="CreationDate";Expression={$_.CreationDate.ToString("o")}}, CommandLine | ConvertTo-Json -Compress'
      const raw = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        {
          encoding: 'utf8',
          windowsHide: true,
        },
      )
      const row = JSON.parse(raw)
      if (!row || typeof row.CommandLine !== 'string') return null
      const startedAt = parseCreationDate(row.CreationDate)
      if (!startedAt) return null
      return {
        pid: Number(row.ProcessId),
        startedAt,
        argv: parseWindowsCommandLine(row.CommandLine),
      }
    } catch {
      return null
    }
  }

  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const close = stat.lastIndexOf(')')
    if (close < 0) return null
    const fields = stat
      .slice(close + 2)
      .trim()
      .split(/\s+/)
    const startTicks = fields[19]
    const cmdline = readFileSync(`/proc/${pid}/cmdline`)
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
    if (!startTicks || cmdline.length === 0) return null
    const startTime = Number(startTicks)
    if (!Number.isFinite(startTime)) return null
    const bootTimeLine = readFileSync('/proc/stat', 'utf8')
      .split('\n')
      .find((line) => line.startsWith('btime '))
    const bootTime = Number(bootTimeLine?.split(/\s+/)[1])
    const ticksPerSecond = Number(execSync('getconf CLK_TCK', { encoding: 'utf8' }).trim())
    if (!Number.isFinite(bootTime) || !Number.isFinite(ticksPerSecond) || ticksPerSecond <= 0)
      return null
    return {
      pid,
      startedAt: new Date((bootTime + startTime / ticksPerSecond) * 1000).toISOString(),
      argv: cmdline,
    }
  } catch {
    return null
  }
}

function readState() {
  if (!existsSync(stateFile)) return null
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Classify the port: 'idle' (nothing there), 'owned' (a runner process whose
 * identity verifies against recorded state), or 'conflict' (something
 * responds that we cannot prove is ours — never kill those).
 */
async function portOwnership(port, profile) {
  const state = readState()
  const effectiveProfile = state?.profile ?? profile
  const candidates = findRunnerProcesses(port, effectiveProfile)
  const runnerPid = candidates.length > 0 ? candidates[0].pid : null
  const processInfo = runnerPid !== null ? candidates[0] : null
  // A runner process whose exact argv matches is safe to manage even when no
  // recorded state exists (e.g. an earlier crashed runner): the dedicated
  // dev port/profile makes a foreign exact-match process implausible. PID
  // reuse protection still applies whenever state was recorded.
  if (state === null && runnerPid !== null) {
    return { kind: 'owned', state: null, pid: runnerPid, unverified: true }
  }
  const decision = decidePortOwnership(state, processInfo, runnerPid, port)
  if (decision === 'idle') {
    if ((await portAlive(port)) && runnerPid === null) return { kind: 'conflict', state }
    return { kind: 'idle', state }
  }
  if (decision === 'owned') return { kind: 'owned', state, pid: state.pid }
  return { kind: 'conflict', state, listenerPid: runnerPid }
}

function killPid(pid) {
  if (!isPositivePid(pid)) return false
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', windowsHide: true })
    } else {
      process.kill(pid, 'SIGTERM')
    }
    return true
  } catch {
    return false
  }
}

function isPositivePid(pid) {
  return Number.isSafeInteger(pid) && pid > 0
}

/** Clean environment without proxy variables. */
function getCleanEnv() {
  const cleanEnv = { ...process.env }
  delete cleanEnv.ALL_PROXY
  delete cleanEnv.all_proxy
  delete cleanEnv.HTTP_PROXY
  delete cleanEnv.http_proxy
  delete cleanEnv.HTTPS_PROXY
  delete cleanEnv.https_proxy
  return cleanEnv
}

async function stopHost(port, profile) {
  console.log(`[host-runner] Stopping DSH host on port ${port}...`)
  const ownership = await portOwnership(port, profile)
  if (ownership.kind === 'idle') {
    if (ownership.state) rmSync(stateFile, { force: true })
    console.log(`[host-runner] Port ${port} is idle; stale runner state removed.`)
    return
  }
  if (ownership.kind === 'conflict') {
    console.error(
      `[host-runner] Refusing to stop on port ${port}: no verified runner process, but something may still be answering. Stop it manually if appropriate, then retry.`,
    )
    process.exitCode = 1
    return
  }

  console.log(`[host-runner] Stopping verified runner process ${ownership.pid}...`)
  const confirmed = await portOwnership(port, profile)
  if (confirmed.kind !== 'owned' || confirmed.pid !== ownership.pid) {
    console.error(`[host-runner] Process identity changed before stop; refusing to signal any PID.`)
    process.exitCode = 1
    return
  }
  if (!killPid(confirmed.pid)) {
    console.error(`[host-runner] Could not stop verified runner process ${confirmed.pid}.`)
    process.exitCode = 1
    return
  }

  for (let i = 0; i < 30; i++) {
    const gone = findRunnerProcesses(port, profile).length === 0 && !(await portAlive(port))
    if (gone) {
      rmSync(stateFile, { force: true })
      console.log(`[host-runner] Host on port ${port} stopped cleanly.`)
      return
    }
    await new Promise((r) => setTimeout(r, 200))
  }

  console.error(
    `[host-runner] Verified runner process did not release port ${port}; state retained.`,
  )
  process.exitCode = 1
}

async function startHost(port, profile) {
  const ownership = await portOwnership(port, profile)
  if (ownership.kind === 'owned') {
    console.log(`[host-runner] Found verified runner process ${ownership.pid}; stopping it first.`)
    await stopHost(port)
    if (process.exitCode) return
  } else if (ownership.kind === 'conflict') {
    console.error(
      `[host-runner] Port ${port} is occupied by PID ${ownership.listenerPid}, which is not verified as runner-owned. No process was stopped; choose another port or stop the service manually.`,
    )
    process.exitCode = 1
    return
  } else if (ownership.state) {
    rmSync(stateFile, { force: true })
  }

  mkdirSync(logsDir, { recursive: true })

  // 2. Prepare log file (truncate old log)
  writeFileSync(logFile, `=== dsh-rrp host session started at ${new Date().toISOString()} ===\n`)
  const outFd = openSync(logFile, 'a')

  console.log(`[host-runner] Launching dsh --profile ${profile} --port ${port} --no-open...`)
  console.log(`[host-runner] Proxy variables stripped to avoid LLM empty responses.`)

  const cleanEnv = getCleanEnv()
  const dshBin = resolveDshBin()

  let child
  if (dshBin) {
    console.log(`[host-runner] Direct node spawn: ${process.execPath} ${dshBin}`)
    child = spawn(
      process.execPath,
      [dshBin, '--profile', profile, '--port', String(port), '--no-open'],
      {
        detached: true,
        stdio: ['ignore', outFd, outFd],
        env: cleanEnv,
        cwd: repoRoot,
      },
    )
  } else {
    console.log(`[host-runner] Spawning dsh CLI executable`)
    const dshCmd = process.platform === 'win32' ? 'dsh.cmd' : 'dsh'
    child = spawn(dshCmd, ['--profile', profile, '--port', String(port), '--no-open'], {
      detached: true,
      stdio: ['ignore', outFd, outFd],
      env: cleanEnv,
      cwd: repoRoot,
      shell: true,
    })
  }

  child.unref()
  const hostPid = child.pid
  console.log(`[host-runner] Background process spawned with PID ${hostPid}. Waiting for boot...`)

  // 3. Poll for a runner process with the expected identity.
  let ownedProcess = null
  for (let i = 0; i < 75; i++) {
    const candidates = findRunnerProcesses(port, profile)
    if (candidates.length > 0) {
      ownedProcess = candidates[0]
      break
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  if (ownedProcess === null) {
    console.error(
      `[host-runner] Could not verify a DSH runner process for --profile ${profile} --port ${port}; leaving any listener untouched.`,
    )
    process.exitCode = 1
    return
  }

  // 4. Poll log file for launch token URL
  const tokenRegex = /dsh web:\s+(https?:\/\/127\.0\.0\.1:\d+\/\?token=([A-Za-z0-9_-]+))/
  let tokenUrl = null
  let token = null
  const startTime = Date.now()
  const timeoutMs = 15000

  while (Date.now() - startTime < timeoutMs) {
    await new Promise((r) => setTimeout(r, 300))
    if (!existsSync(logFile)) continue

    const content = readFileSync(logFile, 'utf8')
    const match = content.match(tokenRegex)
    if (match) {
      tokenUrl = match[1]
      token = match[2]
      break
    }

    // Check if child exited prematurely
    if (child.exitCode !== null && child.exitCode !== undefined) {
      console.error(`[host-runner] dsh process exited unexpectedly with code ${child.exitCode}!`)
      console.error(content)
      process.exit(1)
    }
  }

  if (!tokenUrl) {
    console.error(`[host-runner] Timed out waiting for token URL in ${logFile}!`)
    const content = existsSync(logFile) ? readFileSync(logFile, 'utf8') : '(no log)'
    console.error(`Log contents:\n${content}`)
    process.exit(1)
  }

  console.log(`[host-runner] Token URL captured: ${tokenUrl}`)

  // 4. Authenticate and retrieve session cookie
  let sessionCookie = ''
  try {
    const authRes = await fetch(tokenUrl, { method: 'GET', redirect: 'manual' })
    const setCookie = authRes.headers.get('set-cookie')
    if (setCookie) {
      sessionCookie = setCookie.split(';')[0].trim()
      console.log(`[host-runner] Auth cookie minted: ${sessionCookie.slice(0, 30)}...`)
    }
  } catch (err) {
    console.warn(`[host-runner] Token exchange warning: ${err.message}`)
  }

  // 5. Health check plugin routes
  try {
    const cardRes = await fetch(`http://127.0.0.1:${port}/dsh-rrp/cards`)
    if (cardRes.ok) {
      const data = await cardRes.json()
      console.log(`[host-runner] Plugin routes OK! ${data.cards?.length ?? 0} cards available.`)
    } else {
      console.warn(`[host-runner] Plugin route returned status ${cardRes.status}`)
    }
  } catch (err) {
    console.warn(`[host-runner] Plugin route health check failed: ${err.message}`)
  }

  // 6. Record state
  const state = {
    pid: hostPid,
    port,
    profile,
    tokenUrl,
    token,
    cookie: sessionCookie,
    logFile,
    processStartedAt: ownedProcess.startedAt,
    startedAt: new Date().toISOString(),
    status: 'ready',
  }
  writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n')

  console.log(`\n======================================================`)
  console.log(`[host-runner] DSH Host is READY for Browser Testing!`)
  console.log(`  * Authenticated Browser URL : ${tokenUrl}`)
  console.log(`  * Direct Host Origin        : http://127.0.0.1:${port}/`)
  console.log(`  * Session Cookie Header     : ${sessionCookie || '(use tokenUrl)'}`)
  console.log(`  * Process PID               : ${hostPid}`)
  console.log(`  * Logs Path                 : ${logFile}`)
  console.log(`  * State Metadata            : ${stateFile}`)
  console.log(`======================================================\n`)
}

async function statusHost(port, profile) {
  const ownership = await portOwnership(port, profile)
  const state = readState()

  if (ownership.kind === 'idle') {
    console.log(`[host-runner] Port ${port}: IDLE (no verified runner process)`)
    if (state) {
      console.log(`[host-runner] Cleaning stale state file...`)
      try {
        rmSync(stateFile, { force: true })
      } catch {
        /* ignore */
      }
    }
    return
  }

  if (ownership.kind === 'conflict') {
    console.log(`[host-runner] Port ${port}: CONFLICT (no verified runner process)`)
    console.log(
      `  * Note: something may still answer on this port without verified runner metadata. Stop it manually if appropriate.`,
    )
  } else {
    console.log(
      `[host-runner] Port ${port}: ACTIVE (PID: ${ownership.pid}, verified runner process)`,
    )
    if (state?.tokenUrl) {
      console.log(`  * Token URL : ${state.tokenUrl}`)
      console.log(`  * Started At: ${state.startedAt}`)
      console.log(`  * Cookie    : ${state.cookie || '(none recorded)'}`)
    }
  }

  // Test cards route
  try {
    const res = await fetch(`http://127.0.0.1:${port}/dsh-rrp/cards`)
    console.log(`  * /dsh-rrp/cards health check: ${res.status} ${res.statusText}`)
  } catch (err) {
    console.log(`  * /dsh-rrp/cards health check: FAILED (${err.message})`)
  }
}

async function main() {
  const { action, port, profile } = parseArgs()

  switch (action) {
    case 'start':
      await startHost(port, profile)
      break
    case 'stop':
      await stopHost(port, profile)
      break
    case 'status':
      await statusHost(port, profile)
      break
    default:
      console.log(
        `Usage: node scripts/host-runner.mjs [start|stop|status] [--port 3099] [--profile rp-dev]`,
      )
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(`[host-runner] Fatal error:`, err)
  process.exit(1)
})
