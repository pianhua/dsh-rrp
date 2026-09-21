/**
 * dsh-rrp — client (browser) half.
 *
 * Registers the locale dictionaries and the WorldState right-sidebar tab.
 * Everything is a reversible effect tied to this plugin's fiber.
 */
import type { RrpClientContext } from './context-types.ts'
import { registerCopilotTab } from './copilot-tab.tsx'
import { registerGallery } from './gallery-panel.tsx'
import { registerWorldlineTab } from './worldline-tab.tsx'
import { registerStageTab } from './stage-tab.tsx'
import { registerLoreTab } from './lore-tab.tsx'
import { registerWorldStateTab } from './world-state-tab.tsx'

/** Bundle id. The client-modules compose keys on the package name dsh-rrp. */
export const name = 'dsh-rrp/client'

/** Client runtime services required before mounting.
 *  All entries are HOST capabilities the client composition declares; the
 *  panels still treat each one as optional at runtime (see context-types.ts):
 *  `sessions` / `remote` / `layout` absence degrades the gallery, never the
 *  sidebar tabs. */
// Cordis Remote proxies are namespaced: accessing ctx.remote.agentPresets
// requires declaring 'remote.agentPresets' (not just 'remote').
export const inject = [
  'slots',
  'sidebarRightTabs',
  'locale',
  'sessions',
  'remote',
  'remote.agentPresets',
  'layout',
  // Session navigation for 读档/开局跳转 (worldline map, gallery).
  'uiWorkspace',
]

const TAG = '[dsh-rrp]'

/** Locale namespace owned by this plugin; all UI copy goes through it. */
const LOCALE_NS = 'rrp'

import { LOCALE_EN, LOCALE_ZH } from './locales.ts'

/** Client plugin body. Registers only reversible effects. */
export function apply(ctx: RrpClientContext): void {
  ctx.effect(() => {
    console.log(`${TAG} client half active`)
    return () => {
      console.log(`${TAG} client half disposed`)
    }
  }, 'dsh-rrp: client lifecycle')

  ctx.effect(() => {
    const offZh = ctx.locale.register(LOCALE_NS, 'zh', LOCALE_ZH)
    const offEn = ctx.locale.register(LOCALE_NS, 'en', LOCALE_EN)
    return () => {
      offZh()
      offEn()
    }
  }, 'dsh-rrp: locale dictionaries')

  registerWorldStateTab(ctx)
  registerLoreTab(ctx)
  registerCopilotTab(ctx)
  registerGallery(ctx)
  registerWorldlineTab(ctx)
  registerStageTab(ctx)
}
