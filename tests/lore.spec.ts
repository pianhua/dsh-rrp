import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  backupLegacyLore,
  legacySessionLoreDir,
  listLegacyLore,
  readLegacyLore,
  renderLore,
} from '../src/lore.ts'
import { LORE_LIMITS, applyLoreChange, isLoreName, validateLoreEntry } from '../src/lore-state.ts'

const homes: string[] = []
function tempHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'dsh-rrp-lore-'))
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
  const dir = join(legacySessionLoreDir(home, sessionId), entry.name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), renderLore(entry), 'utf8')
}

describe('lore event vocabulary and legacy adapter', () => {
  it('validates and normalizes one bounded entry', () => {
    expect(isLoreName('Good')).toBe(false)
    expect(isLoreName('a b')).toBe(false)
    expect(isLoreName('a--b')).toBe(false)
    expect(isLoreName('ok-name')).toBe(true)
    expect(validateLoreEntry({ ...ENTRY, name: ' qingqiu-fox-clan ' })).toEqual({
      ok: true,
      skill: ENTRY,
    })
    expect(validateLoreEntry({ ...ENTRY, description: '' }).ok).toBe(false)
    expect(validateLoreEntry({ ...ENTRY, body: 'x'.repeat(LORE_LIMITS.bodyChars + 1) }).ok).toBe(
      false,
    )
  })

  it('refuses an existing, reserved, or overflowing entry', () => {
    expect(validateLoreEntry(ENTRY, [ENTRY.name]).ok).toBe(false)
    expect(validateLoreEntry(ENTRY, [], [ENTRY.name]).ok).toBe(false)
    const full = Array.from(
      { length: LORE_LIMITS.skillsPerSession },
      (_, index) => 'lore-' + String(index),
    )
    expect(validateLoreEntry(ENTRY, full).ok).toBe(false)
  })

  it('reads old SKILL.md files only through the legacy adapter', () => {
    const home = tempHome()
    writeLegacy(home, 's1')
    expect(listLegacyLore(home, 's1').map((skill) => skill.name)).toEqual([ENTRY.name])
    expect(readLegacyLore(home, 's1', ENTRY.name)).toEqual(ENTRY)
    expect(readLegacyLore(home, 's2', ENTRY.name)).toBeUndefined()
  })

  it('renames one old Session directory to a recoverable backup', () => {
    const home = tempHome()
    writeLegacy(home, 's1')
    const source = legacySessionLoreDir(home, 's1')
    const backup = backupLegacyLore(home, 's1')
    expect(backup).toBe(source + '.legacy.bak')
    expect(existsSync(source)).toBe(false)
    expect(existsSync(backup!)).toBe(true)
    expect(backupLegacyLore(home, 's1')).toBeUndefined()
  })

  it('preserves projection identity for duplicate adds and absent removals', () => {
    const state = [ENTRY]
    expect(applyLoreChange(state, { kind: 'add', skill: ENTRY })).toBe(state)
    expect(applyLoreChange(state, { kind: 'remove', name: 'missing-lore' })).toBe(state)
  })
})
