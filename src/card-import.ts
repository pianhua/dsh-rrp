/**
 * dsh-rrp — character-card import entry point (issue #31 P1-D).
 *
 * Parsing and normalization live in card-import-parse.ts and stay re-exported
 * here for existing callers. This module owns user-card writes and preset
 * materialization.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stringify as stringifyYaml } from 'yaml'
import { cardRoots } from './cards.ts'
import { harnessHome } from './home.ts'
import { ensureCardPreset } from './preset.ts'
import { isCardId } from './preset-id.ts'
import { cardIdFromName, type ImportedCardSource } from './card-import-parse.ts'

export {
  cardIdFromName,
  importCardFromJson,
  importCardFromPng,
  normalizeCharacterCard,
  pngTextChunks,
} from './card-import-parse.ts'
export type { ImportedCardSource } from './card-import-parse.ts'

/** First free `<base>` / `<base>-2` / … under every card root. */
function uniqueCardId(base: string, home: string): string | undefined {
  for (let attempt = 1; attempt <= 99; attempt += 1) {
    const id = attempt === 1 ? base : base + '-' + String(attempt)
    if (!isCardId(id)) return undefined
    const taken = cardRoots(home).some((root) => existsSync(join(root, id)))
    if (!taken) return id
  }
  return undefined
}

export interface ImportWriteResult {
  id: string
  name: string
}

/**
 * Write one imported card into the USER card root and materialize its preset
 * so it is playable immediately. Returns undefined when no safe id exists.
 */
export function writeImportedCard(
  source: ImportedCardSource,
  home: string = harnessHome(),
): ImportWriteResult | undefined {
  const base = cardIdFromName(source.name) || 'imported'
  const id = uniqueCardId(base, home)
  if (id === undefined) return undefined
  const dir = join(cardRoots(home)[0] as string, id)
  mkdirSync(join(dir, 'openings'), { recursive: true })

  const frontmatter: Record<string, unknown> = {
    id,
    name: source.name,
    opening: 'default',
  }
  if (source.tags.length > 0) frontmatter.tags = source.tags
  if (source.creator !== undefined) frontmatter.author = source.creator
  const summary =
    source.worldCore
      .split('\n')
      .find((line) => line.trim().length > 0)
      ?.trim() ?? ''
  if (summary.length > 0) frontmatter.summary = summary.slice(0, 60)
  if (source.persona.length > 0) frontmatter.persona = source.persona

  const cardMd =
    '---\n' +
    stringifyYaml(frontmatter).trimEnd() +
    '\n---\n\n' +
    (source.worldCore.length > 0 ? source.worldCore + '\n' : '')
  writeFileSync(join(dir, 'card.md'), cardMd, 'utf8')
  if (source.firstMessage.length > 0) {
    writeFileSync(join(dir, 'openings', 'default.md'), source.firstMessage + '\n', 'utf8')
  }
  ensureCardPreset(id, home)
  return { id, name: source.name }
}
