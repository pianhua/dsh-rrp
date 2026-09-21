/**
 * Issue #33 P1 — Steward proposals: staging, caps, and the confirm red lines.
 *
 * Card-edit confirms write ONLY into the user card directory (`<home>/.dsh-rrp/cards/`);
 * shipped packs, absolute paths, `..` escapes and non-whitelisted extensions are
 * all refused. Doc-notes confirm as read-and-keep. Tests build a temp harness
 * home with one minimal user card pack (frontmatter modeled on cards/yanmen-inn).
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  confirmProposal,
  discardProposal,
  forgetAllProposals,
  forgetProposals,
  listProposals,
  proposalArchiveOf,
  stageProposal,
} from '../src/steward-proposals.ts'

const homes: string[] = []

/** A throwaway harness home containing one minimal user card pack. */
function tempHomeWithCard(cardId = 'test-card'): string {
  const home = mkdtempSync(join(tmpdir(), 'dsh-rrp-steward-'))
  homes.push(home)
  const dir = join(home, '.dsh-rrp', 'cards', cardId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'card.md'),
    ['---', 'id: ' + cardId, 'name: 测试卡', '---', '', '# 世界核心', '', '旧正文。', ''].join(
      '\n',
    ),
    'utf8',
  )
  return home
}

afterEach(() => {
  forgetAllProposals()
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

describe('steward proposals staging', () => {
  it('stages, lists, and discards proposals per session', () => {
    const staged = stageProposal('s1', {
      kind: 'card-edit',
      card: 'test-card',
      file: 'card.md',
      content: '# 新',
      reason: 'r',
    })
    stageProposal('s1', { kind: 'doc-note', title: '备忘一', body: '正文' })
    stageProposal('s2', { kind: 'doc-note', title: '别的会话', body: '正文' })

    const list = listProposals('s1')
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({
      id: staged.id,
      kind: 'card-edit',
      card: 'test-card',
      file: 'card.md',
      reason: 'r',
    })
    expect(list[1]).toMatchObject({ kind: 'doc-note', title: '备忘一' })
    expect(listProposals('s2')).toHaveLength(1)

    expect(discardProposal('s1', staged.id)).toBe(true)
    expect(listProposals('s1')).toHaveLength(1)
    expect(discardProposal('s1', staged.id)).toBe(false)
    expect(discardProposal('s1', 'nope')).toBe(false)
  })

  it('keeps at most 20 proposals per session, dropping the oldest', () => {
    let firstId = ''
    for (let index = 0; index < 21; index += 1) {
      const staged = stageProposal('s-cap', {
        kind: 'doc-note',
        title: 'n' + String(index),
        body: 'b',
      })
      if (index === 0) firstId = staged.id
    }
    const list = listProposals('s-cap')
    expect(list).toHaveLength(20)
    expect(list.some((proposal) => proposal.id === firstId)).toBe(false)
    expect(list[0]).toMatchObject({ title: 'n1' })
    expect(list[19]).toMatchObject({ title: 'n20' })
  })

  it('forgetProposals drops one session and forgetAllProposals drops everything', () => {
    stageProposal('s-a', { kind: 'doc-note', title: 'a', body: 'b' })
    stageProposal('s-b', { kind: 'doc-note', title: 'b', body: 'b' })
    forgetProposals('s-a')
    expect(listProposals('s-a')).toEqual([])
    expect(listProposals('s-b')).toHaveLength(1)
    forgetAllProposals()
    expect(listProposals('s-b')).toEqual([])
  })
})

describe('steward proposals confirm (card-edit)', () => {
  it('writes the file into the user card dir, archives the old content, and consumes the proposal', () => {
    const home = tempHomeWithCard()
    const staged = stageProposal('s1', {
      kind: 'card-edit',
      card: 'test-card',
      file: 'notes/extra.md',
      content: '# 补充设定\n新内容。',
    })
    const result = confirmProposal('s1', staged.id, home)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.summary).toBe('已写入 test-card/notes/extra.md（11 字符，原内容 0 字符已存档）')
    }
    const written = readFileSync(
      join(home, '.dsh-rrp', 'cards', 'test-card', 'notes', 'extra.md'),
      'utf8',
    )
    expect(written).toBe('# 补充设定\n新内容。')
    // 原内容为空（新文件）：存档记录为空串。
    expect(proposalArchiveOf('s1').get(staged.id)).toBe('')
    expect(listProposals('s1')).toEqual([])
  })

  it('overwrites an existing file and archives its prior content', () => {
    const home = tempHomeWithCard()
    const cardMd = join(home, '.dsh-rrp', 'cards', 'test-card', 'card.md')
    const oldContent = readFileSync(cardMd, 'utf8')
    const replacement = [
      '---',
      'id: test-card',
      'name: 测试卡（改）',
      '---',
      '',
      '# 替换',
      '',
    ].join('\n')
    const staged = stageProposal('s1', {
      kind: 'card-edit',
      card: 'test-card',
      file: 'card.md',
      content: replacement,
    })
    const result = confirmProposal('s1', staged.id, home)
    expect(result.ok).toBe(true)
    expect(readFileSync(cardMd, 'utf8')).toBe(replacement)
    expect(proposalArchiveOf('s1').get(staged.id)).toBe(oldContent)
  })

  it('DEF-05: refuses a card.md whose frontmatter lost the required id/name', () => {
    const home = tempHomeWithCard()
    const cardMd = join(home, '.dsh-rrp', 'cards', 'test-card', 'card.md')
    const before = readFileSync(cardMd, 'utf8')
    // 管家凭残稿重建整卡的经典事故：frontmatter 只剩 name，id 丢失。
    const broken = ['---', 'name: 测试卡', '---', '', '# 重建的世界核心', ''].join('\n')
    const staged = stageProposal('s1', {
      kind: 'card-edit',
      card: 'test-card',
      file: 'card.md',
      content: broken,
    })
    const result = confirmProposal('s1', staged.id, home)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('frontmatter')
    // 磁盘原样 + 提案保留待修正。
    expect(readFileSync(cardMd, 'utf8')).toBe(before)
    expect(listProposals('s1')).toHaveLength(1)
  })

  it('refuses shipped packs as read-only', () => {
    // yanmen-inn 只随插件分发：用户卡目录里没有它。
    const home = tempHomeWithCard()
    const staged = stageProposal('s1', {
      kind: 'card-edit',
      card: 'yanmen-inn',
      file: 'card.md',
      content: '# x',
    })
    const result = confirmProposal('s1', staged.id, home)
    expect(result).toEqual({ ok: false, error: '该卡包随插件分发，只读；请复制到用户卡目录后再改' })
  })

  it('refuses unknown card packs', () => {
    const home = tempHomeWithCard()
    const staged = stageProposal('s1', {
      kind: 'card-edit',
      card: 'no-such-card',
      file: 'card.md',
      content: '# x',
    })
    const result = confirmProposal('s1', staged.id, home)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('找不到卡包')
  })

  it('refuses path escapes, absolute paths, and non-whitelisted extensions', () => {
    const home = tempHomeWithCard()
    const escape = stageProposal('s1', {
      kind: 'card-edit',
      card: 'test-card',
      file: '../outside.md',
      content: 'x',
    })
    const escaped = confirmProposal('s1', escape.id, home)
    expect(escaped.ok).toBe(false)
    if (!escaped.ok) expect(escaped.error).toContain('越界')

    const absolute = stageProposal('s1', {
      kind: 'card-edit',
      card: 'test-card',
      file: '/etc/passwd.md',
      content: 'x',
    })
    const refused = confirmProposal('s1', absolute.id, home)
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.error).toContain('绝对路径')

    const exe = stageProposal('s1', {
      kind: 'card-edit',
      card: 'test-card',
      file: 'payload.exe',
      content: 'x',
    })
    const blocked = confirmProposal('s1', exe.id, home)
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.error).toContain('.md / .json / .txt')

    // 拒绝的提案仍留在列表里，由玩家自行丢弃。
    expect(listProposals('s1')).toHaveLength(3)
    expect(existsSync(join(home, '.dsh-rrp', 'cards', 'outside.md'))).toBe(false)
  })

  it('reports unknown proposal ids', () => {
    const home = tempHomeWithCard()
    expect(confirmProposal('s1', 'nope', home)).toEqual({
      ok: false,
      error: '提案不存在或已被处理',
    })
  })
})

describe('steward proposals confirm (doc-note)', () => {
  it('acknowledges without writing anything and keeps the note until discarded', () => {
    const home = tempHomeWithCard()
    const staged = stageProposal('s1', { kind: 'doc-note', title: '设定修订备忘', body: '# 备忘' })
    const result = confirmProposal('s1', staged.id, home)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.summary).toBe('已阅备忘：设定修订备忘')
    // 不移除：移除由 discard 做。
    expect(listProposals('s1')).toHaveLength(1)
    expect(discardProposal('s1', staged.id)).toBe(true)
    expect(listProposals('s1')).toEqual([])
  })
})
