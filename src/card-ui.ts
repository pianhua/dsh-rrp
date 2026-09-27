/**
 * dsh-rrp — the card UI loader (issue #18, L1): host-side only.
 *
 * Reads a card's authored `ui/manifest.json`, validates it, and resolves the
 * declarative `when:` strings into conditions the client can evaluate. A bad
 * manifest is never fatal: the card still plays, the Stage tab stays empty, and
 * the author gets one loud error naming the file — same posture as a skill with
 * a broken `when:`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { parseWhen, whenPathWarning } from './lore-condition.ts'
import { validateLoreEntry } from './lore-state.ts'
import type { WorldState } from './world-state.ts'
import {
  UI_ACTION_KINDS,
  UI_BUTTON_LIMIT,
  UI_COMPONENT_KINDS,
  UI_PANEL_LIMIT,
  type UiButtonDecl,
  type UiManifest,
  type UiPanelDecl,
} from './ui-schema.ts'

/** The manifest's fixed filename inside a card's `ui/` directory. */
export const UI_MANIFEST_FILE = 'manifest.json'

const buttonSchema = z
  .object({
    label: z.string().min(1),
    action: z.enum(UI_ACTION_KINDS),
    patch: z.record(z.string(), z.unknown()).optional(),
    question: z.string().min(1).optional(),
    trigger: z.string().min(1).optional(),
    entry: z.unknown().optional(),
  })
  .strict()

const panelSchema = z
  .object({
    id: z.string().min(1),
    // The closed sets come from ui-schema.ts, so a new component there is
    // accepted here by construction instead of by memory.
    component: z.enum(UI_COMPONENT_KINDS),
    title: z.string().optional(),
    bind: z.string().min(1).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    when: z.string().min(1).optional(),
    buttons: z.array(buttonSchema).max(UI_BUTTON_LIMIT).optional(),
    src: z.string().min(1).max(80).optional(),
    order: z.number().int().optional(),
    span: z.union([z.literal(1), z.literal(2)]).optional(),
  })
  .strict()

const manifestSchema = z
  .object({
    version: z.literal(1),
    title: z.string().optional(),
    layout: z.enum(['stack', 'grid']).optional(),
    theme: z.record(z.string(), z.string()).optional(),
    panels: z.array(panelSchema).min(1).max(UI_PANEL_LIMIT),
    assetRefs: z.array(z.string().min(1)).max(64).optional(),
  })
  .strict()

/** Where one card's UI stands. `absent` is the normal case for a plain card. */
export type UiLoadResult =
  { kind: 'absent' } | { kind: 'ok'; manifest: UiManifest } | { kind: 'error'; error: string }

/**
 * Load and validate one card directory's UI declaration.
 * @param cardDir - the resolved card directory (user root first, shipped fallback).
 */
export function loadUiManifest(
  cardDir: string,
  initialState: WorldState | null = null,
): UiLoadResult {
  const file = join(cardDir, 'ui', UI_MANIFEST_FILE)
  if (!existsSync(file)) return { kind: 'absent' }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    return { kind: 'error', error: 'ui/' + UI_MANIFEST_FILE + ' 不是合法 JSON：' + String(error) }
  }
  const parsed = manifestSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const where = first === undefined ? '' : first.path.join('.') + '：'
    const reason = first === undefined ? '未知错误' : first.message
    return {
      kind: 'error',
      error: 'ui/' + UI_MANIFEST_FILE + ' 校验失败（' + where + reason + '）',
    }
  }

  const locator = '卡「' + cardDir.split(/[\\/]/).pop() + '」'
  const panels: UiPanelDecl[] = []
  const seenIds = new Set<string>()
  const seenLabels = new Set<string>()
  for (const panel of parsed.data.panels) {
    if (seenIds.has(panel.id))
      return {
        kind: 'error',
        error: 'ui/' + UI_MANIFEST_FILE + '：panel id 重复「' + panel.id + '」',
      }
    seenIds.add(panel.id)
    if (panel.component === 'gauge' && panel.bind === undefined) {
      return {
        kind: 'error',
        error: 'ui/' + UI_MANIFEST_FILE + '：gauge 面板「' + panel.id + '」缺少 bind 数值路径',
      }
    }
    if (
      panel.component === 'buttonRow' &&
      (panel.buttons === undefined || panel.buttons.length === 0)
    ) {
      return {
        kind: 'error',
        error: 'ui/' + UI_MANIFEST_FILE + '：buttonRow 面板「' + panel.id + '」没有任何按钮',
      }
    }
    if (panel.component === 'app') {
      if (panel.src === undefined || !isUiHtmlName(panel.src)) {
        return {
          kind: 'error',
          error:
            'ui/' +
            UI_MANIFEST_FILE +
            '：app 面板「' +
            panel.id +
            '」的 src 必须是 ui/ 下的裸 *.html 文件名',
        }
      }
      if (!existsSync(join(cardDir, 'ui', panel.src))) {
        return {
          kind: 'error',
          error:
            'ui/' +
            UI_MANIFEST_FILE +
            '：app 面板「' +
            panel.id +
            '」指向的 ui/' +
            panel.src +
            ' 不存在',
        }
      }
    }
    const buttons: UiButtonDecl[] = []
    for (const button of panel.buttons ?? []) {
      if (seenLabels.has(button.label)) {
        return {
          kind: 'error',
          error: 'ui/' + UI_MANIFEST_FILE + '：按钮 label 重复「' + button.label + '」',
        }
      }
      seenLabels.add(button.label)
      if (button.action === 'correct_state') {
        if (button.patch === undefined || typeof button.patch !== 'object' || button.patch === null)
          return {
            kind: 'error',
            error:
              'ui/' +
              UI_MANIFEST_FILE +
              '：按钮「' +
              button.label +
              '」的 correct_state 必须带 patch 对象',
          }
      } else if (button.action === 'ask_copilot') {
        if (typeof button.question !== 'string' || button.question.length === 0)
          return {
            kind: 'error',
            error:
              'ui/' +
              UI_MANIFEST_FILE +
              '：按钮「' +
              button.label +
              '」的 ask_copilot 必须带 question',
          }
      } else if (button.action === 'send_message') {
        if (typeof button.trigger !== 'string' || button.trigger.length === 0)
          return {
            kind: 'error',
            error:
              'ui/' +
              UI_MANIFEST_FILE +
              '：按钮「' +
              button.label +
              '」的 send_message 必须带 trigger',
          }
      } else if (button.action === 'draft_lore') {
        const entry =
          button.entry !== undefined && button.entry !== null && typeof button.entry === 'object'
            ? (button.entry as Record<string, unknown>)
            : undefined
        const validated = validateLoreEntry(entry, [], [])
        if (!validated.ok)
          return {
            kind: 'error',
            error:
              'ui/' +
              UI_MANIFEST_FILE +
              '：按钮「' +
              button.label +
              '」的 draft_lore entry 不合法：' +
              validated.error,
          }
        buttons.push({
          label: button.label,
          action: button.action,
          entry: validated.skill,
        })
        continue
      }
      buttons.push(button as UiButtonDecl)
    }
    const { when: whenRaw, ...rest } = panel
    const decl: UiPanelDecl = { ...rest, buttons }
    if (whenRaw !== undefined) {
      const condition = parseWhen(whenRaw, locator + ' ui 面板「' + panel.id + '」')
      if (condition instanceof Error)
        return { kind: 'error', error: 'ui/' + UI_MANIFEST_FILE + '：' + condition.message }
      decl.when = condition
      const warning = whenPathWarning(
        condition,
        initialState,
        locator + ' ui 面板「' + panel.id + '」',
      )
      if (warning !== undefined) console.warn('[dsh-rrp] ' + warning)
    }
    panels.push(decl)
  }

  if (parsed.data.assetRefs !== undefined) {
    for (const ref of parsed.data.assetRefs) {
      if (!isUiAssetName(ref))
        return {
          kind: 'error',
          error: 'ui/' + UI_MANIFEST_FILE + '：assetRefs 包含非法路径「' + ref + '」',
        }
      if (!existsSync(join(cardDir, 'ui', ref)))
        return {
          kind: 'error',
          error: 'ui/' + UI_MANIFEST_FILE + '：assetRefs 指向的文件不存在「' + ref + '」',
        }
    }
  }

  return {
    kind: 'ok',
    manifest: {
      version: 1,
      ...(parsed.data.title === undefined ? {} : { title: parsed.data.title }),
      layout: parsed.data.layout ?? 'stack',
      ...(parsed.data.theme === undefined ? {} : { theme: parsed.data.theme }),
      panels,
    },
  }
}

/** A card-authored UI page name: a bare `*.html` inside `ui/`, nothing else. */
export function isUiHtmlName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.html$/.test(name)
}

const UI_ASSET_EXTENSIONS = new Set([
  '.html',
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.mp3',
])

/** Whether a relative path stays inside the card's `ui/` directory. */
function isSafeUiRelativePath(rel: string): boolean {
  if (rel.length === 0) return false
  if (rel.startsWith('/') || rel.includes('\\') || rel.includes(':')) return false
  const normalized = rel.replace(/\\/g, '/')
  for (const segment of normalized.split('/')) {
    if (segment === '..' || segment === '' || segment.startsWith('.')) return false
  }
  if (normalized.includes('/../') || normalized.startsWith('../')) return false
  return true
}

/**
 * A card-authored UI asset path: a relative path under `ui/` with an allowed
 * extension. Kept for the old bare-HTML call sites.
 */
export function isUiAssetName(name: string): boolean {
  if (!isSafeUiRelativePath(name)) return false
  const ext = ('.' + name.split('.').pop()?.toLowerCase()) as string
  return UI_ASSET_EXTENSIONS.has(ext)
}
