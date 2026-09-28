// @vitest-environment happy-dom
import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CardPackPlayerView } from '../src/card-types.ts'
import { GalleryPanel } from '../src/client/gallery-panel.tsx'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const CARD_ONE: CardPackPlayerView = {
  id: 'one',
  meta: {
    id: 'one',
    name: '一号卡',
    summary: '第一张卡的简介',
    tags: ['校园', '日常'],
    opening: 'first',
    author: '作者甲',
    version: '1.0',
    cover: 'ui/assets/cover.png',
    player: { name: '玩家甲', description: '一位旅人' },
  },
  persona: '',
  worldCore: '',
  openings: [
    { id: 'first', body: '第一开场 {{player.name}}' },
    { id: 'second', body: '第二开场 {{player.name}}' },
  ],
  initialState: null,
  skills: [{ id: 'skill-one', name: '校园常识', description: '基础知识' }],
}

const CARD_TWO: CardPackPlayerView = {
  id: 'two',
  meta: {
    id: 'two',
    name: '二号卡',
    summary: '第二张卡的简介',
    tags: ['冒险'],
    opening: 'default',
  },
  persona: '',
  worldCore: '',
  openings: [{ id: 'default', body: '第二卡开场' }],
  initialState: null,
  skills: [],
}

const META = [CARD_ONE.meta, CARD_TWO.meta]

async function flushEffects(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('GalleryPanel cover wall and details', () => {
  let root: Root | undefined
  let container: HTMLDivElement | undefined

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    if (root !== undefined) act(() => root?.unmount())
    container?.remove()
    root = undefined
    container = undefined
  })

  function renderPanel(
    overrides: {
      cards?: typeof META
      loadCard?: (id: string) => Promise<CardPackPlayerView | undefined>
      start?: ReturnType<typeof vi.fn>
    } = {},
  ): void {
    const cards = overrides.cards ?? META
    root?.render(
      createElement(GalleryPanel, {
        t: (key: string) => key,
        loadList: async () => cards,
        loadCard:
          overrides.loadCard ?? (async (id: string) => (id === 'one' ? CARD_ONE : CARD_TWO)),
        start: overrides.start,
      }),
    )
  }

  it('renders the cover wall with a routed cover image and a placeholder without cover', async () => {
    await act(async () => renderPanel())
    await flushEffects()

    const images = container?.querySelectorAll('img') ?? []
    expect(images).toHaveLength(1)
    expect(images[0]?.getAttribute('src')).toBe('/dsh-rrp/card-ui/one/ui/assets/cover.png')
    expect(container?.textContent).toContain('一号卡')
    expect(container?.textContent).toContain('二号卡')
  })

  it('falls back to the gradient placeholder when the cover image errors', async () => {
    await act(async () => renderPanel())
    await flushEffects()

    const image = container?.querySelector('img')
    expect(image).toBeDefined()
    await act(async () => image?.dispatchEvent(new Event('error')))
    expect(container?.querySelector('img')).toBeNull()
    expect(container?.querySelector('[data-gallery-cover-placeholder]')?.textContent).toContain(
      '一',
    )
  })

  it('opens the detail panel in Hero, opening, skills, player, start order', async () => {
    await act(async () => renderPanel())
    await flushEffects()
    const card = Array.from(container?.querySelectorAll('button') ?? []).find((entry) =>
      entry.textContent?.includes('一号卡'),
    )
    expect(card).toBeDefined()
    await act(async () => card?.click())
    await flushEffects()

    const detail = container?.querySelector('[aria-label="gallery.details"]')
    expect(detail).toBeDefined()
    const text = detail?.textContent ?? ''
    expect(text.indexOf('一号卡')).toBeGreaterThanOrEqual(0)
    expect(text.indexOf('gallery.opening')).toBeGreaterThan(text.indexOf('一号卡'))
    expect(text.indexOf('gallery.skills')).toBeGreaterThan(text.indexOf('gallery.opening'))
    expect(text.indexOf('gallery.player')).toBeGreaterThan(text.indexOf('gallery.skills'))
    expect(text.indexOf('gallery.start')).toBeGreaterThan(text.indexOf('gallery.player'))
    expect(detail?.querySelector('img')?.getAttribute('src')).toBe(
      '/dsh-rrp/card-ui/one/ui/assets/cover.png',
    )
  })

  it('closes the detail panel with its close button or Escape', async () => {
    await act(async () => renderPanel())
    await flushEffects()
    const card = Array.from(container?.querySelectorAll('button') ?? []).find((entry) =>
      entry.textContent?.includes('一号卡'),
    )
    await act(async () => card?.click())
    await flushEffects()
    const close = container?.querySelector(
      'button[aria-label="gallery.close"]',
    ) as HTMLButtonElement | null
    expect(close).not.toBeNull()
    await act(async () => close?.click())
    expect(container?.querySelector('[aria-label="gallery.details"]')).toBeNull()

    await act(async () => card?.click())
    await flushEffects()
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(container?.querySelector('[aria-label="gallery.details"]')).toBeNull()
  })

  it('has no player override input or persona textarea', async () => {
    await act(async () => renderPanel())
    await flushEffects()
    const card = Array.from(container?.querySelectorAll('button') ?? []).find((entry) =>
      entry.textContent?.includes('一号卡'),
    )
    await act(async () => card?.click())
    await flushEffects()

    expect(container?.querySelector('textarea')).toBeNull()
    expect(container?.querySelector('[aria-label="gallery.playerName"]')).toBeNull()
    expect(container?.querySelector('[aria-label="gallery.playerPersona"]')).toBeNull()
    expect(container?.textContent).toContain('gallery.playerReadOnly')
  })

  it('changes the opening preview from the multi-opening select', async () => {
    await act(async () => renderPanel())
    await flushEffects()
    const card = Array.from(container?.querySelectorAll('button') ?? []).find((entry) =>
      entry.textContent?.includes('一号卡'),
    )
    await act(async () => card?.click())
    await flushEffects()

    const select = container?.querySelector('select') as HTMLSelectElement | null
    expect(select).not.toBeNull()
    await act(async () => {
      if (select === null) return
      select.value = 'second'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(container?.querySelector('blockquote')?.textContent).toBe('第二开场 玩家甲')
  })

  it('filters by search and keeps the selected detail open across refresh', async () => {
    const loadList = vi
      .fn<() => Promise<typeof META>>()
      .mockResolvedValueOnce(META)
      .mockResolvedValue(META)
    await act(async () => {
      root?.render(
        createElement(GalleryPanel, {
          t: (key: string) => key,
          loadList,
          loadCard: async (id: string) => (id === 'one' ? CARD_ONE : CARD_TWO),
        }),
      )
    })
    await flushEffects()

    const searchButton = container?.querySelector(
      'button[aria-label="gallery.search"]',
    ) as HTMLButtonElement | null
    await act(async () => searchButton?.click())
    const input = container?.querySelector(
      'input[aria-label="gallery.search"]',
    ) as HTMLInputElement | null
    expect(input).not.toBeNull()
    await act(async () => {
      if (input === null) return
      const setNativeValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set
      setNativeValue?.call(input, '二号')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(container?.textContent).toContain('二号卡')
    expect(container?.textContent).not.toContain('第一张卡的简介')

    const second = Array.from(container?.querySelectorAll('button') ?? []).find((entry) =>
      entry.textContent?.includes('二号卡'),
    )
    await act(async () => second?.click())
    await flushEffects()
    const reloadButton = container?.querySelector(
      'button[aria-label="gallery.reload"]',
    ) as HTMLButtonElement | null
    await act(async () => reloadButton?.click())
    await flushEffects()
    expect(container?.querySelector('[aria-label="gallery.details"]')?.textContent).toContain(
      '二号卡',
    )
    expect(loadList).toHaveBeenCalledTimes(2)
  })

  it('starts with the card and opening id only, never override arguments', async () => {
    const start = vi.fn(async () => ({ ok: true }))
    await act(async () => renderPanel({ start }))
    await flushEffects()
    const card = Array.from(container?.querySelectorAll('button') ?? []).find((entry) =>
      entry.textContent?.includes('一号卡'),
    )
    await act(async () => card?.click())
    await flushEffects()
    const startButton = Array.from(container?.querySelectorAll('button') ?? []).find(
      (entry) => entry.textContent === 'gallery.start',
    )
    await act(async () => startButton?.click())
    await flushEffects()
    expect(start).toHaveBeenCalledWith(CARD_ONE, '')
    expect(start.mock.calls[0]).toHaveLength(2)
  })
})
