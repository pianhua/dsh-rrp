/**
 * dsh-rrp — the RP mode presets.
 *
 * DSH 0.2 registers agent presets directly with the host registry. The base RP
 * composition uses the package's bundled skills, while each card preset adds
 * that card's skills as a separate filesystem root so card knowledge stays
 * scoped without copying files into the host preset directory.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { listCards, readCard } from './cards.ts'
import { AUTHOR_SYSTEM_PROMPT } from './agents/author.ts'
import { harnessHome } from './home.ts'
import { BASE_PRESET_ID, belongsToRpPreset, isCardId, presetIdForCard } from './preset-id.ts'

/** Base preset id, also the default mode for cardless sessions. */
export const PRESET_ID = BASE_PRESET_ID

const MARKER_FILE = '.dsh-rrp.json'
const MANAGED_BY = 'dsh-rrp'
const SOURCE_DIR = fileURLToPath(new URL('../presets/rp/', import.meta.url))
const COMPOSITION_FILE = join(SOURCE_DIR, 'agent.cordis.yml')
const SKILL_DIR_TOKEN = '__DSH_RRP_SKILL_DIR__'
const AUTHOR_PROMPT_TOKEN = '__DSH_RRP_AUTHOR_PROMPT__'
const BUNDLED_SKILLS_DIR = join(SOURCE_DIR, 'skills')

/** A Cordis plugin row accepted by the host preset registry. */
export interface PresetPluginRow {
  readonly id?: string
  readonly name: string
  readonly config?: Record<string, unknown>
  readonly disabled?: unknown
}

/** The part of the host registry used by this plugin. */
export interface AgentPresetsRegistry {
  register(definition: PresetDefinition): Promise<() => Promise<void>>
  list(): Promise<readonly { id: string; broken?: string }[]>
  resolve(id?: string): Promise<{ id: string; name?: string; broken?: string }>
  standingKeyFor(id?: string): Promise<unknown>
}

/** Registration-only face used by the dynamic family controller. */
type PresetRegistryRegistration = Pick<AgentPresetsRegistry, 'register'>

/** Runtime definition submitted to `ctx.agentPresets.register`. */
export interface PresetDefinition {
  readonly id: string
  readonly name?: string
  readonly description?: string
  readonly order?: number
  readonly plugins: readonly PresetPluginRow[]
}

/** Outcome of one legacy preset-directory cleanup pass. */
export type LegacyCleanupOutcome = 'removed' | 'left-user' | 'absent'

/** Runtime family registration and its dynamic card-preset operations. */
export interface PresetFamilyRegistration {
  readonly ready: Promise<void>
  ensureCardPreset(cardId: string): Promise<'created' | 'exists' | 'left-user' | undefined>
  dispose(): Promise<void>
}

/** Build the RP composition for the base preset or one card. */
export function presetDefinitionForCard(
  cardId?: string,
  home: string = harnessHome(),
): PresetDefinition {
  const card = cardId === undefined ? undefined : readCard(cardId, home)
  const cardSkills = card === undefined ? undefined : join(card.dir, 'skills')
  const parsed = parseYaml(readFileSync(COMPOSITION_FILE, 'utf8')) as unknown
  if (!Array.isArray(parsed))
    throw new Error(`dsh-rrp: invalid RP composition at ${COMPOSITION_FILE}`)

  const plugins = parsed.map((row): PresetPluginRow => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      throw new Error(`dsh-rrp: invalid RP plugin row in ${COMPOSITION_FILE}`)
    }
    const source = row as {
      id?: string
      name?: string
      config?: Record<string, unknown>
      disabled?: unknown
    }
    if (typeof source.name !== 'string' || source.name.length === 0) {
      throw new Error(`dsh-rrp: RP plugin row has no name in ${COMPOSITION_FILE}`)
    }
    const config = source.config === undefined ? undefined : { ...source.config }
    if (config !== undefined) {
      if (config.bundledSkillDir === SKILL_DIR_TOKEN) config.bundledSkillDir = BUNDLED_SKILLS_DIR
      if (config.prefix === AUTHOR_PROMPT_TOKEN) config.prefix = AUTHOR_SYSTEM_PROMPT
      if (source.id === 'skill-filesystem' && cardSkills !== undefined && existsSync(cardSkills)) {
        config.customSkillDirs = [cardSkills]
      }
    }
    return {
      ...(source.id === undefined ? {} : { id: source.id }),
      name: source.name,
      ...(config === undefined ? {} : { config }),
      ...(source.disabled === undefined ? {} : { disabled: source.disabled }),
    }
  })

  return {
    id: cardId === undefined ? PRESET_ID : presetIdForCard(cardId),
    name: cardId === undefined ? 'DSH-Chronicle RP' : card?.meta.name,
    plugins,
  }
}

/** Serialize family mutations so late card imports cannot race selection. */
class PresetFamily implements PresetFamilyRegistration {
  readonly ready: Promise<void>
  private readonly disposers = new Map<string, () => Promise<void>>()
  private queue: Promise<void> = Promise.resolve()
  private disposed = false

  constructor(
    private readonly registry: PresetRegistryRegistration,
    private readonly home: string,
  ) {
    this.ready = this.enqueue(async () => {
      await this.register(presetDefinitionForCard(undefined, this.home))
      await this.syncCards()
    })
  }

  ensureCardPreset(cardId: string): Promise<'created' | 'exists' | 'left-user' | undefined> {
    if (!isCardId(cardId)) return Promise.resolve(undefined)
    return this.enqueue(async () => {
      if (this.disposed) return undefined
      const id = presetIdForCard(cardId)
      const existed = this.disposers.has(id)
      await this.syncCards()
      return this.disposers.has(id) ? (existed ? 'exists' : 'created') : undefined
    })
  }

  dispose(): Promise<void> {
    return this.enqueue(async () => {
      if (this.disposed) return
      this.disposed = true
      const entries = [...this.disposers.entries()].reverse()
      this.disposers.clear()
      for (const [, dispose] of entries) await dispose()
    })
  }

  private enqueue<Value>(operation: () => Promise<Value>): Promise<Value> {
    const result = this.queue.then(operation)
    this.queue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private async register(definition: PresetDefinition): Promise<'created' | 'exists'> {
    if (this.disposers.has(definition.id)) return 'exists'
    const dispose = await this.registry.register(definition)
    this.disposers.set(definition.id, dispose)
    return 'created'
  }

  private async syncCards(): Promise<void> {
    const visible = new Set(listCards(this.home).map((meta) => presetIdForCard(meta.id)))
    for (const [id, dispose] of [...this.disposers]) {
      if (id === PRESET_ID || visible.has(id)) continue
      this.disposers.delete(id)
      await dispose()
    }
    for (const meta of listCards(this.home)) {
      await this.register(presetDefinitionForCard(meta.id, this.home))
    }
  }
}

/** Register the base and currently visible card presets with the host registry. */
export function registerPresetFamily(
  registry: PresetRegistryRegistration,
  home: string = harnessHome(),
): PresetFamilyRegistration {
  return new PresetFamily(registry, home)
}

let activeFamily: PresetFamilyRegistration | undefined

/** Install the family used by card routes and imports for late card changes. */
export function activatePresetFamily(
  registry: PresetRegistryRegistration,
  home: string = harnessHome(),
): PresetFamilyRegistration {
  activeFamily = registerPresetFamily(registry, home)
  return activeFamily
}

/** Register a card preset after a card was imported or discovered. */
export function ensureCardPreset(
  cardId: string,
  _home?: string,
): Promise<'created' | 'exists' | 'left-user' | undefined> {
  return activeFamily?.ensureCardPreset(cardId) ?? Promise.resolve(undefined)
}

/** Dispose one host registration family, defaulting to the active family. */
export async function cleanupPreset(
  target?: PresetFamilyRegistration,
): Promise<'disposed' | 'absent'> {
  const family = target ?? activeFamily
  if (family === undefined) return 'absent'
  if (activeFamily === family) activeFamily = undefined
  await family.dispose()
  return 'disposed'
}

/** Every file under `root` as sorted POSIX relative paths. */
function walkFiles(root: string): string[] {
  const out: string[] = []
  const visit = (base: string): void => {
    const abs = base === '' ? root : join(root, base)
    let entries
    try {
      entries = readdirSync(abs, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const rel = base === '' ? entry.name : `${base}/${entry.name}`
      if (entry.isDirectory()) visit(rel)
      else if (entry.isFile()) out.push(rel)
    }
  }
  visit('')
  return out.sort()
}

/** Content hashes recorded by the old materializer, excluding its marker. */
function contentHashes(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rel of walkFiles(dir)) {
    if (rel === MARKER_FILE) continue
    try {
      out[rel] = createHash('sha256')
        .update(readFileSync(join(dir, rel)))
        .digest('hex')
    } catch {
      return {}
    }
  }
  return out
}

/** Parse a legacy dsh-rrp marker, or undefined when it is absent/foreign. */
function readMarker(dir: string): { files: Record<string, string> } | undefined {
  try {
    const parsed = JSON.parse(readFileSync(join(dir, MARKER_FILE), 'utf8')) as {
      managedBy?: string
      files?: Record<string, string>
    }
    if (parsed.managedBy === MANAGED_BY && parsed.files !== undefined)
      return { files: parsed.files }
  } catch {
    return undefined
  }
  return undefined
}

/** Whether a legacy copy is still byte-identical to the plugin's materialization. */
function isLegacyCopyUnmodified(dir: string): boolean {
  const marker = readMarker(dir)
  if (marker === undefined) return false
  const current = contentHashes(dir)
  const keys = Object.keys(marker.files)
  return (
    keys.length === Object.keys(current).length &&
    keys.every((key) => current[key] === marker.files[key])
  )
}

/** Remove unmodified RP-family directories left by pre-0.2.0 releases. */
export function cleanupLegacyPresetCopies(home: string = harnessHome()): LegacyCleanupOutcome {
  const root = join(home, '.agent-presets')
  if (!existsSync(root)) return 'absent'
  let sawFamily = false
  let removed = false
  let leftUser = false
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return 'absent'
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !belongsToRpPreset(entry.name)) continue
    sawFamily = true
    const dir = join(root, entry.name)
    if (!isLegacyCopyUnmodified(dir)) {
      leftUser = true
      continue
    }
    try {
      rmSync(dir, { recursive: true, force: true })
      removed = true
    } catch {
      leftUser = true
    }
  }
  if (leftUser) return 'left-user'
  return sawFamily && removed ? 'removed' : sawFamily ? 'left-user' : 'absent'
}
