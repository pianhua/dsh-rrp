import { gunzipSync } from 'node:zlib'

/** The normalized interchange shape consumed by card-pack writing. */
export interface ImportedCardSource {
  name: string
  /** Tavern `description` + `scenario` — becomes the card body (world core). */
  worldCore: string
  /** Tavern `personality` + `mes_example` — becomes the frontmatter persona. */
  persona: string
  /** Tavern `first_mes` — becomes openings/default.md. */
  firstMessage: string
  tags: string[]
  creator?: string
}

/** Expand the two tavern placeholders our model does not know. */
function expandPlaceholders(text: string, charName: string): string {
  return text.replaceAll('{{char}}', charName).replaceAll('{{user}}', '你')
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(value.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0)),
  ].slice(0, 8)
}

/**
 * Normalize one parsed character-card JSON (V2 top level or V3 `data`).
 * Returns undefined when there is no usable character in it.
 */
export function normalizeCharacterCard(parsed: unknown): ImportedCardSource | undefined {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
  const root = parsed as Record<string, unknown>
  const data =
    root.spec === 'chara_card_v3' && root.data !== null && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : root
  const name = asText(data.name)
  if (name.length === 0) return undefined

  const description = asText(data.description)
  const scenario = asText(data.scenario)
  const worldCore = [description, scenario.length > 0 ? '【情境】\n' + scenario : '']
    .filter((part) => part.length > 0)
    .join('\n\n')
  const personality = asText(data.personality)
  const examples = asText(data.mes_example)
  const persona = [
    personality,
    examples.length > 0 ? '示例对话（学习文风，勿照抄）：\n' + examples : '',
  ]
    .filter((part) => part.length > 0)
    .join('\n\n')
  const creator = asText(data.creator) || asText(root.creator)

  return {
    name,
    worldCore: expandPlaceholders(worldCore, name),
    persona: expandPlaceholders(persona, name),
    firstMessage: expandPlaceholders(asText(data.first_mes), name),
    tags: asTags(data.tags),
    ...(creator.length > 0 ? { creator } : {}),
  }
}

/** Parse a raw character-card JSON document (V2 or V3). */
export function importCardFromJson(text: string): ImportedCardSource | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  return normalizeCharacterCard(parsed)
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * Scan a PNG for uncompressed `tEXt` chunks (keyword\0text), ignoring CRC.
 * Returns undefined when the bytes are not a PNG at all.
 */
export function pngTextChunks(buffer: Buffer): Map<string, string> | undefined {
  if (buffer.length < 12 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return undefined
  const chunks = new Map<string, string>()
  let offset = 8
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const dataStart = offset + 8
    if (dataStart + length > buffer.length) break
    if (type === 'tEXt') {
      const data = buffer.subarray(dataStart, dataStart + length)
      const nul = data.indexOf(0)
      if (nul > 0) {
        chunks.set(data.toString('latin1', 0, nul), data.toString('latin1', nul + 1))
      }
    }
    offset = dataStart + length + 4 // + CRC
  }
  return chunks
}

/** Gunzip tolerating host variants; undefined when the bytes are not gzip. */
function gunzip(buffer: Buffer): string | undefined {
  try {
    return gunzipSync(buffer).toString('utf8')
  } catch {
    return undefined
  }
}

/** Parse a Tavern character-card PNG (ccv3 / chara / ccv2 tEXt chunks). */
export function importCardFromPng(buffer: Buffer): ImportedCardSource | undefined {
  const chunks = pngTextChunks(buffer)
  if (chunks === undefined) return undefined
  const candidates = [chunks.get('ccv3'), chunks.get('chara'), chunks.get('ccv2')]
  for (const candidate of candidates) {
    if (candidate === undefined) continue
    let jsonText: string | undefined
    try {
      const decoded = Buffer.from(candidate, 'base64')
      jsonText = gunzip(decoded) ?? decoded.toString('utf8')
    } catch {
      continue
    }
    if (jsonText === undefined) continue
    const source = importCardFromJson(jsonText)
    if (source !== undefined) return source
  }
  return undefined
}

/** Derive a canonical card id from the character name; '' when nothing usable. */
export function cardIdFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug
}
