/**
 * dsh-rrp — Steward proposals (issue #33 P1).
 *
 * The Copilot's project-maintenance actions (propose_card_edit /
 * propose_doc_note) never touch the disk on their own: they land in this
 * in-memory staging area first, exactly like the lore route's PENDING draft
 * (see lore-route.ts). The player reviews each proposal in the Copilot panel
 * and only an explicit confirm writes anything — and only ever into the
 * player's OWN card directory; shipped packs are read-only by construction.
 *
 * Pure in-memory, process-lifetime: losing staged proposals on restart is
 * acceptable (the Steward re-stages on request), and no file island sneaks
 * back in.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import { cardDirOf, readCard } from './cards.ts'
import { harnessHome } from './home.ts'

/** One staged Steward proposal, discriminated by kind. */
export type StewardProposal =
  | { id: string; kind: 'card-edit'; card: string; file: string; content: string; reason?: string; at: number }
  | { id: string; kind: 'doc-note'; title: string; body: string; at: number }

/** Staged proposals per session; the newest PROPOSALS_LIMIT survive. */
const PROPOSALS = new Map<string, StewardProposal[]>()/** Pre-write content archives per session (audit only, keyed by proposal id). */
const ARCHIVE = new Map<string, Map<string, string>>()

/** Staged proposals kept per session; beyond this the oldest are dropped. */
const PROPOSALS_LIMIT = 20

/** The file extensions a card-edit proposal may target. */
const ALLOWED_EXTS = new Set(['.md', '.json', '.txt'])

/** Omit that distributes over the discriminated union (plain Omit would not). */
type DistributiveOmit<T, K extends string> = T extends unknown ? Omit<T, K> : never

/** Stage one proposal; drops the oldest when the session hits the cap. */
export function stageProposal(sessionId: string, input: DistributiveOmit<StewardProposal, 'id' | 'at'>): StewardProposal {
  const proposal = { ...input, id: randomUUID(), at: Date.now() } as StewardProposal
  const list = [...(PROPOSALS.get(sessionId) ?? []), proposal]
  PROPOSALS.set(sessionId, list.slice(-PROPOSALS_LIMIT))
  return proposal
}

/** All staged proposals of one session, oldest first. */
export function listProposals(sessionId: string): StewardProposal[] {
  return PROPOSALS.get(sessionId) ?? []
}

/** Drop one staged proposal; false when it was not staged. */
export function discardProposal(sessionId: string, id: string): boolean {
  const list = PROPOSALS.get(sessionId)
  if (list === undefined) return false
  const next = list.filter((proposal) => proposal.id !== id)
  if (next.length === list.length) return false
  PROPOSALS.set(sessionId, next)
  return true
}

/** Forget one session's staged proposals (and its content archive) on disposal. */
export function forgetProposals(sessionId: string): void {
  PROPOSALS.delete(sessionId)
  ARCHIVE.delete(sessionId)
}

/** Drop every staged proposal (plugin unload must not leave stale sessions behind). */
export function forgetAllProposals(): void {
  PROPOSALS.clear()
  ARCHIVE.clear()
}

/** The pre-write archive of one session's confirmed card edits (testing/inspection). */
export function proposalArchiveOf(sessionId: string): ReadonlyMap<string, string> {
  return ARCHIVE.get(sessionId) ?? new Map<string, string>()
}

/**
 * Resolve one proposal-relative file against the card root, refusing absolute
 * paths, `..` escapes and non-whitelisted extensions. Returns the absolute
 * target path, or an error message for the player.
 */
function resolveTargetFile(dir: string, file: string): { path: string } | { error: string } {
  if (file.trim().length === 0) return { error: '文件路径不能为空' }
  if (isAbsolute(file)) return { error: '不允许绝对路径' }
  const ext = extname(file).toLowerCase()
  if (!ALLOWED_EXTS.has(ext)) return { error: '只允许写入 .md / .json / .txt 文件' }
  const target = resolve(dir, file)
  const inside = relative(dir, target)
  if (inside.length === 0 || inside.startsWith('..') || isAbsolute(inside)) {
    return { error: '路径越界：目标文件必须位于卡包目录内' }
  }
  return { path: target }
}

/**
 * Player confirmed one proposal. A card-edit writes the file (user card
 * directory only, old content archived first, trigger cache rebuilt); a
 * doc-note is acknowledged without touching anything. Card-edit proposals
 * are consumed by a successful confirm; doc-notes stay until discarded.
 */
export function confirmProposal(
  sessionId: string,
  id: string,
  home: string = harnessHome(),
): { ok: true; summary: string } | { ok: false; error: string } {
  const proposal = listProposals(sessionId).find((entry) => entry.id === id)
  if (proposal === undefined) return { ok: false, error: '提案不存在或已被处理' }

  if (proposal.kind === 'doc-note') {
    return { ok: true, summary: '已阅备忘：' + proposal.title }
  }

  // 红线一：只许写用户卡目录。包内卡（随插件分发）一律拒绝。
  const dir = cardDirOf(proposal.card, home)
  if (dir === undefined) {
    if (readCard(proposal.card, home) !== undefined) {
      return { ok: false, error: '该卡包随插件分发，只读；请复制到用户卡目录后再改' }
    }
    return { ok: false, error: '找不到卡包：' + proposal.card }
  }

  // 红线二：路径必须留在卡包根内，扩展名必须白名单。
  const target = resolveTargetFile(dir, proposal.file)
  if ('error' in target) return { ok: false, error: target.error }

  // 写入前读旧内容存档（审计用），随后落盘并重建该卡的条件触发缓存。
  const oldContent = existsSync(target.path) ? readFileSync(target.path, 'utf8') : ''
  mkdirSync(dirname(target.path), { recursive: true })
  writeFileSync(target.path, proposal.content, 'utf8')
  readCard(proposal.card, home)
  const archives = ARCHIVE.get(sessionId) ?? new Map<string, string>()
  archives.set(proposal.id, oldContent)
  ARCHIVE.set(sessionId, archives)
  PROPOSALS.set(
    sessionId,
    listProposals(sessionId).filter((entry) => entry.id !== id),
  )
  return {
    ok: true,
    summary: '已写入 ' + proposal.card + '/' + proposal.file +
      '（' + String(proposal.content.length) + ' 字符，原内容 ' + String(oldContent.length) + ' 字符已存档）',
  }
}
