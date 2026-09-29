import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AUTHOR_SYSTEM_PROMPT } from '../src/agents/author.ts'
import {
  PRESET_ID,
  activatePresetFamily,
  cleanupLegacyPresetCopies,
  cleanupPreset,
  presetDefinitionForCard,
  registerPresetFamily,
} from '../src/preset.ts'

const homes: string[] = []

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

function tempHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'dsh-rrp-preset-'))
  homes.push(home)
  return home
}

function fakeRegistry() {
  const definitions = new Map<string, { id: string; plugins: readonly unknown[] }>()
  return {
    definitions,
    register(definition: { id: string; plugins: readonly unknown[] }) {
      definitions.set(definition.id, definition)
      return Promise.resolve(async () => {
        definitions.delete(definition.id)
      })
    },
  }
}

describe('RP preset registry definitions', () => {
  it('preserves the shipped composition semantics without writing a preset directory', () => {
    const definition = presetDefinitionForCard()
    const persona = definition.plugins.find((row) => row.id === 'persona')
    const filesystem = definition.plugins.find((row) => row.id === 'skill-filesystem')

    expect(PRESET_ID).toBe('rp')
    expect(persona).toMatchObject({
      name: '@deepseek-ai/dsh-persona',
      config: {
        complete: true,
        includeRuntimeContext: false,
        prefix: AUTHOR_SYSTEM_PROMPT,
      },
    })
    expect(filesystem).toMatchObject({
      name: '@deepseek-ai/dsh-skill-filesystem',
      config: { bundledSkillDir: expect.stringContaining(join('presets', 'rp', 'skills')) },
    })
    expect(definition.plugins.map((row) => row.name)).toEqual([
      '@deepseek-ai/dsh-persona',
      '@deepseek-ai/dsh-skill-filesystem',
      '@deepseek-ai/dsh-tool-skill',
    ])
  })

  it('adds only the selected card skill root while retaining bundled steward skills', () => {
    const definition = presetDefinitionForCard('maid-heiress')
    const filesystem = definition.plugins.find((row) => row.id === 'skill-filesystem')
    const config = filesystem?.config as { bundledSkillDir?: string; customSkillDirs?: string[] }

    expect(config.bundledSkillDir).toContain(join('presets', 'rp', 'skills'))
    expect(config.customSkillDirs).toEqual([
      expect.stringContaining(join('cards', 'maid-heiress', 'skills')),
    ])
  })
})

describe('RP preset registration', () => {
  it('registers the base and visible card presets, then disposes every registration', async () => {
    const home = tempHome()
    const registry = fakeRegistry()
    const family = registerPresetFamily(registry, home)
    await family.ready

    expect([...registry.definitions.keys()]).toContain('rp')
    expect([...registry.definitions.keys()]).toContain('rp-maid-heiress')

    await family.dispose()
    expect(registry.definitions).toHaveLength(0)
  })

  it('registers a card added after plugin activation and disposes a removed card', async () => {
    const home = tempHome()
    const registry = fakeRegistry()
    const family = registerPresetFamily(registry, home)
    await family.ready

    const cardDir = join(home, '.dsh-rrp', 'cards', 'late-card')
    mkdirSync(join(cardDir, 'skills'), { recursive: true })
    writeFileSync(join(cardDir, 'card.md'), '---\nid: late-card\nname: Late Card\n---\n')
    await family.ensureCardPreset('late-card')
    expect(registry.definitions.has('rp-late-card')).toBe(true)

    rmSync(cardDir, { recursive: true, force: true })
    await family.ensureCardPreset('maid-heiress')
    expect(registry.definitions.has('rp-late-card')).toBe(false)
  })

  it('cleanupPreset disposes the active family registration', async () => {
    const home = tempHome()
    const registry = fakeRegistry()
    const family = activatePresetFamily(registry, home)
    await family.ready

    await expect(cleanupPreset()).resolves.toBe('disposed')
    expect(registry.definitions).toHaveLength(0)
  })
})

describe('legacy preset cleanup', () => {
  it('removes only unmodified RP-family copies with the dsh-rrp marker', () => {
    const home = tempHome()
    const legacy = join(home, '.agent-presets', 'rp')
    mkdirSync(legacy, { recursive: true })
    writeFileSync(join(legacy, '.dsh-rrp.json'), JSON.stringify({ managedBy: 'other', files: {} }))
    expect(cleanupLegacyPresetCopies(home)).toBe('left-user')
    expect(existsSync(legacy)).toBe(true)
  })
})
