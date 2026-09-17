import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  SEDIMENT_LIMITS,
  isSedimentName,
  listSediment,
  readSediment,
  removeSediment,
  writeSediment,
} from '../src/sediment.ts'

const homes: string[] = []
function tempHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'dsh-rrp-sediment-'))
  homes.push(home)
  return home
}
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

function draft(overrides: Record<string, string> = {}) {
  return {
    name: 'qingqiu-fox-clan',
    description: '青丘狐族的规矩与人物；涉及青丘、狐族时使用。',
    body: '# 青丘\n\n- 九尾为尊。',
    ...overrides,
  }
}

describe('sediment storage (D8)', () => {
  it('adds, lists, reads and removes one skill', () => {
    const home = tempHome()
    const written = writeSediment(home, 's1', draft())
    expect(written.ok).toBe(true)

    const list = listSediment(home, 's1')
    expect(list.map((skill) => skill.name)).toEqual(['qingqiu-fox-clan'])
    expect(list[0]?.description).toContain('狐族')
    expect(list[0]?.bytes).toBeGreaterThan(0)

    const read = readSediment(home, 's1', 'qingqiu-fox-clan')
    expect(read?.body).toContain('九尾为尊')

    expect(removeSediment(home, 's1', 'qingqiu-fox-clan')).toBe(true)
    expect(listSediment(home, 's1')).toEqual([])
    expect(removeSediment(home, 's1', 'qingqiu-fox-clan')).toBe(false)
  })

  it('is add-only: an existing name is refused, never overwritten', () => {
    const home = tempHome()
    expect(writeSediment(home, 's1', draft()).ok).toBe(true)
    const again = writeSediment(home, 's1', draft({ body: '# 改写' }))
    expect(again.ok).toBe(false)
    expect(readSediment(home, 's1', 'qingqiu-fox-clan')?.body).toContain('九尾为尊')
  })

  it('refuses reserved names (the active card bundled skills)', () => {
    const home = tempHome()
    const result = writeSediment(home, 's1', draft({ name: 'maid-mia' }), ['maid-mia'])
    expect(result.ok).toBe(false)
    expect(listSediment(home, 's1')).toEqual([])
  })

  it('rejects illegal names and oversized fields', () => {
    const home = tempHome()
    expect(isSedimentName('Good')).toBe(false)
    expect(isSedimentName('a b')).toBe(false)
    expect(isSedimentName('a--b')).toBe(false)
    expect(isSedimentName('ok-name')).toBe(true)
    expect(writeSediment(home, 's1', draft({ name: 'Bad Name' })).ok).toBe(false)
    expect(writeSediment(home, 's1', draft({ description: '' })).ok).toBe(false)
    expect(writeSediment(home, 's1', draft({ body: 'x'.repeat(SEDIMENT_LIMITS.bodyChars + 1) })).ok).toBe(false)
    expect(listSediment(home, 's1')).toEqual([])
  })

  it('isolates sessions from each other', () => {
    const home = tempHome()
    writeSediment(home, 's1', draft({ name: 'alpha-lore' }))
    writeSediment(home, 's2', draft({ name: 'beta-lore' }))
    expect(listSediment(home, 's1').map((skill) => skill.name)).toEqual(['alpha-lore'])
    expect(listSediment(home, 's2').map((skill) => skill.name)).toEqual(['beta-lore'])
    expect(readSediment(home, 's2', 'alpha-lore')).toBeUndefined()
  })

  it('caps the number of skills per session', () => {
    const home = tempHome()
    for (let index = 0; index < SEDIMENT_LIMITS.skillsPerSession; index += 1) {
      expect(writeSediment(home, 's1', draft({ name: 'lore-' + String(index) })).ok).toBe(true)
    }
    const overflow = writeSediment(home, 's1', draft({ name: 'one-too-many' }))
    expect(overflow.ok).toBe(false)
  })
})
