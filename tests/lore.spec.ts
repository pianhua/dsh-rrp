import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  backupLegacySediment,
  legacySessionSedimentDir,
  listLegacySediment,
  readLegacySediment,
  renderSediment,
} from '../src/sediment.ts'
import { SEDIMENT_LIMITS, applySedimentChange, isSedimentName, validateSedimentEntry } from '../src/sediment-state.ts'

const homes: string[] = []
function tempHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'dsh-rrp-sediment-'))
  homes.push(home)
  return home
}
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

const ENTRY = {
  name: 'qingqiu-fox-clan',
  description: '青丘狐族的规矩与人物；涉及青丘、狐族时使用。',
  body: '# 青丘\n\n- 九尾为尊。',
}

function writeLegacy(home: string, sessionId: string, entry = ENTRY): void {
  const dir = join(legacySessionSedimentDir(home, sessionId), entry.name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), renderSediment(entry), 'utf8')
}

describe('sediment event vocabulary and legacy adapter', () => {
  it('validates and normalizes one bounded entry', () => {
    expect(isSedimentName('Good')).toBe(false)
    expect(isSedimentName('a b')).toBe(false)
    expect(isSedimentName('a--b')).toBe(false)
    expect(isSedimentName('ok-name')).toBe(true)
    expect(validateSedimentEntry({ ...ENTRY, name: ' qingqiu-fox-clan ' })).toEqual({ ok: true, skill: ENTRY })
    expect(validateSedimentEntry({ ...ENTRY, description: '' }).ok).toBe(false)
    expect(validateSedimentEntry({ ...ENTRY, body: 'x'.repeat(SEDIMENT_LIMITS.bodyChars + 1) }).ok).toBe(false)
  })

  it('refuses an existing, reserved, or overflowing entry', () => {
    expect(validateSedimentEntry(ENTRY, [ENTRY.name]).ok).toBe(false)
    expect(validateSedimentEntry(ENTRY, [], [ENTRY.name]).ok).toBe(false)
    const full = Array.from({ length: SEDIMENT_LIMITS.skillsPerSession }, (_, index) => 'lore-' + String(index))
    expect(validateSedimentEntry(ENTRY, full).ok).toBe(false)
  })

  it('reads old SKILL.md files only through the legacy adapter', () => {
    const home = tempHome()
    writeLegacy(home, 's1')
    expect(listLegacySediment(home, 's1').map((skill) => skill.name)).toEqual([ENTRY.name])
    expect(readLegacySediment(home, 's1', ENTRY.name)).toEqual(ENTRY)
    expect(readLegacySediment(home, 's2', ENTRY.name)).toBeUndefined()
  })

  it('renames one old Session directory to a recoverable backup', () => {
    const home = tempHome()
    writeLegacy(home, 's1')
    const source = legacySessionSedimentDir(home, 's1')
    const backup = backupLegacySediment(home, 's1')
    expect(backup).toBe(source + '.legacy.bak')
    expect(existsSync(source)).toBe(false)
    expect(existsSync(backup!)).toBe(true)
    expect(backupLegacySediment(home, 's1')).toBeUndefined()
  })

  it('preserves projection identity for duplicate adds and absent removals', () => {
    const state = [ENTRY]
    expect(applySedimentChange(state, { kind: 'add', skill: ENTRY })).toBe(state)
    expect(applySedimentChange(state, { kind: 'remove', name: 'missing-lore' })).toBe(state)
  })
})
