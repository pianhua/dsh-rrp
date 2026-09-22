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

import { execSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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

/** Find DSH entry script directly without batch wrappers. */
function resolveDshBin() {
  // 1. Try global npm root
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim()
    const candidate = join(globalRoot, '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    if (existsSync(candidate)) return candidate
  } catch {
    // ignore
  }

  // 2. Try AppData fallback on Windows
  if (process.platform === 'win32' && process.env.APPDATA) {
    const candidate = join(
      process.env.APPDATA,
      'npm',
      'node_modules',
      '@deepseek-ai',
      'dsh',
      'lib',
      'bin.js',
    )
    if (existsSync(candidate)) return candidate
  }

  // 3. Fallback to CLI command name
  return null
}

/** Find PID listening on given port (Windows + POSIX fallback). */
function findPidOnPort(port) {
  if (process.platform === 'win32') {
    try {
      const output = execSync(`netstat -ano`, { encoding: 'utf8' })
      for (const line of output.split('\n')) {
        const match = line
          .trim()
          .match(
            new RegExp(
              `TCP\\s+(?:127\\.0\\.0\\.1|0\\.0\\.0\\.0):${port}\\s+.*LISTENING\\s+(\\d+)`,
              'i',
            ),
          )
        if (match) {
          return parseInt(match[1], 10)
        }
      }
    } catch {
      // ignore
    }
  } else {
    try {
      const output = execSync(`lsof -t -i:${port}`, { encoding: 'utf8' }).trim()
      if (output) return parseInt(output.split('\n')[0], 10)
    } catch {
      // ignore
    }
  }
  return null
}

/** Terminate a PID tree. */
function killPid(pid) {
  if (!pid) return
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /T /PID ${pid} 2>nul || exit 0`, { shell: 'cmd.exe' })
    } else {
      process.kill(pid, 'SIGKILL')
    }
  } catch {
    // Process might already be dead
  }
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

async function stopHost(port) {
  console.log(`[host-runner] Stopping DSH host on port ${port}...`)

  // 1. Check saved state
  if (existsSync(stateFile)) {
    try {
      const state = JSON.parse(readFileSync(stateFile, 'utf8'))
      if (state.pid) {
        killPid(state.pid)
      }
    } catch {
      // ignore
    }
    try {
      rmSync(stateFile, { force: true })
    } catch {
      /* ignore */
    }
  }

  // 2. Double check port listener
  const occupyingPid = findPidOnPort(port)
  if (occupyingPid) {
    console.log(`[host-runner] Killing remaining process ${occupyingPid} on port ${port}...`)
    killPid(occupyingPid)
  }

  // Wait for port release
  for (let i = 0; i < 20; i++) {
    if (!findPidOnPort(port)) break
    await new Promise((r) => setTimeout(r, 200))
  }

  if (findPidOnPort(port)) {
    console.error(`[host-runner] Failed to release port ${port}!`)
    process.exit(1)
  }

  console.log(`[host-runner] Host on port ${port} stopped cleanly.`)
}

async function startHost(port, profile) {
  // 1. Ensure any old process on this port is stopped
  const existingPid = findPidOnPort(port)
  if (existingPid) {
    console.log(
      `[host-runner] Port ${port} currently occupied by PID ${existingPid}. Cleaning up...`,
    )
    await stopHost(port)
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

  // 3. Poll log file for launch token URL
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

async function statusHost(port) {
  const pid = findPidOnPort(port)
  let state = null
  if (existsSync(stateFile)) {
    try {
      state = JSON.parse(readFileSync(stateFile, 'utf8'))
    } catch {
      // ignore
    }
  }

  if (!pid) {
    console.log(`[host-runner] Port ${port}: IDLE (no process listening)`)
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

  console.log(`[host-runner] Port ${port}: ACTIVE (PID: ${pid})`)
  if (state?.tokenUrl) {
    console.log(`  * Token URL : ${state.tokenUrl}`)
    console.log(`  * Started At: ${state.startedAt}`)
    console.log(`  * Cookie    : ${state.cookie || '(none recorded)'}`)
  } else {
    console.log(
      `  * Note: PID ${pid} is running without runner metadata. Run 'node scripts/host-runner.mjs start' to restart cleanly with token capture.`,
    )
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
      await stopHost(port)
      break
    case 'status':
      await statusHost(port)
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
