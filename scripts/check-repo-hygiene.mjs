import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 仓库卫生门禁：把「工程纪律」从叙述变成机器强制。
// 每一项都对应一条已经付出过代价的真实教训，不是预防性设计。
//
//   1. 根目录白名单      —— dsh-rrp-test-report/ 曾在根目录堆到 81 个文件
//   2. 文档体积上限      —— worklog.md 曾长到 74KB 单文件
//   3. ADR 结构完整性    —— 编号连续 + 每篇必须有状态栏
//   4. 验收报告命名      —— 曾同时存在 TEST_REPORT_R2…R7 六轮平行文件
//   5. 站点页面与导航一致 —— srcExclude 漏配会产生无人可达的 orphan page
//   6. 本地相对链接有效  —— 文档迁移后最容易留下死链
//
// 豁免：docs/reference/HOST_SEAMS.md 与 HOST_BASELINE.md 是宿主勘察证据，
// CARDS.md 是卡包规范——它们本就以篇幅换完整性，不适用体积上限。

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const errors = []

const fail = (message, ...hints) => errors.push({ message, hints })

const rel = (absolutePath) => relative(repoRoot, absolutePath).replace(/\\/g, '/')
const kb = (bytes) => `${(bytes / 1024).toFixed(1)}KB`

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.worktrees',
  '.agents',
  '.yanagent',
  '.scratch',
  'lib',
  'coverage',
  'dist',
])

/** 递归遍历，跳过依赖、产物与本地工作区目录。 */
function walk(absoluteDir, skip = SKIP_DIRS) {
  const found = []
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue
    const full = join(absoluteDir, entry.name)
    if (entry.isDirectory()) found.push(...walk(full, skip))
    else if (entry.isFile()) found.push(full)
  }
  return found
}

// ---------------------------------------------------------------- 1. 根目录白名单

const ALLOWED_ROOT_ENTRIES = new Set([
  // 目录
  'assets',
  'cards',
  'docs',
  'lib', // 构建产物，但 package.json 的 main/types 指向它，是固定入口
  'presets',
  'scripts',
  'src',
  'tests',
  // 标准仓库组成
  '.git',
  'node_modules',
  // 本地开发工作区（由 .gitignore 排除）
  '.scratch',
  '.worktrees',
  '.agents',
  '.yanagent',
  // 文件
  'AGENTS.md',
  'CONTEXT.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'cordis.patch.yml',
  'eslint.config.js',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'skills-lock.json',
  'tsconfig.build.json',
  'tsconfig.json',
  'tsdown.config.ts',
  'vitest.config.ts',
  // 配置文件
  '.git-blame-ignore-revs',
  '.gitattributes',
  '.gitignore',
  '.github',
  '.node-version',
  '.prettierignore',
  '.prettierrc.json',
])

for (const entry of readdirSync(repoRoot, { withFileTypes: true })) {
  if (!ALLOWED_ROOT_ENTRIES.has(entry.name)) {
    fail(
      `根目录出现未登记条目：${entry.name}`,
      '过程产物不要落在根目录。',
      '确实需要长期存在时，把它放进 docs/ 下的合适分类并在此登记。',
    )
  }
}

// docs/ 一级目录按「成熟度 / 面向谁」分类，新增分类必须显式登记——
// 否则 docs/qgraphflow/ 这类 872KB 的外部工具产物会重新长进来。
const ALLOWED_DOCS_ENTRIES = new Set([
  '.vitepress', // 站点配置与构建产物
  'adr', // 决策记录：一条决策一篇
  'agents', // 人与 Agent 的协作契约
  'authoring', // 做卡教程（面向卡作者）
  'dev', // 开发者文档
  'guide', // 玩家手册
  'plans', // 进行中的计划
  'reference', // 参考资料与真机验收档案
])

for (const entry of readdirSync(join(repoRoot, 'docs'), { withFileTypes: true })) {
  if (entry.isDirectory() && !ALLOWED_DOCS_ENTRIES.has(entry.name)) {
    fail(
      `docs/ 出现未登记的分类：${entry.name}/`,
      '先判断它属于哪个既有分类；确实是新维度时，在此登记并写明该目录的成熟度定位。',
    )
  }
}

// ---------------------------------------------------------------- 2. 文档体积上限

const SIZE_LIMITS = [
  { file: 'docs/dev/worklog.md', max: 24 * 1024, why: '跨月内容按月切到 docs/dev/worklog/' },
  { file: 'CONTEXT.md', max: 24 * 1024, why: '一个概念一节；过长说明该拆主题' },
  { file: 'AGENTS.md', max: 8 * 1024, why: '只写从代码推不出来的纪律，其余指向真源' },
]

for (const { file, max, why } of SIZE_LIMITS) {
  const full = join(repoRoot, file)
  if (!existsSync(full)) continue
  const size = statSync(full).size
  if (size > max) {
    fail(`${file} 体积 ${kb(size)}，超过上限 ${kb(max)}`, why)
  }
}

const adrDir = join(repoRoot, 'docs/adr')
if (existsSync(adrDir)) {
  for (const file of read(adrDir).filter(
    (f) => extname(f) === '.md' && f !== join(adrDir, 'README.md'),
  )) {
    const size = statSync(file).size
    if (size > 16 * 1024) {
      fail(
        `${rel(file)} 体积 ${kb(size)}，超过单篇上限 16KB`,
        '一篇 ADR 只记一条决策；混进来的内容应拆成独立决策。',
      )
    }
  }
}

function read(dir) {
  return existsSync(dir) ? walk(dir) : []
}

// ---------------------------------------------------------------- 3. ADR 结构完整性

const adrFiles = read(adrDir)
  .filter((f) => extname(f) === '.md')
  .map((f) => ({ full: f, base: f.slice(adrDir.length + 1) }))
  .sort((a, b) => a.base.localeCompare(b.base))

const numbered = adrFiles.filter((f) => /^\d{4}-/.test(f.base))

if (numbered.length === 0) {
  fail('docs/adr/ 下没有编号 ADR', '决策记录应一条决策一篇，文件名以四位编号开头。')
}

numbered.forEach(({ full, base }, index) => {
  const expected = String(index + 1).padStart(4, '0')
  const actual = base.slice(0, 4)
  if (actual !== expected) {
    fail(
      `${base} 编号应为 ${expected}`,
      'ADR 编号从 0001 连续，不留空号——被取代的决策也保留原编号。',
    )
  }
  if (!/^>\s*状态：\S/m.test(readFileSync(full, 'utf8'))) {
    fail(
      `${base} 缺少状态栏`,
      '每篇 ADR 首部必须写明 `> 状态：`，取值为接受/暂缓/部分取代/已实现/已废弃。',
    )
  }
})

if (adrFiles.length > 0 && !adrFiles.some((f) => f.base === 'README.md')) {
  fail('docs/adr/README.md 缺失', '需要索引表与关键脉络，让后来者知道该按什么顺序读。')
}

// ---------------------------------------------------------------- 4. 验收报告命名

const acceptanceDir = join(repoRoot, 'docs/reference/acceptance')
for (const file of read(acceptanceDir).filter((f) => extname(f) === '.md')) {
  const base = file.slice(acceptanceDir.length + 1)
  if (base === 'README.md') continue
  if (/[_-](?:r\d+|round[-_]?\d+)\b/i.test(base)) {
    fail(
      `验收报告命名违规：${base}`,
      '一个功能一份报告，复验覆盖更新原文件并追加「复验轮次」小节。',
      '并行多份 R2/R3 只会让后来者猜哪份有效。',
    )
  }
}

// ------------------------------------------- 5. 站点页面与导航一致

const vitepressConfig = join(repoRoot, 'docs/.vitepress/config.mts')
if (existsSync(vitepressConfig)) {
  const config = readFileSync(vitepressConfig, 'utf8')

  const excludeBlock = config.match(/srcExclude:\s*\[([^\]]*)\]/s)
  if (!excludeBlock) {
    fail('docs/.vitepress/config.mts 未能解析 srcExclude', '检查括号或换行导致解析失败。')
  } else {
    const patterns = [...excludeBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    const isExcluded = (relativePath) =>
      patterns.some((p) =>
        p.endsWith('/**') ? relativePath.startsWith(p.slice(0, -2)) : relativePath === p,
      )

    const sidebarLinks = new Set(
      [...config.matchAll(/link:\s*'\/([^']+)'/g)].map((m) => `${m[1]}.md`),
    )

    const docsMd = read(join(repoRoot, 'docs')).filter((f) => extname(f) === '.md')
    for (const file of docsMd) {
      const relativePath = rel(file).replace(/^docs\//, '')
      if (relativePath.startsWith('.vitepress/')) continue
      if (relativePath === 'index.md') continue // 站点首页，无须出现在 sidebar
      if (isExcluded(relativePath)) continue
      if (!sidebarLinks.has(relativePath)) {
        fail(
          `docs/${relativePath} 不在 srcExclude 也不在 sidebar`,
          '要么把它加进 sidebar，要么加进 srcExclude——否则它会被构建成无人可达的 orphan page。',
        )
      }
    }
    for (const link of sidebarLinks) {
      if (!existsSync(join(repoRoot, 'docs', link))) {
        fail(`sidebar 指向不存在的页面：/${link}`)
      }
    }
  }
}

// ---------------------------------------------------------------- 6. 本地相对链接有效

const markdownFiles = read(join(repoRoot, 'docs'))
  .concat([
    join(repoRoot, 'AGENTS.md'),
    join(repoRoot, 'CONTEXT.md'),
    join(repoRoot, 'CONTRIBUTING.md'),
  ])
  .filter((f) => extname(f) === '.md' && existsSync(f))

for (const file of markdownFiles) {
  const content = readFileSync(file, 'utf8')
  for (const match of content.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1]
    // 外部链接、页内锚点、以及 VitePress 站点内绝对路由（/guide/copilot）
    if (/^(?:https?:|mailto:|#|\/)/.test(target)) continue
    const decoded = decodeURIComponent(target.split('#')[0])
    if (!decoded) continue
    const resolved = resolve(dirname(file), decoded)
    // 指向仓库外的路径是跨仓库引用（如本机只读克隆的 dsh-tavern-v2），不在本门禁范围
    if (!resolved.startsWith(repoRoot)) continue
    if (!existsSync(resolved)) {
      fail(`${rel(file)} 的链接指向不存在的路径：${target}`)
    }
  }
}

// ---------------------------------------------------------------- 输出

if (errors.length > 0) {
  console.error('[dsh-rrp] repo hygiene check failed')
  for (const { message, hints } of errors) {
    console.error(`  - ${message}`)
    for (const hint of hints) console.error(`      ${hint}`)
  }
  console.error('详见 AGENTS.md「真机验收」与 docs/dev/worklog.md 的工程纪律重整记录。')
  process.exitCode = 1
} else {
  console.log(
    `[dsh-rrp] repo hygiene ok: 根目录白名单、文档体积、${numbered.length} 篇 ADR 结构、验收命名、站点导航一致性、相对链接`,
  )
}
