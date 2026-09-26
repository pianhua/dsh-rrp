import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isUiAssetName, isUiHtmlName, loadUiManifest, UI_MANIFEST_FILE } from '../src/card-ui.ts'
import { readCard, shippedCardRoot } from '../src/cards.ts'
import { renderCardContext } from '../src/card-types.ts'
import { registerCardUiRoute } from '../src/card-ui-route.ts'
import { RRP_ROUTES, type CardUiResponse } from '../src/route-contract.ts'
import { createDynamicField, emptyWorldState } from '../src/world-state.ts'
import {
  applyButtonPatch,
  readCharacters,
  readGaugeValue,
  readReferenceName,
  readTimeline,
  visiblePanels,
  type UiManifest,
} from '../src/ui-schema.ts'

/** Write one card directory with an optional ui/manifest.json. */
function cardDirWith(manifestText: string | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'rrp-ui-'))
  const card = join(dir, 'demo')
  mkdirSync(card, { recursive: true })
  writeFileSync(join(card, 'card.md'), '---\nid: demo\nname: 示例卡\n---\n\n正文。\n')
  if (manifestText !== null) {
    mkdirSync(join(card, 'ui'), { recursive: true })
    writeFileSync(join(card, 'ui', UI_MANIFEST_FILE), manifestText)
  }
  return card
}

const GOOD = JSON.stringify({
  version: 1,
  title: '客栈仪表盘',
  panels: [
    {
      id: 'warn',
      component: 'gauge',
      bind: 'trackedObjects.old-zhou.character.affinity',
      title: '好感',
      min: 0,
      max: 100,
    },
    {
      id: 'when-rich',
      component: 'gauge',
      bind: 'globalFields.wealth.value',
      when: 'globalFields.wealth.value >= 100',
    },
    {
      id: 'buttons',
      component: 'buttonRow',
      buttons: [{ label: '问管家', action: 'ask_copilot', question: '现在该做什么' }],
    },
  ],
})

describe('card UI manifest loader', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rrp-ui-root-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports absent for a plain card (the normal case, never an error)', () => {
    const card = cardDirWith(null)
    try {
      expect(loadUiManifest(card)).toEqual({ kind: 'absent' })
    } finally {
      rmSync(card, { recursive: true, force: true })
    }
  })

  it('resolves declarative when: strings into evaluable conditions', () => {
    const card = cardDirWith(GOOD)
    try {
      const loaded = loadUiManifest(card)
      expect(loaded.kind).toBe('ok')
      if (loaded.kind !== 'ok') return
      expect(loaded.manifest.layout).toBe('stack')
      expect(loaded.manifest.panels).toHaveLength(3)
      expect(loaded.manifest.panels[1]?.when).toMatchObject({ op: '>=', value: 100 })
    } finally {
      rmSync(card, { recursive: true, force: true })
    }
  })

  it('rejects malformed JSON, unknown keys and an empty panel list with a located message', () => {
    const cases: Array<[string, string]> = [
      ['{ not json', '不是合法 JSON'],
      [
        JSON.stringify({
          version: 1,
          panels: [{ id: 'a', component: 'gauge', bind: 'x', extra: 1 }],
        }),
        'extra',
      ],
      [JSON.stringify({ version: 1, panels: [] }), '校验失败'],
      [
        JSON.stringify({ version: 2, panels: [{ id: 'a', component: 'gauge', bind: 'x' }] }),
        'version',
      ],
    ]
    for (const [text, needle] of cases) {
      const card = cardDirWith(text)
      try {
        const loaded = loadUiManifest(card)
        expect(loaded.kind).toBe('error')
        if (loaded.kind === 'error') expect(loaded.error).toContain(needle)
      } finally {
        rmSync(card, { recursive: true, force: true })
      }
    }
  })

  it('fails closed on semantic problems zod cannot express', () => {
    const cases: Array<[unknown, string]> = [
      [
        {
          version: 1,
          panels: [
            { id: 'a', component: 'gauge', bind: 'x' },
            { id: 'a', component: 'timeline' },
          ],
        },
        '重复',
      ],
      [{ version: 1, panels: [{ id: 'a', component: 'gauge' }] }, '缺少 bind'],
      [{ version: 1, panels: [{ id: 'a', component: 'buttonRow' }] }, '没有任何按钮'],
      [
        { version: 1, panels: [{ id: 'a', component: 'gauge', bind: 'x', when: 'affinity ~ 3' }] },
        '运算符',
      ],
    ]
    for (const [manifest, needle] of cases) {
      const card = cardDirWith(JSON.stringify(manifest))
      try {
        const loaded = loadUiManifest(card)
        expect(loaded.kind).toBe('error')
        if (loaded.kind === 'error') expect(loaded.error).toContain(needle)
      } finally {
        rmSync(card, { recursive: true, force: true })
      }
    }
  })

  it('requires a card app panel to name a page that actually exists in ui/', () => {
    const cases: Array<[unknown, string]> = [
      [{ version: 1, panels: [{ id: 'a', component: 'app' }] }, '裸 *.html'],
      [{ version: 1, panels: [{ id: 'a', component: 'app', src: '../card.md' }] }, '裸 *.html'],
      [{ version: 1, panels: [{ id: 'a', component: 'app', src: 'ghost.html' }] }, '不存在'],
    ]
    for (const [manifest, needle] of cases) {
      const card = cardDirWith(JSON.stringify(manifest))
      try {
        const loaded = loadUiManifest(card)
        expect(loaded.kind).toBe('error')
        if (loaded.kind === 'error') expect(loaded.error).toContain(needle)
      } finally {
        rmSync(card, { recursive: true, force: true })
      }
    }

    const good = cardDirWith(
      JSON.stringify({ version: 1, panels: [{ id: 'a', component: 'app', src: 'panel.html' }] }),
    )
    try {
      mkdirSync(join(good, 'ui'), { recursive: true })
      writeFileSync(join(good, 'ui', 'panel.html'), '<b>x</b>')
      expect(loadUiManifest(good).kind).toBe('ok')
    } finally {
      rmSync(good, { recursive: true, force: true })
    }
  })

  it('caps the panel count so a HUD stays a glance', () => {
    const panels = Array.from({ length: 13 }, (_, i) => ({
      id: 'p' + String(i),
      component: 'timeline',
    }))
    const card = cardDirWith(JSON.stringify({ version: 1, panels }))
    try {
      const loaded = loadUiManifest(card)
      expect(loaded.kind).toBe('error')
      if (loaded.kind === 'error') expect(loaded.error).toContain('panels')
    } finally {
      rmSync(card, { recursive: true, force: true })
    }
  })

  it('validates the four action verbs and rejects duplicate labels', () => {
    const manifest = {
      version: 1,
      panels: [
        {
          id: 'row',
          component: 'buttonRow',
          buttons: [
            { label: 'A', action: 'ask_copilot', question: '?' },
            { label: 'A', action: 'ask_copilot', question: '!' },
          ],
        },
      ],
    }
    const card = cardDirWith(JSON.stringify(manifest))
    try {
      const loaded = loadUiManifest(card)
      expect(loaded.kind).toBe('error')
      if (loaded.kind === 'error') expect(loaded.error).toContain('label 重复')
    } finally {
      rmSync(card, { recursive: true, force: true })
    }

    const good = cardDirWith(
      JSON.stringify({
        version: 1,
        panels: [
          {
            id: 'row',
            component: 'buttonRow',
            buttons: [
              { label: 'send', action: 'send_message', trigger: '走吧' },
              {
                label: 'lore',
                action: 'draft_lore',
                entry: { name: 'x-lore', description: 'd', body: 'b' },
              },
            ],
          },
        ],
      }),
    )
    try {
      const loaded = loadUiManifest(good)
      expect(loaded.kind).toBe('ok')
      if (loaded.kind === 'ok') {
        expect(loaded.manifest.panels[0]?.buttons).toHaveLength(2)
        expect(loaded.manifest.panels[0]?.buttons?.[1]?.entry?.name).toBe('x-lore')
      }
    } finally {
      rmSync(good, { recursive: true, force: true })
    }
  })

  it('warns when a when: path is absent from the initial state', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const manifest = JSON.stringify({
      version: 1,
      panels: [
        {
          id: 'g',
          component: 'gauge',
          bind: 'globalFields.wealth.value',
          when: 'globalFields.wealth.value >= 10',
        },
      ],
    })
    const card = cardDirWith(manifest)
    try {
      loadUiManifest(card, emptyWorldState())
      expect(warn.mock.calls.some((args) => args.join(' ').includes('wealth'))).toBe(true)
    } finally {
      warn.mockRestore()
      rmSync(card, { recursive: true, force: true })
    }
  })
})

describe('card UI file guard', () => {
  it('accepts bare html names and rejects anything addressable outside ui/', () => {
    for (const ok of ['panel.html', 'a-b_1.2.html', 'X.html']) expect(isUiHtmlName(ok)).toBe(true)
    for (const bad of [
      '../card.md',
      'a/b.html',
      '/abs.html',
      '.hidden.html',
      'x.htm',
      '',
      'x.html.json',
      'x.HTML',
    ]) {
      expect(isUiHtmlName(bad)).toBe(false)
    }
  })

  it('accepts relative ui asset paths with whitelisted extensions', () => {
    for (const ok of ['panel.html', 'css/style.css', 'app.mjs', 'assets/icon.webp', 'font.woff2']) {
      expect(isUiAssetName(ok)).toBe(true)
    }
    for (const bad of [
      '../style.css',
      '/abs.css',
      'style\\back.css',
      'dir/../style.css',
      'style.exe',
      '.hidden.css',
      '',
    ]) {
      expect(isUiAssetName(bad)).toBe(false)
    }
  })
})

describe('UI panel resolution (shared by host preview and the client)', () => {
  const manifest: UiManifest = {
    version: 1,
    layout: 'grid',
    panels: [
      { id: 'late', component: 'timeline', order: 2 },
      {
        id: 'rich',
        component: 'gauge',
        bind: 'globalFields.wealth.value',
        when: { path: { kind: 'global-field', fieldId: 'wealth' }, op: '>=', value: 100 },
      },
      { id: 'first', component: 'relationTable', order: 1 },
    ],
  }

  it('hides unmet conditions and orders by order then id (no order sorts first)', () => {
    const state = {
      ...emptyWorldState(),
      globalFields: { wealth: createDynamicField('number', 50) },
    }
    expect(visiblePanels(manifest, state).map((p) => p.id)).toEqual(['first', 'late'])
    state.globalFields.wealth = createDynamicField('number', 500)
    expect(visiblePanels(manifest, state).map((p) => p.id)).toEqual(['rich', 'first', 'late'])
  })

  it('shows unconditional panels even before a world state exists', () => {
    expect(visiblePanels(manifest, null).map((p) => p.id)).toEqual(['first', 'late'])
    expect(visiblePanels(null, null)).toEqual([])
  })

  it('reads gauge numbers through the same path grammar as when:', () => {
    const state = {
      ...emptyWorldState(),
      globalFields: { wealth: createDynamicField('number', 12) },
    }
    expect(readGaugeValue('globalFields.wealth.value', state)).toBe(12)
    expect(
      readGaugeValue('trackedObjects.mia.character.affinity', {
        ...emptyWorldState(),
        trackedObjects: {
          mia: {
            id: 'mia',
            kind: 'character',
            name: '米娅',
            character: { affinity: 80 },
            fields: {},
          },
        },
      }),
    ).toBe(80)
    expect(
      readGaugeValue('trackedObjects.mia.character.emotionalState', {
        ...emptyWorldState(),
        trackedObjects: {
          mia: {
            id: 'mia',
            kind: 'character',
            name: '米娅',
            character: { emotionalState: '羞涩' },
            fields: {},
          },
        },
      }),
    ).toBeUndefined()
    expect(readGaugeValue('scene', state)).toBeUndefined()
    expect(readGaugeValue(undefined, state)).toBeUndefined()
  })
  it('reads v2 character, relation, and scene bindings without flat domains', () => {
    const state = {
      ...emptyWorldState(),
      trackedObjects: {
        mia: {
          id: 'mia',
          kind: 'character' as const,
          name: '米娅',
          character: { affinity: 80, emotionalState: '欣喜' },
          fields: { condition: createDynamicField('string', '在场') },
        },
        apartment: {
          id: 'apartment',
          kind: 'scene' as const,
          name: '公寓',
          fields: {
            location: createDynamicField('string', '门口'),
            time: createDynamicField('string', '清晨'),
          },
        },
      },
      relations: [
        {
          id: 'mia-player',
          a: { objectId: 'mia' },
          b: { external: { name: '玩家' } },
          labels: ['主仆'],
        },
      ],
    }
    expect(readCharacters(undefined, state).map((row) => row.name)).toEqual(['米娅'])
    expect(readCharacters('trackedObjects.mia', state)[0]?.state.character?.affinity).toBe(80)
    expect(readReferenceName(state.relations[0]!.a, state)).toBe('米娅')
    expect(readReferenceName(state.relations[0]!.b, state)).toBe('玩家')
    expect(readTimeline('apartment', state)).toEqual([
      { name: '公寓', fields: { location: '门口', time: '清晨' } },
    ])
  })

  it('applies only v2 correction patches', () => {
    const state = {
      ...emptyWorldState(),
      globalFields: { trust: createDynamicField('number', 1) },
    }
    const next = applyButtonPatch(state, {
      globalFields: { trust: createDynamicField('number', 2) },
    })
    expect(next.globalFields.trust?.value).toBe(2)
    expect(applyButtonPatch(state, { characters: { 米娅: { affinity: 80 } } })).toBe(state)
  })
})

describe('shipped card packs ship a valid UI', () => {
  // An official card with a broken manifest would log a warning on every boot
  // and show the player an empty Stage tab, so this is a release gate, not a
  // nicety: every bundled pack must validate, app pages included.
  const SHIPPED_WITH_UI = ['maid-heiress', 'yanmen-inn']

  for (const cardId of SHIPPED_WITH_UI) {
    it(cardId + ' declares a UI that loads clean', () => {
      const dir = join(shippedCardRoot(), cardId)
      expect(existsSync(join(dir, 'ui', UI_MANIFEST_FILE))).toBe(true)
      const loaded = loadUiManifest(dir, readCard(cardId, undefined)?.initialState ?? null)
      if (loaded.kind !== 'ok')
        throw new Error(
          'shipped card UI broke: ' + (loaded.kind === 'error' ? loaded.error : 'absent'),
        )
      const ids = loaded.manifest.panels.map((panel) => panel.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(loaded.manifest.panels.length).toBeGreaterThan(2)
    })
  }

  it('the maid console app page is shipped, and reaches nothing but the bridge', () => {
    const page = join(shippedCardRoot(), 'maid-heiress', 'ui', 'console.html')
    expect(existsSync(page)).toBe(true)
    const html = readFileSync(page, 'utf8')
    expect(html).toContain('window.rrp.onState')
    // No external assets: the injected CSP would refuse them anyway.
    expect(html).not.toMatch(/<script[^>]+src=/i)
    expect(html).not.toMatch(/<link[^>]+href=/i)
    // The only remote URL in the file is the deliberate network probe.
    const remote = [...html.matchAll(/https?:\/\/[a-z0-9.-]+/gi)].map((m) => m[0])
    expect(remote).toEqual(['https://example.com'])
  })
})

describe('card UI never enters the model context (prefix-cache sentinel)', () => {
  it('renders the card setting byte-for-byte without any UI vocabulary', () => {
    const rendered = renderCardContext({
      id: 'demo',
      name: '示例卡',
      persona: '基调：冷。',
      worldCore: '# 世界核心\n正文。',
    })
    expect(rendered).toBe(
      [
        '【当前卡包 · 设定基准】',
        '卡包：示例卡',
        '',
        '—— 世界核心 ——',
        '# 世界核心',
        '正文。',
        '',
        '—— 人设与规则 ——',
        '基调：冷。',
        '',
        '以上是本次游玩的既定设定，必须遵守；不要把它们当作正文输出。',
      ].join('\n'),
    )
    expect(rendered).not.toContain('ui')
    expect(rendered).not.toContain('面板')
  })
})

describe('/dsh-rrp/card-ui route', () => {
  let home: string
  let routes: Map<string, (req: unknown, res: unknown) => void>
  const originalHome = process.env.DSH_HOME

  const ctx = {
    // Keep the handler registered for the test body; the real host disposes it
    // through ctx.effect, which this fake deliberately does not exercise.
    effect: (fn: () => unknown) => {
      fn()
    },
    get: (name: string) =>
      name === 'webServer'
        ? {
            register: (route: { path: string; handler: (req: unknown, res: unknown) => void }) => {
              routes.set(route.path, route.handler)
              return () => undefined
            },
          }
        : undefined,
  } as never

  interface FakeResponse {
    statusCode: number
    headers: Record<string, string>
    contentType: string | undefined
    text: string | undefined
    setHeader(name: string, value: string): void
    getHeader(name: string): string | undefined
    end(body?: string | Buffer): void
  }

  function normalizeHeader(name: string): string {
    return name.toLowerCase()
  }

  function call(url: string): {
    status: number
    headers: Record<string, string>
    contentType?: string
    text?: string
    body: CardUiResponse
  } {
    const res: FakeResponse = {
      statusCode: 0,
      headers: {},
      contentType: undefined,
      text: undefined,
      setHeader(name, value) {
        const key = normalizeHeader(name)
        this.headers[key] = value
        if (key === 'content-type') this.contentType = value
      },
      getHeader(name) {
        return this.headers[normalizeHeader(name)]
      },
      end(body) {
        this.text = typeof body === 'string' ? body : undefined
      },
    }
    routes.get(RRP_ROUTES.cardUi)?.({ method: 'GET', url }, res)
    let parsed = {} as CardUiResponse
    if (res.text !== undefined) {
      try {
        parsed = JSON.parse(res.text) as CardUiResponse
      } catch {
        parsed = {} as CardUiResponse
      }
    }
    return {
      status: res.statusCode,
      headers: res.headers,
      contentType: res.contentType,
      text: res.text,
      body: parsed,
    }
  }

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'rrp-ui-home-'))
    process.env.DSH_HOME = home
    routes = new Map()
    registerCardUiRoute(ctx)
    const card = join(home, '.dsh-rrp', 'cards', 'demo')
    mkdirSync(join(card, 'ui'), { recursive: true })
    mkdirSync(join(card, 'ui', 'css'), { recursive: true })
    writeFileSync(join(card, 'card.md'), '---\nid: demo\nname: 示例卡\n---\n\n正文。\n')
    writeFileSync(join(card, 'ui', UI_MANIFEST_FILE), GOOD)
    writeFileSync(join(card, 'ui', 'panel.html'), '<b>hi</b>')
    writeFileSync(join(card, 'ui', 'css', 'style.css'), 'body{color:red}')
  })
  afterEach(() => {
    if (originalHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = originalHome
    rmSync(home, { recursive: true, force: true })
  })

  it('serves the validated manifest with conditions resolved', () => {
    const res = call(RRP_ROUTES.cardUi + '?card=demo')
    expect(res.status).toBe(200)
    const manifest = (res.body as { manifest?: UiManifest }).manifest
    expect(manifest?.panels).toHaveLength(3)
    expect(manifest?.panels[1]?.when).toBeDefined()
  })

  it('refuses unknown cards and every path outside ui/', () => {
    expect((call(RRP_ROUTES.cardUi + '?card=nope').body as { error?: string }).error).toBe(
      'unknown card',
    )
    expect(call(RRP_ROUTES.cardUi + '?card=demo&file=..%2Fcard.md').status).toBe(400)
    expect(
      call(RRP_ROUTES.cardUi + '?card=demo&file=' + encodeURIComponent('../panel.html')).status,
    ).toBe(400)
    expect(
      call(RRP_ROUTES.cardUi + '?card=demo&file=' + encodeURIComponent('/abs.html')).status,
    ).toBe(400)
    expect(
      call(RRP_ROUTES.cardUi + '?card=demo&file=' + encodeURIComponent('missing.html')).status,
    ).toBe(404)
    expect(
      call(RRP_ROUTES.cardUi + '?card=demo&file=' + encodeURIComponent('style.exe')).status,
    ).toBe(400)
  })

  it('serves a card HTML page as text/html', () => {
    const res = call(RRP_ROUTES.cardUi + '?card=demo&file=panel.html')
    expect(res.status).toBe(200)
    expect(res.contentType).toContain('text/html')
    expect(res.headers['access-control-allow-origin']).toBe('*')
    expect(res.headers['cache-control']).toBe('no-cache')
    expect(res.headers['etag']).toBeDefined()
    expect(res.text).toBe('<b>hi</b>')
  })

  it('serves nested ui assets with correct content types', () => {
    const res = call(RRP_ROUTES.cardUi + '?card=demo&file=' + encodeURIComponent('css/style.css'))
    expect(res.status).toBe(200)
    expect(res.contentType).toContain('text/css')
    expect(res.text).toBe('body{color:red}')
  })

  it('returns 304 when the ETag matches and 404 for directories', () => {
    const first = call(RRP_ROUTES.cardUi + '?card=demo&file=panel.html')
    expect(first.status).toBe(200)
    const etag = first.headers['etag']
    expect(etag).toBeDefined()
    const res: FakeResponse = {
      statusCode: 0,
      headers: {},
      contentType: undefined,
      text: undefined,
      setHeader(name, value) {
        const key = normalizeHeader(name)
        this.headers[key] = value
        if (key === 'content-type') this.contentType = value
      },
      getHeader(name) {
        return normalizeHeader(name) === 'if-none-match' ? etag : undefined
      },
      end(body) {
        this.text = typeof body === 'string' ? body : undefined
      },
    }
    routes.get(RRP_ROUTES.cardUi)?.(
      { method: 'GET', url: RRP_ROUTES.cardUi + '?card=demo&file=panel.html' },
      res,
    )
    expect(res.statusCode).toBe(304)

    const dir = call(RRP_ROUTES.cardUi + '?card=demo&file=' + encodeURIComponent('css'))
    expect(dir.status).toBe(404)
  })
})
