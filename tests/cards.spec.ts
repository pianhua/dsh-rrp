import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listCards, mountSkillsForCard, parseCardMarkdown, parseFrontmatter, readCard } from '../src/cards.ts'
import { interpolateCardText } from '../src/card-types.ts'

const SAMPLE = `---
id: demo
name: 示例卡
summary: 一句话简介。
tags: [甲, 乙]
opening: default
player:
  name: 顾青
  description: 一个剑客。
persona: |
  第一行规则。
  第二行规则。
---

# 世界核心

正文。
`

describe('player variable interpolation', () => {
  it('resolves {{player.*}} and leaves unknown variables untouched', () => {
    const player = { name: '无名客', description: '独行者' }
    expect(interpolateCardText('你好，{{player.name}}——{{player.description}}', player)).toBe('你好，无名客——独行者')
    expect(interpolateCardText('{{player.name}}与{{unknown.var}}', player)).toBe('无名客与{{unknown.var}}')
    expect(interpolateCardText('没有变量', undefined)).toBe('没有变量')
    expect(interpolateCardText('{{player.name}}', undefined)).toBe('')
  })
})

describe('card frontmatter parser', () => {
  it('parses inline arrays, one nesting level, and a block scalar', () => {
    const parsed = parseFrontmatter(SAMPLE)
    expect(parsed).toBeDefined()
    expect(parsed?.data.id).toBe('demo')
    expect(parsed?.data.tags).toEqual(['甲', '乙'])
    expect(parsed?.data.player).toEqual({ name: '顾青', description: '一个剑客。' })
    expect(parsed?.data.persona).toBe('第一行规则。\n第二行规则。\n')
    expect(parsed?.body.trim()).toBe('# 世界核心\n\n正文。')
  })

  it('rejects a document without fences', () => {
    expect(parseFrontmatter('# no frontmatter')).toBeUndefined()
  })
})

describe('card manifest', () => {
  it('maps the parsed fields onto card metadata', () => {
    const parsed = parseCardMarkdown(SAMPLE)
    expect(parsed?.meta).toMatchObject({ id: 'demo', name: '示例卡', opening: 'default', tags: ['甲', '乙'] })
    expect(parsed?.meta.player).toEqual({ name: '顾青', description: '一个剑客。' })
    expect(parsed?.persona).toContain('第二行规则。')
    expect(parsed?.worldCore).toContain('世界核心')
  })

  it('rejects non-canonical card ids', () => {
    expect(parseCardMarkdown(SAMPLE.replace('id: demo', 'id: Demo'))).toBeUndefined()
    expect(parseCardMarkdown(SAMPLE.replace('id: demo', 'id: demo_card'))).toBeUndefined()
    expect(parseCardMarkdown(SAMPLE.replace('id: demo', 'id: ../demo'))).toBeUndefined()
  })
})

describe('the shipped test card', () => {
  let home: string
  let previous: string | undefined

  beforeEach(() => {
    previous = process.env.DSH_HOME
    home = mkdtempSync(join(tmpdir(), 'dsh-rrp-cards-'))
    process.env.DSH_HOME = home
  })

  afterEach(() => {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    rmSync(home, { recursive: true, force: true })
  })

  it('is discoverable from the shipped root', () => {
    expect(listCards().map((card) => card.id)).toContain('maid-heiress')
    expect(listCards().map((card) => card.id)).toContain('yanmen-inn')
  })

  it('parses the second shipped card: wuxia mystery pack with its own skills', () => {
    const pack = readCard('yanmen-inn')
    expect(pack).toBeDefined()
    expect(pack?.meta.name).toBe('雪夜雁门客栈')
    expect(pack?.meta.player?.name).toBe('无名客')
    expect(pack?.worldCore).toContain('暴雪封山')
    expect(pack?.openings[0]?.body).toContain('{{player.name}}')
    expect(pack?.initialState?.scene?.location).toContain('孤灯客栈')
    expect(pack?.skills.map((skill) => skill.id).sort()).toEqual(['inn', 'old-sword', 'world-setting'])
  })

  it('parses the whole pack: opening, initial state, and skills', () => {
    const pack = readCard('maid-heiress')
    expect(pack).toBeDefined()
    expect(pack?.meta.name).toBe('女仆大小姐')
    expect(pack?.meta.player?.name).toBe('你')
    expect(pack?.persona).toContain('信息差')
    expect(pack?.worldCore).toContain('世界核心')
    expect(pack?.openings[0]?.id).toBe('default')
    expect(pack?.openings[0]?.body).toContain('主人')
    expect(pack?.initialState?.characters['米娅']?.affinity).toBe(6)
    expect(pack?.initialState?.flags['米娅已成为你的贴身女仆']).toBe(true)
    expect(pack?.skills.map((skill) => skill.id).sort()).toEqual([
      'apartment', 'cecilia', 'family', 'mia', 'tone', 'world-setting',
    ])
    expect(pack?.skills.every((skill) => typeof skill.name === 'string' && skill.name.length > 0)).toBe(true)
    expect(pack?.skills.every((skill) => typeof skill.description === 'string' && skill.description.length > 0)).toBe(true)
  })

  it('prefers a user card over the shipped one of the same id', () => {
    const userDir = join(home, '.dsh-rrp', 'cards', 'maid-heiress')
    mkdirSync(userDir, { recursive: true })
    writeFileSync(
      join(userDir, 'card.md'),
      SAMPLE.replace('id: demo', 'id: maid-heiress').replace('name: 示例卡', 'name: 我的覆盖卡'),
    )
    expect(readCard('maid-heiress')?.meta.name).toBe('我的覆盖卡')
  })

  it('returns undefined for an unknown card', () => {
    expect(readCard('nope')).toBeUndefined()
  })

  it('does not read outside the card root', () => {
    const escaped = join(home, '.dsh-rrp', 'escaped')
    mkdirSync(escaped, { recursive: true })
    writeFileSync(join(escaped, 'card.md'), SAMPLE.replace('id: demo', 'id: escaped'))
    expect(readCard('../escaped')).toBeUndefined()
  })

  it('ignores a card whose directory and manifest ids differ', () => {
    const mismatched = join(home, '.dsh-rrp', 'cards', 'folder-name')
    mkdirSync(mismatched, { recursive: true })
    writeFileSync(join(mismatched, 'card.md'), SAMPLE.replace('id: demo', 'id: manifest-name'))
    expect(listCards(home).map((card) => card.id)).not.toContain('manifest-name')
  })

  it("mounts ONE card's skills into its preset skills root", () => {
    const target = join(home, 'preset')
    mountSkillsForCard(target, 'maid-heiress')
    expect(existsSync(join(target, 'skills', 'mia', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(target, 'skills', 'tone', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(target, 'skills', 'world-setting', 'SKILL.md'))).toBe(true)
  })
})
