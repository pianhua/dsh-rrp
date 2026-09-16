/**
 * dsh-rrp — client (browser) half.
 *
 * Registers the locale dictionaries and the WorldState right-sidebar tab.
 * Everything is a reversible effect tied to this plugin's fiber.
 */
import type { RrpClientContext } from './context-types.ts'
import { registerWorldStateTab } from './world-state-tab.ts'

/** Bundle id. The client-modules compose keys on the package name dsh-rrp. */
export const name = 'dsh-rrp/client'

/** Client runtime services required before mounting. */
export const inject = ['slots', 'sidebarRightTabs', 'locale']

const TAG = '[dsh-rrp]'

/** Locale namespace owned by this plugin; all UI copy goes through it. */
const LOCALE_NS = 'rrp'

const ZH: Record<string, string> = {
  title: '世界状态',
  'guide.description': '查看角色、物品、场景与事件',
  'section.characters': '角色',
  'section.inventory': '物品',
  'section.scene': '场景',
  'section.flags': '事件',
  empty: '本会话暂无世界状态',
}

const EN: Record<string, string> = {
  title: 'World State',
  'guide.description': 'Characters, inventory, scene, and flags',
  'section.characters': 'Characters',
  'section.inventory': 'Inventory',
  'section.scene': 'Scene',
  'section.flags': 'Flags',
  empty: 'No world state in this session yet',
}

/** Client plugin body. Registers only reversible effects. */
export function apply(ctx: RrpClientContext): void {
  ctx.effect(() => {
    console.log(`${TAG} client half active`)
    return () => {
      console.log(`${TAG} client half disposed`)
    }
  }, 'dsh-rrp: client lifecycle')

  ctx.effect(() => {
    const offZh = ctx.locale.register(LOCALE_NS, 'zh', ZH)
    const offEn = ctx.locale.register(LOCALE_NS, 'en', EN)
    return () => {
      offZh()
      offEn()
    }
  }, 'dsh-rrp: locale dictionaries')

  registerWorldStateTab(ctx)
}
