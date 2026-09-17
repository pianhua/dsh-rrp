import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as rrp from '../src/index.ts'
import { isCardId, presetIdForCard } from '../src/preset-id.ts'

describe('card preset identity', () => {
  it('accepts one canonical card-id grammar', () => {
    expect(isCardId('maid-heiress')).toBe(true)
    expect(isCardId('card2')).toBe(true)
    expect(isCardId('foo_bar')).toBe(false)
    expect(isCardId('foo bar')).toBe(false)
    expect(isCardId('Foo-Bar')).toBe(false)
    expect(isCardId('../foo')).toBe(false)
  })

  it('maps a valid card id injectively and rejects lossy aliases', () => {
    expect(presetIdForCard('maid-heiress')).toBe('rp-maid-heiress')
    expect(() => presetIdForCard('foo_bar')).toThrow(/card id/i)
    expect(() => presetIdForCard('foo bar')).toThrow(/card id/i)
  })
})

/**
 * The mandatory HMR-safety check: mounting then disposing the fiber must leave
 * no residue behind. Stage 2 adds file materialization, so the test points
 * DSH_HOME at a throwaway directory and asserts the preset is cleaned up.
 */
describe('dsh-rrp host half', () => {
  let home: string
  let previousHome: string | undefined

  beforeEach(() => {
    previousHome = process.env.DSH_HOME
    home = mkdtempSync(join(tmpdir(), 'dsh-rrp-host-'))
    process.env.DSH_HOME = home
  })

  afterEach(() => {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  })

  /** Write one synthetic card with one world-knowledge skill. */
  function writeCard(id: string, skill: string): void {
    const cardDir = join(home, '.dsh-rrp', 'cards', id)
    mkdirSync(join(cardDir, 'skills', skill), { recursive: true })
    writeFileSync(join(cardDir, 'card.md'), `---\nid: ${id}\nname: ${id}\n---\n\n# core\n`)
    writeFileSync(
      join(cardDir, 'skills', skill, 'SKILL.md'),
      `---\nname: ${skill}\ndescription: ${skill} description\n---\n\nbody\n`,
    )
  }

  it('mounts and disposes cleanly (HMR safety)', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(rrp)
    expect(fiber).toBeTruthy()
    await fiber.dispose()
  })

  it("scopes each card's skills to its own preset (no cross-card bleed)", async () => {
    writeCard('alpha', 'alpha-lore')
    writeCard('beta', 'beta-lore')

    const ctx = new Context()
    const fiber = await ctx.plugin(rrp)
    try {
      const alphaDir = join(home, '.agent-presets', 'rp-alpha')
      const betaDir = join(home, '.agent-presets', 'rp-beta')

      // Each card preset points at its own skills root...
      expect(readFileSync(join(alphaDir, 'agent.cordis.yml'), 'utf8')).toContain(join(alphaDir, 'skills'))
      expect(readFileSync(join(betaDir, 'agent.cordis.yml'), 'utf8')).toContain(join(betaDir, 'skills'))

      // ...holds only its own bundle...
      expect(existsSync(join(alphaDir, 'skills', 'alpha-lore', 'SKILL.md'))).toBe(true)
      expect(existsSync(join(alphaDir, 'skills', 'beta-lore', 'SKILL.md'))).toBe(false)
      expect(existsSync(join(betaDir, 'skills', 'beta-lore', 'SKILL.md'))).toBe(true)
      expect(existsSync(join(betaDir, 'skills', 'alpha-lore', 'SKILL.md'))).toBe(false)

      // ...and the base RP preset carries neither card's lore.
      const baseDir = join(home, '.agent-presets', 'rp')
      expect(existsSync(join(baseDir, 'skills', 'alpha-lore'))).toBe(false)
      expect(existsSync(join(baseDir, 'skills', 'beta-lore'))).toBe(false)
    } finally {
      await fiber.dispose()
    }
  })
})
