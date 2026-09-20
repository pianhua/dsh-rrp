import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { AUTHOR_SYSTEM_PROMPT } from '../src/agents/author.ts'
import { PRESET_ID, ensureCardPreset, materializePreset, presetDir, removeAllPresets, removePreset } from '../src/preset.ts'

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
    // Issue #32: the Author prompt token is replaced with the real system prompt.
    expect(composition).not.toContain('__DSH_RRP_AUTHOR_PROMPT__')
    expect(composition).toContain('You are the Author Agent of DSH-Chronicle')
    expect(composition).toContain('## Output Discipline')
    expect(composition).toContain(AUTHOR_SYSTEM_PROMPT.split('\n')[0])
    // The materialized YAML must parse, and the deployed prefix must be
    // byte-identical to the single-source constant (issue #32).
    const doc = parseYaml(composition) as Array<{ id: string; config?: { prefix?: string } }>
    const persona = doc.find((entry) => entry.id === 'persona')
    expect(persona?.config?.prefix).toBe(AUTHOR_SYSTEM_PROMPT)
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

  it('ensureCardPreset materializes a missing card preset on demand', () => {
    const home = tempHome()
    const dir = presetDir(home, 'rp-maid-heiress')
    expect(existsSync(dir)).toBe(false)

    expect(ensureCardPreset('maid-heiress', home)).toBe('created')
    expect(existsSync(dir)).toBe(true)
    expect(existsSync(join(dir, 'skills', 'mia', 'SKILL.md'))).toBe(true)

    // Second call is a no-op; user-edited presets are left alone.
    expect(ensureCardPreset('maid-heiress', home)).toBe('exists')
    const composition = join(dir, 'agent.cordis.yml')
    writeFileSync(composition, readFileSync(composition, 'utf8') + '\n# user edit\n')
    expect(ensureCardPreset('maid-heiress', home)).toBe('left-user')

    // Illegal ids never touch the filesystem.
    expect(ensureCardPreset('../escape', home)).toBeUndefined()
  })
})
