import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PRESET_ID, materializePreset, presetDir, removeAllPresets, removePreset } from '../src/preset.ts'

const homes: string[] = []

function tempHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'dsh-rrp-preset-'))
  homes.push(home)
  return home
}

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

describe('RP preset materialization', () => {
  it('writes the shipped preset and its skill bundles into the user root', () => {
    const home = tempHome()
    const outcome = materializePreset(home)

    expect(outcome.action).toBe('created')
    expect(outcome.dir).toBe(presetDir(home))
    expect(PRESET_ID).toBe('rp')

    const composition = readFileSync(join(outcome.dir, 'agent.cordis.yml'), 'utf8')
    expect(composition).toContain('@deepseek-ai/dsh-persona')
    expect(composition).toContain('@deepseek-ai/dsh-skill-filesystem')
    expect(composition).toContain('@deepseek-ai/dsh-tool-skill')
    expect(composition).not.toContain('__DSH_RRP_SKILL_DIR__')
    expect(composition).toContain(join(outcome.dir, 'skills'))
    expect(existsSync(join(outcome.dir, 'preset.yml'))).toBe(true)
    expect(existsSync(join(outcome.dir, 'skills'))).toBe(true)

    expect(removePreset(home)).toBe('removed')
    expect(existsSync(outcome.dir)).toBe(false)
  })

  it('refreshes its own unmodified copy but never a user edit', () => {
    const home = tempHome()
    materializePreset(home)
    expect(materializePreset(home).action).toBe('refreshed')

    const target = join(presetDir(home), 'agent.cordis.yml')
    writeFileSync(target, readFileSync(target, 'utf8') + '\n# user edit\n')

    expect(materializePreset(home).action).toBe('left-user')
    expect(removePreset(home)).toBe('left-user')
    expect(existsSync(target)).toBe(true)
  })

  it("materializes one scoped preset per card with only that card's skills", () => {
    const home = tempHome()
    const outcome = materializePreset(home)

    const card = outcome.cards?.find((entry) => entry.dir === presetDir(home, 'rp-maid-heiress'))
    expect(card).toBeDefined()
    // The card preset's composition points at its OWN skills root...
    const composition = readFileSync(join(card!.dir, 'agent.cordis.yml'), 'utf8')
    expect(composition).toContain(join(card!.dir, 'skills'))
    // ...which holds this card's bundles...
    expect(existsSync(join(card!.dir, 'skills', 'mia', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(card!.dir, 'skills', 'world-setting', 'SKILL.md'))).toBe(true)
    // ...and the base preset carries NO card lore.
    expect(existsSync(join(outcome.dir, 'skills', 'mia'))).toBe(false)

    // Uninstall-style cleanup removes the whole family.
    expect(removeAllPresets(home)).toBe('removed')
    expect(existsSync(card!.dir)).toBe(false)
  })

  it('is a no-op when nothing was materialized', () => {
    const home = tempHome()
    expect(removePreset(home)).toBe('absent')
  })
})
