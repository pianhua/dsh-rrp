/**
 * dsh-rrp — native card packs (Stage 6).
 *
 * A card is a directory: `card.md` (frontmatter metadata + world core),
 * `openings/*.md` (in-world first messages), optional `state.json` (initial
 * WorldState), optional `skills/<id>/SKILL.md` (world knowledge, D7). This module
 * is the read side only: discovery + parsing, no HTTP, no database, no engine.
 *
 * Format spec: docs/reference/CARDS.md. Card roots (user first, then shipped):
 * `<dshHome>/.dsh-rrp/cards/` and this package's bundled `cards/`.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYAML } from 'yaml'
import { harnessHome } from './home.ts'
import { isCardId } from './preset-id.ts'
import { worldStateSchema } from './projection/world-state.ts'
import type { WorldState } from './world-state.ts'

/** The shipped card root (resolved against the bundled lib/index.js). */
const SHIPPED_CARDS_DIR = fileURLToPath(new URL('../cards/', import.meta.url))

/** A frontmatter scalar or one nesting level of string fields. */
export type FrontmatterValue = string | string[] | Record<string, string>
/** Parsed frontmatter. */
export type Frontmatter = Record<string, FrontmatterValue>

import type { CardMeta, CardOpening, CardPack, CardSkill } from './card-types.ts'

export type { CardMeta, CardOpening, CardPack, CardPlayer, CardSkill } from './card-types.ts'

/** Card roots, user override first. */
export function cardRoots(home: string = harnessHome()): string[] {
  return [join(home, '.dsh-rrp', 'cards'), SHIPPED_CARDS_DIR]
}

/** The shipped card root, for tests and tooling. */
export function shippedCardRoot(): string {
  return SHIPPED_CARDS_DIR
}

/** Coerce a frontmatter value to a string when possible. */
function asString(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/** Coerce a frontmatter value to a string array. */
function asArray(value: FrontmatterValue | undefined): string[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.length > 0) return [value]
  return []
}

/** Coerce a frontmatter value to a nested string record. */
function asObject(value: FrontmatterValue | undefined): Record<string, string> | undefined {
  return typeof value === 'object' && !Array.isArray(value) ? value : undefined
}


/**
 * Split a Markdown document into YAML-ish frontmatter and body.
 * @param raw - the file text.
 * @returns parsed frontmatter and the remaining body, or undefined without `---` fences.
 */
export function parseFrontmatter(raw: string): { data: Frontmatter; body: string } | undefined {
  const text = raw.replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/)
  if ((lines[0] ?? '').trim() !== '---') return undefined
  let close = -1
  for (let index = 1; index < lines.length; index += 1) {
    if ((lines[index] ?? '').trim() === '---') {
      close = index
      break
    }
  }
  if (close === -1) return undefined
  
  const yamlText = lines.slice(1, close).join('\n')
  try {
    // An empty/whitespace document parses to null: normalize any non-object
    // result so callers never dereference `data.name` on null.
    const parsed = parseYAML(yamlText) as unknown
    const data: Frontmatter = (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed))
      ? parsed as Frontmatter
      : {}
    return { data, body: lines.slice(close + 1).join('\n') }
  } catch {
    return undefined
  }
}

/**
 * Parse one `card.md`.
 * @param raw - the file text.
 * @returns metadata + persona + world core, or undefined when invalid.
 */
export function parseCardMarkdown(raw: string): { meta: CardMeta; persona: string; worldCore: string } | undefined {
  const parsed = parseFrontmatter(raw)
  if (parsed === undefined) return undefined
  const id = asString(parsed.data.id)
  const name = asString(parsed.data.name)
  if (id === undefined || !isCardId(id) || name === undefined || name.length === 0) return undefined
  const player = asObject(parsed.data.player)
  const meta: CardMeta = {
    id,
    name,
    tags: asArray(parsed.data.tags),
    opening: asString(parsed.data.opening) ?? 'default',
  }
  const summary = asString(parsed.data.summary)
  if (summary !== undefined) meta.summary = summary
  const version = asString(parsed.data.version)
  if (version !== undefined) meta.version = version
  const author = asString(parsed.data.author)
  if (author !== undefined) meta.author = author
  if (player !== undefined) {
    meta.player = { name: player.name ?? '你', ...(player.description === undefined ? {} : { description: player.description }) }
  }
  return { meta, persona: asString(parsed.data.persona) ?? '', worldCore: parsed.body.trim() }
}

/** Read every `openings/*.md`, default first. */
function readOpenings(dir: string): CardOpening[] {
  const root = join(dir, 'openings')
  if (!existsSync(root)) return []
  const out: CardOpening[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const body = readFileSync(join(root, entry.name), 'utf8').trim()
    if (body.length === 0) continue
    out.push({ id: entry.name.replace(/\.md$/, ''), body })
  }
  return out.sort((a, b) => (a.id === 'default' ? -1 : b.id === 'default' ? 1 : a.id.localeCompare(b.id)))
}

/** Read and validate the optional initial WorldState. */
function readInitialState(dir: string): WorldState | null {
  const file = join(dir, 'state.json')
  if (!existsSync(file)) return null
  try {
    const parsed = worldStateSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Read the skill directories bundled by a card. */
function readSkills(dir: string): CardSkill[] {
  const root = join(dir, 'skills')
  if (!existsSync(root)) return []
  const out: CardSkill[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const file = join(root, entry.name, 'SKILL.md')
    if (!existsSync(file)) continue
    const parsed = parseFrontmatter(readFileSync(file, 'utf8'))
    const skill: CardSkill = { id: entry.name, dir: join(root, entry.name) }
    if (parsed !== undefined) {
      const name = asString(parsed.data.name)
      const description = asString(parsed.data.description)
      if (name !== undefined) skill.name = name
      if (description !== undefined) skill.description = description
    }
    out.push(skill)
  }
  return out
}

/**
 * List card metadata across both roots (the gallery's read model). Read-only.
 * @param home - harness home override; defaults to DSH_HOME or ~/.dsh.
 * @returns one entry per visible card, user root first.
 */
export function listCards(home: string = harnessHome()): CardMeta[] {
  const out: CardMeta[] = []
  const seen = new Set<string>()
  for (const root of cardRoots(home)) {
    if (!existsSync(root)) continue
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isCardId(entry.name)) continue
      const file = join(root, entry.name, 'card.md')
      if (!existsSync(file)) continue
      try {
        const parsed = parseCardMarkdown(readFileSync(file, 'utf8'))
        if (parsed === undefined || parsed.meta.id !== entry.name || seen.has(parsed.meta.id)) continue
        seen.add(parsed.meta.id)
        out.push(parsed.meta)
      } catch {
        /* an unreadable card is skipped, never fatal */
      }
    }
  }
  return out
}

/**
 * Read one card by id (the start flow's read model).
 * @param id - card id, equal to its directory name.
 * @param home - harness home override; defaults to DSH_HOME or ~/.dsh.
 * @returns the parsed pack, or undefined when absent/invalid.
 */
export function readCard(id: string, home: string = harnessHome()): CardPack | undefined {
  if (!isCardId(id)) return undefined
  for (const root of cardRoots(home)) {
    const dir = join(root, id)
    const file = join(dir, 'card.md')
    if (!existsSync(file)) continue
    try {
      const parsed = parseCardMarkdown(readFileSync(file, 'utf8'))
      if (parsed === undefined || parsed.meta.id !== id) continue
      return {
        id,
        dir,
        meta: parsed.meta,
        persona: parsed.persona,
        worldCore: parsed.worldCore,
        openings: readOpenings(dir),
        initialState: readInitialState(dir),
        skills: readSkills(dir),
      }
    } catch {
      return undefined
    }
  }
  return undefined
}

/**
 * Materialize ONE card's world-knowledge skills into its own preset's skills
 * root. The card preset's skill-filesystem scans that root (bundledSkillDir), so
 * the model retrieves that card's lore by natural language instead of
 * context-stuffing — and no other card's lore is in scope.
 * Best-effort: an unreadable card or skill never breaks materialization.
 * @param dir - the materialized card preset directory.
 * @param cardId - the card whose skills are mounted.
 * @param home - harness home override; defaults to DSH_HOME or ~/.dsh.
 */
export function mountSkillsForCard(dir: string, cardId: string, home?: string): void {
  const card = readCard(cardId, home)
  if (card === undefined || card.skills.length === 0) return
  const root = join(dir, 'skills')
  mkdirSync(root, { recursive: true })
  for (const skill of card.skills) {
    try {
      cpSync(skill.dir, join(root, skill.id), { recursive: true, force: true })
    } catch {
      /* skip a skill that cannot be copied */
    }
  }
}
