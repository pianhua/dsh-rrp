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
import type { WorldState } from './world-state.ts'
import { UI_BUTTON_LIMIT, UI_PANEL_LIMIT, type UiManifest, type UiPanelDecl } from './ui-schema.ts'

/** The manifest's fixed filename inside a card's `ui/` directory. */
export const UI_MANIFEST_FILE = 'manifest.json'

const buttonSchema = z
  .object({
    label: z.string().min(1),
    action: z.enum(['correct_state', 'ask_copilot']),
    patch: z.record(z.string(), z.unknown()).optional(),
    question: z.string().min(1).optional(),
  })
  .strict()

const panelSchema = z
  .object({
    id: z.string().min(1),
    component: z.enum(['gauge', 'characterCard', 'relationTable', 'timeline', 'buttonRow', 'app']),
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
    panels: z.array(panelSchema).min(1).max(UI_PANEL_LIMIT),
  })
  .strict()

/** Where one card's UI stands. `absent` is the normal case for a plain card. */
export type UiLoadResult = { kind: 'absent' } | { kind: 'ok'; manifest: UiManifest } | { kind: 'error'; error: string }

/**
 * Load and validate one card directory's UI declaration.
 * @param cardDir - the resolved card directory (user root first, shipped fallback).
 */
export function loadUiManifest(cardDir: string, initialState: WorldState | null = null): UiLoadResult {
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
    return { kind: 'error', error: 'ui/' + UI_MANIFEST_FILE + ' 校验失败（' + where + reason + '）' }
  }

  const locator = '卡「' + cardDir.split(/[\\/]/).pop() + '」'
  const panels: UiPanelDecl[] = []
  const seen = new Set<string>()
  for (const panel of parsed.data.panels) {
    if (seen.has(panel.id)) return { kind: 'error', error: 'ui/' + UI_MANIFEST_FILE + '：panel id 重复「' + panel.id + '」' }
    seen.add(panel.id)
    if (panel.component === 'gauge' && panel.bind === undefined) {
      return { kind: 'error', error: 'ui/' + UI_MANIFEST_FILE + '：gauge 面板「' + panel.id + '」缺少 bind 数值路径' }
    }
    if (panel.component === 'buttonRow' && (panel.buttons === undefined || panel.buttons.length === 0)) {
      return { kind: 'error', error: 'ui/' + UI_MANIFEST_FILE + '：buttonRow 面板「' + panel.id + '」没有任何按钮' }
    }
    if (panel.component === 'app') {
      if (panel.src === undefined || !isUiHtmlName(panel.src)) {
        return { kind: 'error', error: 'ui/' + UI_MANIFEST_FILE + '：app 面板「' + panel.id + '」的 src 必须是 ui/ 下的裸 *.html 文件名' }
      }
      if (!existsSync(join(cardDir, 'ui', panel.src))) {
        return { kind: 'error', error: 'ui/' + UI_MANIFEST_FILE + '：app 面板「' + panel.id + '」指向的 ui/' + panel.src + ' 不存在' }
      }
    }
    const { when: whenRaw, ...rest } = panel
    const decl: UiPanelDecl = { ...rest }
    if (whenRaw !== undefined) {
      const condition = parseWhen(whenRaw, locator + ' ui 面板「' + panel.id + '」')
      if (condition instanceof Error) return { kind: 'error', error: 'ui/' + UI_MANIFEST_FILE + '：' + condition.message }
      decl.when = condition
      const warning = whenPathWarning(condition, initialState, locator + ' ui 面板「' + panel.id + '」')
      if (warning !== undefined) console.warn('[dsh-rrp] ' + warning)
    }
    panels.push(decl)
  }

  return {
    kind: 'ok',
    manifest: {
      version: 1,
      ...(parsed.data.title === undefined ? {} : { title: parsed.data.title }),
      layout: parsed.data.layout ?? 'stack',
      panels,
    },
  }
}

/** A card-authored UI page name: a bare `*.html` inside `ui/`, nothing else. */
export function isUiHtmlName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.html$/.test(name)
}
