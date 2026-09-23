import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
const expectedNode = readFileSync(join(repoRoot, '.node-version'), 'utf8').trim()
const packageManagerMatch = packageJson.packageManager?.match(/^pnpm@(.+)$/)
const expectedPnpm = packageManagerMatch?.[1]
const strictPnpm = process.argv.includes('--install') || process.env.CI === 'true'

const errors = []
const notes = []
const actualNode = process.versions.node
const userAgent = process.env.npm_config_user_agent ?? ''
const actualPnpm = userAgent.match(/(?:^|\s)pnpm\/([^\s]+)/)?.[1] ?? null

if (!expectedNode) {
  errors.push('缺少 .node-version，无法确定项目 Node.js 基线。')
} else if (actualNode !== expectedNode) {
  errors.push(`Node.js 版本不匹配：当前 ${actualNode}，要求 ${expectedNode}。`)
}

if (!expectedPnpm) {
  errors.push('package.json 的 packageManager 缺少 pnpm 版本。')
} else if (actualPnpm && actualPnpm !== expectedPnpm) {
  errors.push(`pnpm 版本不匹配：当前 ${actualPnpm}，要求 ${expectedPnpm}。`)
} else if (!actualPnpm && strictPnpm) {
  errors.push('没有检测到 pnpm；请通过 pnpm 运行命令，不要用 npm/yarn 代替。')
} else if (!actualPnpm) {
  notes.push('未检测到 pnpm 版本；通过 `pnpm run check:environment` 可执行完整检查。')
}

if (errors.length > 0) {
  console.error('[dsh-rrp] environment check failed')
  for (const error of errors) console.error(`  - ${error}`)
  console.error('修复方向：')
  console.error(
    `  1. 让版本管理器使用 Node.js ${expectedNode}（Windows 可用 nvm/fnm，Linux 可用 nvm/fnm/mise）。`,
  )
  console.error(
    `  2. 依次执行 corepack enable，再执行 corepack prepare pnpm@${expectedPnpm} --activate。`,
  )
  process.exitCode = 1
} else {
  console.log(
    `[dsh-rrp] environment ok: Node.js ${actualNode}, pnpm ${actualPnpm ?? `${expectedPnpm} (not detected)`}`,
  )
  for (const note of notes) console.log(`  - ${note}`)
}
