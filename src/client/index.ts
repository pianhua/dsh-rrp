/**
 * dsh-rrp — client (browser) half.
 *
 * Registers the locale dictionaries and the WorldState right-sidebar tab.
 * Everything is a reversible effect tied to this plugin's fiber.
 */
import type { RrpClientContext } from './context-types.ts'
import { registerWorldStateTab } from './world-state-tab.tsx'

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
  editHint: '就地修改下面的字段并保存；下一轮执笔以最新切面为准（无锁矫正）。',
  save: '保存矫正',
  saving: '保存中…',
  saved: '已保存，下一轮起笔生效',
  saveFailed: '保存失败',
  unsaved: '未保存',
  add: '添加',
  remove: '删除',
  name: '名称',
  'field.affinity': '好感',
  'field.mood': '情绪',
  'field.appearance': '外貌',
  'field.condition': '状态',
  'field.quantity': '数量',
  'field.note': '备注',
  'flag.key': '事件',
  'flag.value': '值',
  'section.scene': '场景',
  'section.characters': '角色',
  'section.inventory': '物品',
  'section.flags': '事件与秘密',
  'scene.location': '地点',
  'scene.time': '时间',
  'scene.weather': '天气',
  noSession: '当前没有会话',
  'activity.title': '最近变更',
  'activity.none': '尚无变更记录',
  'activity.running': '纪事官正在推演…',
  'actor.chronicler': '纪事官',
  'actor.summarizer': '大局编年',
  'actor.player': '你',
  'phase.committed': '已更新状态',
  'phase.corrected': '已就地矫正',
  'phase.failed': '推演失败',
}

const EN: Record<string, string> = {
  title: 'World State',
  'guide.description': 'View and correct characters, inventory, scene, and flags',
  editHint: 'Edit fields in place and save. The next turn uses the newest slice (no locks).',
  save: 'Save correction',
  saving: 'Saving…',
  saved: 'Saved — effective next turn',
  saveFailed: 'Save failed',
  unsaved: 'unsaved',
  add: 'Add',
  remove: 'Remove',
  name: 'Name',
  'field.affinity': 'Affinity',
  'field.mood': 'Mood',
  'field.appearance': 'Appearance',
  'field.condition': 'Condition',
  'field.quantity': 'Qty',
  'field.note': 'Note',
  'flag.key': 'Flag',
  'flag.value': 'Value',
  'section.scene': 'Scene',
  'section.characters': 'Characters',
  'section.inventory': 'Inventory',
  'section.flags': 'Events & secrets',
  'scene.location': 'Place',
  'scene.time': 'Time',
  'scene.weather': 'Weather',
  noSession: 'No active session',
  'activity.title': 'Recent changes',
  'activity.none': 'No changes recorded yet',
  'activity.running': 'Chronicler is inferring…',
  'actor.chronicler': 'Chronicler',
  'actor.summarizer': 'Summarizer',
  'actor.player': 'You',
  'phase.committed': 'updated state',
  'phase.corrected': 'corrected in place',
  'phase.failed': 'inference failed',
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
