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
  'guide.description': '查看并就地矫正角色、物品、场景与事件',
  editHint: '直接编辑下方状态并保存；下一轮执笔会以最新切面为准（无锁矫正）。',
  save: '保存矫正',
  saving: '保存中…',
  saved: '已保存，下一轮起笔生效',
  saveFailed: '保存失败',
  invalidJson: 'JSON 格式不合法',
  noSession: '当前没有会话',
}

const EN: Record<string, string> = {
  title: 'World State',
  'guide.description': 'View and correct characters, inventory, scene, and flags',
  editHint: 'Edit the state and save. The next turn draws from the newest slice (no locks).',
  save: 'Save correction',
  saving: 'Saving…',
  saved: 'Saved — effective next turn',
  saveFailed: 'Save failed',
  invalidJson: 'Invalid JSON',
  noSession: 'No active session',
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
