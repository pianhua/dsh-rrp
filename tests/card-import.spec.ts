import { gunzipSync, gzipSync } from 'node:zlib'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cardIdFromName,
  importCardFromJson,
  importCardFromPng,
  normalizeCharacterCard,
  pngTextChunks,
  writeImportedCard,
} from '../src/card-import.ts'
import { readCard } from '../src/cards.ts'

/** Build a minimal PNG carrying the given tEXt chunks (CRCs are not validated). */
function pngWith(...texts: Array<[string, string]>): Buffer {
  const chunks: Buffer[] = []
  for (const [keyword, value] of texts) {
    const data = Buffer.concat([Buffer.from(keyword + '\0', 'latin1'), Buffer.from(value, 'latin1')])
    const head = Buffer.alloc(8)
    head.writeUInt32BE(data.length, 0)
    head.write('tEXt', 4, 'ascii')
    chunks.push(Buffer.concat([head, data, Buffer.alloc(4)]))
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ...chunks,
  ])
}

const V2 = {
  name: 'Mia the Maid',
  description: '落难贵族之女，现为女仆。{{user}}是她的主人。',
  personality: '倔强、细心，口是心非。',
  first_mes: '{{char}}提着裙摆行礼：欢迎回来。',
  mes_example: '<START>\n{{user}}: 晚膳呢？\n{{char}}: 这就端上来。',
  scenario: '雪夜的老宅。',
  tags: ['女仆', '大小姐', '女仆'],
  creator: 'tester',
}

describe('character card normalization (issue #31 P1-D)', () => {
  it('maps v2 fields onto our vocabulary and expands placeholders', () => {
    const source = normalizeCharacterCard(V2)
    expect(source).toBeDefined()
    expect(source?.name).toBe('Mia the Maid')
    expect(source?.worldCore).toContain('落难贵族之女')
    expect(source?.worldCore).toContain('【情境】\n雪夜的老宅。')
    expect(source?.worldCore).toContain('你是她的主人')
    expect(source?.persona).toContain('倔强、细心')
    expect(source?.persona).toContain('示例对话')
    expect(source?.firstMessage).toBe('Mia the Maid提着裙摆行礼：欢迎回来。')
    expect(source?.tags).toEqual(['女仆', '大小姐'])
    expect(source?.creator).toBe('tester')
  })

  it('reads v3 { spec, data } cards', () => {
    const source = normalizeCharacterCard({ spec: 'chara_card_v3', data: { name: '剑客', description: '独臂。', first_mes: '……' } })
    expect(source?.name).toBe('剑客')
    expect(source?.worldCore).toBe('独臂。')
  })

  it('rejects cards without a usable character', () => {
    expect(normalizeCharacterCard(null)).toBeUndefined()
    expect(normalizeCharacterCard({})).toBeUndefined()
    expect(normalizeCharacterCard({ name: '  ' })).toBeUndefined()
    expect(importCardFromJson('{not json')).toBeUndefined()
    expect(importCardFromJson('{"spec":"chara_card_v3"}')).toBeUndefined()
  })
})

describe('tavern PNG parsing', () => {
  it('extracts tEXt chunks and decodes a ccv3 (base64+gzip) card', () => {
    const payload = Buffer.from(JSON.stringify({ spec: 'chara_card_v3', data: V2 }), 'utf8')
    const png = pngWith(['ccv3', gzipSync(payload).toString('base64')])
    const chunks = pngTextChunks(png)
    expect(chunks?.has('ccv3')).toBe(true)
    const source = importCardFromPng(png)
    expect(source?.name).toBe('Mia the Maid')
    expect(gunzipSync(Buffer.from(chunks!.get('ccv3')!, 'base64')).toString('utf8')).toContain('chara_card_v3')
  })

  it('decodes a legacy chara (plain base64) card and ignores non-PNG bytes', () => {
    const png = pngWith(['chara', Buffer.from(JSON.stringify(V2), 'utf8').toString('base64')])
    expect(importCardFromPng(png)?.name).toBe('Mia the Maid')
    expect(pngTextChunks(Buffer.from('not a png'))).toBeUndefined()
    expect(importCardFromPng(Buffer.from('not a png'))).toBeUndefined()
    // A PNG without any card chunk is not a card.
    expect(importCardFromPng(pngWith(['Software', 'paint']))).toBeUndefined()
  })
})

describe('card id derivation', () => {
  it('slugs latin names and gives up on pure non-latin names', () => {
    expect(cardIdFromName('Mia the Maid!')).toBe('mia-the-maid')
    expect(cardIdFromName('  Café  de  PARIS ')).toBe('cafe-de-paris')
    expect(cardIdFromName('米娅')).toBe('')
  })
})

describe('writeImportedCard (issue #31 P1-D)', () => {
  let home: string

  beforeAll(() => {
    home = mkdtempSync(join(tmpdir(), 'rrp-import-'))
  })

  afterAll(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('writes a pack our own parser reads back, preset materialized', () => {
    const source = normalizeCharacterCard(V2)!

    const first = writeImportedCard(source, home)
    expect(first?.id).toBe('mia-the-maid')
    const pack = readCard(first!.id, home)
    expect(pack).toBeDefined()
    expect(pack?.meta.name).toBe('Mia the Maid')
    expect(pack?.meta.tags).toEqual(['女仆', '大小姐'])
    expect(pack?.persona).toContain('倔强、细心')
    expect(pack?.worldCore).toContain('落难贵族之女')
    expect(pack?.openings).toHaveLength(1)
    expect(pack?.openings[0]?.id).toBe('default')
    expect(pack?.openings[0]?.body).toContain('提着裙摆行礼')
  })

  it('allocates a fresh id on name collisions', () => {
    const source = normalizeCharacterCard(V2)!
    const second = writeImportedCard(source, home)
    expect(second?.id).toBe('mia-the-maid-2')
    const third = writeImportedCard(source, home)
    expect(third?.id).toBe('mia-the-maid-3')
  })

  it('writes a pack without an opening when first_mes is empty', () => {
    const source = normalizeCharacterCard({ name: 'Silent One', description: '…' })!
    const written = writeImportedCard(source, home)
    const pack = readCard(written!.id, home)
    expect(pack?.openings).toHaveLength(0)
  })
})
