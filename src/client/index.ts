/**
 * dsh-rrp — client (browser) half.
 *
 * Registers the locale dictionaries and the WorldState right-sidebar tab.
 * Everything is a reversible effect tied to this plugin's fiber.
 */
import type { RrpClientContext } from './context-types.ts'
import { registerGallery } from './gallery-panel.tsx'
import { registerSedimentTab } from './sediment-tab.tsx'
import { registerWorldStateTab } from './world-state-tab.tsx'

/** Bundle id. The client-modules compose keys on the package name dsh-rrp. */
export const name = 'dsh-rrp/client'

/** Client runtime services required before mounting. */
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
  'uiConversation',
]

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
  'section.coreState': '核心状态',
  'section.dynamicFields': '自定义字段',
  'preset.hint': '本会话的 Agent 预设（rp-<卡包>），与「设置 → Agent 预设」里的全局默认不同',
  'chronicler.running': '纪事官推演中，请稍候...',
  'chronicler.completed': '纪事官已更新状态',
  noSession: '当前没有会话',
  'world.missing': '尚未建立世界状态，先开一局或手动添加。',
  'activity.title': '最近变更',
  'activity.none': '尚无变更记录',
  'activity.running': '纪事官正在推演…',
  'actor.chronicler': '纪事官',
  'actor.summarizer': '大局编年',
  'actor.player': '你',
  'phase.committed': '已更新状态',
  'phase.corrected': '已就地矫正',
  'phase.failed': '推演失败',
  'phase.stale': '推演已作废',
  'actor.card': '卡包',
  'actor.scribe': '典籍编纂',
  'sediment.title': '典籍',
  'sediment.guide': '把剧情里确立的新设定沉淀为本会话专属的知识；只新增、可审阅、可删除。',
  'sediment.topicPlaceholder': '想沉淀什么？（可留空）',
  'sediment.draft': '沉淀最近的新设定',
  'sediment.drafting': '编纂中…',
  'sediment.staged': '已生成草稿，等待确认',
  'sediment.confirm': '确认写入',
  'sediment.discard': '丢弃',
  'sediment.discarded': '已丢弃草稿',
  'sediment.confirmHint': '确认后本会话下一轮即可按需检索',
  'sediment.written': '已沉淀',
  'sediment.empty': '本会话还没有沉淀任何设定',
  'sediment.removed': '已删除',
  'sediment.delete': '删除',
  'sediment.failed': '操作失败',
  'sediment.noDraft': '目前没有待确认草稿',
  'gallery.title': '卡片展厅',
  'gallery.reload': '刷新',
  'gallery.loading': '加载中…',
  'gallery.empty': '没有找到卡包',
  'gallery.pick': '从左侧选择一张卡包，查看它的开场白与设定',
  'gallery.search': '搜索卡包…',
  'gallery.nomatch': '没有匹配的卡包',
  'gallery.player': '玩家角色',
  'gallery.skills': '世界知识',
  'gallery.opening': '开场白',
  'gallery.start': '开始这一局',
  'gallery.starting': '正在建立会话…',
  'gallery.started': '已开始，切回对话',
  'gallery.failed': '操作失败',
  'gallery.unavailable': '会话服务不可用',
  'gallery.workspace': '工作区',
  'gallery.workspaceUngrouped': '未分组',
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
  'section.coreState': 'Core State',
  'section.dynamicFields': 'Dynamic Fields',
  'preset.hint': "This session's agent preset (rp-<card>); distinct from the global default in Settings",
  'chronicler.running': 'Chronicler is working, please wait...',
  'chronicler.completed': 'Chronicler updated state',
  noSession: 'No active session',
  'world.missing': 'No world state yet — start a story or add entries manually.',
  'activity.title': 'Recent changes',
  'activity.none': 'No changes recorded yet',
  'activity.running': 'Chronicler is inferring…',
  'actor.chronicler': 'Chronicler',
  'actor.summarizer': 'Summarizer',
  'actor.player': 'You',
  'phase.committed': 'updated state',
  'phase.corrected': 'corrected in place',
  'phase.failed': 'inference failed',
  'phase.stale': 'inference stale',
  'actor.card': 'Card',
  'actor.scribe': 'Scribe',
  'sediment.title': 'Lore',
  'sediment.guide': 'Sediment newly established lore into this session only; add-only, reviewable, deletable.',
  'sediment.topicPlaceholder': 'What to sediment? (optional)',
  'sediment.draft': 'Sediment recent lore',
  'sediment.drafting': 'Drafting…',
  'sediment.staged': 'Draft staged — waiting for review',
  'sediment.confirm': 'Confirm write',
  'sediment.discard': 'Discard',
  'sediment.discarded': 'Draft discarded',
  'sediment.confirmHint': 'Effective in this session from the next turn',
  'sediment.written': 'Written',
  'sediment.empty': 'No sedimented lore in this session yet',
  'sediment.removed': 'Removed',
  'sediment.delete': 'Delete',
  'sediment.failed': 'Failed',
  'sediment.noDraft': 'No draft awaiting review',
  'gallery.title': 'Card Gallery',
  'gallery.reload': 'Refresh',
  'gallery.loading': 'Loading…',
  'gallery.empty': 'No cards found',
  'gallery.pick': 'Pick a card on the left to preview its opening and setting',
  'gallery.search': 'Search cards…',
  'gallery.nomatch': 'No matching cards',
  'gallery.player': 'Player',
  'gallery.skills': 'World knowledge',
  'gallery.opening': 'Opening',
  'gallery.start': 'Start this story',
  'gallery.starting': 'Creating session…',
  'gallery.started': 'Started — switch back to the chat',
  'gallery.failed': 'Failed',
  'gallery.unavailable': 'Session service unavailable',
  'gallery.workspace': 'Workspace',
  'gallery.workspaceUngrouped': 'Ungrouped',
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
  registerSedimentTab(ctx)
  registerGallery(ctx)
}
