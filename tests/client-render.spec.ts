/**
 * Panel render tests — the state→markup path the registration spec cannot reach.
 *
 * No DOM stack is introduced: every panel takes its host hooks as plain props
 * (`useProjection` / `useSessions`), so React's server renderer drives the same
 * component tree in vitest's node environment. Effects never run under SSR,
 * which is also the point — the fetch-pending state must render an honest
 * placeholder instead of crashing or leaking an untranslated key.
 */
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as client from '../src/client/index.ts'
import { CARD_KEY } from '../src/card-types.ts'
import { SUMMARY_KEY, type MacroSummary } from '../src/macro-summary.ts'
import { RRP_LORE_KEY, type LoreEntry } from '../src/lore-state.ts'
import { WORLD_STATE_KEY, type WorldState } from '../src/world-state.ts'
import { filterWorldState } from '../src/world-state-visibility.ts'

/** Marker the fake translator stamps on a key the dictionary does not answer. */
const MISSING = '«missing:'

type Registration = {
  options: {
    name?: string
    key?: string
    id?: string
    inject?: (...args: unknown[]) => Record<string, unknown>
  }
  component: unknown
}

/** Mount the client half against a recording context; returns what it registered. */
function mount() {
  const dictionaries: Record<string, Record<string, Record<string, string>>> = {}
  const registrations: Registration[] = []
  const ctx = {
    effect(fn: () => (() => void) | void) {
      return fn()
    },
    slots: {
      register(options: Registration['options'], component: unknown) {
        registrations.push({ options, component })
        return () => {}
      },
      inject(_key: string, callback: () => () => void) {
        return callback()
      },
    },
    sidebarRightTabs: {
      register() {
        return () => {}
      },
    },
    locale: {
      register(ns: string, lang: string, dict: Record<string, string>) {
        const byLang = (dictionaries[ns] ??= {})
        Object.assign((byLang[lang] ??= {}), dict)
        return () => {}
      },
      // zh is what the panels see here; an unanswered key is made loud.
      bind(ns: string) {
        return (key: string) => dictionaries[ns]?.zh?.[key] ?? MISSING + ns + '.' + key + '»'
      },
    },
    get() {
      return undefined
    },
    sessions: {
      create: async () => 'session-1',
      open() {},
      binding: () => undefined,
    },
    remote: { agentPresets: { select: async () => ({ ok: true }) } },
    layout: { selectPanel() {} },
    uiWorkspace: { current: () => undefined },
  }
  client.apply(ctx as never)
  return { registrations, dictionaries }
}

/** Render one registered panel, feeding it host data through its props. */
function render(
  registrations: Registration[],
  locate: (options: Registration['options']) => boolean,
  projections: Record<string, unknown>,
): string {
  const found = registrations.find((entry) => locate(entry.options))
  expect(found?.component).toBeDefined()
  const injected = found?.options.inject?.('session-1') ?? {}
  return renderToStaticMarkup(
    createElement(found?.component as never, {
      useProjection: (key: string) => projections[key],
      useSessions: () => undefined,
      ...injected,
    }),
  )
}

const STATE: WorldState = {
  version: 2,
  trackedObjects: {
    player: {
      id: 'player',
      kind: 'character',
      name: '玩家',
      isPlayer: true,
      character: { presence: 'present' },
      fields: {},
    },
    mia: {
      id: 'mia',
      kind: 'character',
      name: '米娅',
      character: { presence: 'present', emotionalState: '强作镇定', appearance: '女仆装沾着雨渍' },
      fields: {
        affinity: { type: 'number', value: 8, definition: 'card-defined' },
        hunger: { type: 'string', value: '饥饿', definition: 'undeclared' },
      },
    },
    inn: {
      id: 'inn',
      kind: 'scene',
      name: '客栈大堂',
      fields: {
        location: { type: 'string', value: '客栈大堂', definition: 'card-defined' },
        time: { type: 'string', value: '子夜', definition: 'undeclared' },
        weather: { type: 'string', value: '大雪', definition: 'undeclared' },
      },
    },
  },
  globalFields: {
    sealed: { type: 'boolean', value: true, definition: 'undeclared' },
    封关余日: { type: 'number', value: 3, min: 0, max: 30, definition: 'undeclared' },
  },
  objectives: [
    {
      id: 'find-key',
      owners: [{ objectId: 'player' }],
      desiredOutcome: '查明封关真相',
      status: 'active',
      primary: true,
    },
  ],
  conflicts: [
    {
      id: 'sealed',
      parties: [{ objectId: 'player' }, { objectId: 'mia' }],
      stakes: '后窖的锁',
      pressure: '管家的隐瞒',
      status: 'active',
    },
  ],
  cognition: [
    {
      id: 'belief',
      character: { objectId: 'mia' },
      proposition: '玩家知道后窖',
      markers: ['suspected'],
    },
  ],
  relations: [
    {
      id: 'player-mia',
      a: { objectId: 'player' },
      b: { objectId: 'mia' },
      labels: ['主仆'],
      aToB: { attitude: '信任' },
      bToA: { attitude: '警惕' },
    },
  ],
  currentEvents: [
    {
      id: 'sealed-event',
      type: 'secret',
      fact: '地窖被封',
      relatedObjects: [{ objectId: 'inn' }],
      status: 'active',
    },
  ],
}

const LORE: LoreEntry[] = [
  { name: 'back-cellar', description: '后窖的锁', body: '后窖钥匙只有一把，由管家保管。' },
]

const SUMMARY: MacroSummary = {
  goal: '查明封关真相',
  conflict: '管家的隐瞒',
  turningPoints: ['地窖被封'],
  threads: ['铜钥匙的下落'],
}

describe('client panels render their state', () => {
  it('WorldState: every domain row and the dynamic field reach the markup', () => {
    const { registrations } = mount()
    const html = render(registrations, (o) => o.id === 'dsh-rrp/world-state', {
      [WORLD_STATE_KEY]: STATE,
      [CARD_KEY]: null,
      [SUMMARY_KEY]: SUMMARY,
    })
    for (const probe of [
      '米娅',
      '强作镇定',
      '后窖的锁',
      '客栈大堂',
      '子夜',
      '地窖被封',
      '主仆',
      '查明封关真相',
      '世界状态',
    ]) {
      expect(html).toContain(probe)
    }
    expect(html).toContain('上下文体积')
    expect(html).not.toContain(MISSING)
  })

  it('WorldState: does not invent an affinity field when the character has none', () => {
    const { registrations } = mount()
    const stateWithoutAffinity = {
      ...STATE,
      trackedObjects: {
        ...STATE.trackedObjects,
        mia: { ...STATE.trackedObjects.mia!, character: { presence: 'present' }, fields: {} },
      },
    }
    const html = render(registrations, (o) => o.id === 'dsh-rrp/world-state', {
      [WORLD_STATE_KEY]: stateWithoutAffinity,
    })
    expect(html).not.toContain('好感')
  })

  it('WorldState: hidden values are absent from player markup', () => {
    const { registrations } = mount()
    const hiddenInternal: WorldState = {
      ...STATE,
      trackedObjects: {
        ...STATE.trackedObjects,
        secret: {
          id: 'secret',
          kind: 'character',
          name: '幕后秘密',
          visibility: 'hidden',
          fields: {
            code: {
              type: 'string',
              value: '秘密文本',
              definition: 'card-defined',
              visibility: 'hidden',
            },
          },
        },
      },
    }
    const hidden = filterWorldState(hiddenInternal, 'player')
    const html = render(registrations, (o) => o.id === 'dsh-rrp/world-state', {
      [WORLD_STATE_KEY]: hidden,
    })
    expect(html).toContain('部分世界信息不公开')
    expect(html).not.toContain('幕后秘密')
    expect(html).not.toContain('秘密文本')
  })

  it('WorldState: no world state yet still renders the panel, not a crash', () => {
    const { registrations } = mount()
    const html = render(registrations, (o) => o.id === 'dsh-rrp/world-state', {})
    expect(html).toContain('世界状态')
    expect(html).not.toContain('剧情脉络')
    expect(html).not.toContain(MISSING)
  })

  it('设定集: a confirmed entry shows its name and description', () => {
    const { registrations } = mount()
    const html = render(registrations, (o) => o.key === 'dsh-rrp/lore', { [RRP_LORE_KEY]: LORE })
    expect(html).toContain('back-cellar')
    expect(html).toContain('后窖的锁')
    expect(html).not.toContain(MISSING)
  })

  it('月停 / 展厅 / 世界线 / 舞台: the pending state is a clean placeholder', () => {
    const { registrations } = mount()
    const panels: Array<[string, Record<string, unknown>]> = [
      ['dsh-rrp/copilot', {}],
      ['dsh-rrp/chronicle', {}],
      ['dsh-rrp/worldline', {}],
      ['dsh-rrp/stage', { [CARD_KEY]: null }],
    ]
    for (const [key, projections] of panels) {
      const html = render(registrations, (o) => o.key === key || o.id === key, projections)
      expect(html.length).toBeGreaterThan(0)
      expect(html).not.toContain(MISSING)
    }
  })

  it('the zh and en dictionaries stay key-for-key in sync', () => {
    const { dictionaries } = mount()
    const zh = Object.keys(dictionaries.rrp?.zh ?? {}).sort()
    const en = Object.keys(dictionaries.rrp?.en ?? {}).sort()
    expect(en).toEqual(zh)
    expect(zh.length).toBeGreaterThan(80)
  })
})
