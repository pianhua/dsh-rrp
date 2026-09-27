// @vitest-environment happy-dom
import { act } from 'react'
import { createElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CARD_KEY, type CardContext } from '../src/card-types.ts'
import { StagePanel, type StageApi, __clearStageManifestCache } from '../src/client/stage-tab.tsx'
import { RRP_SETTINGS_KEY } from '../src/settings.ts'
import { WORLDLINE_DIGEST_KEY } from '../src/worldline-digest.ts'
import { WORLD_STATE_KEY, emptyWorldState } from '../src/world-state.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const CARD: CardContext = {
  id: 'demo-card',
  name: 'Demo Card',
  persona: '',
  worldCore: '',
}

const MANIFEST = {
  version: 1 as const,
  layout: 'grid' as const,
  panels: [
    { id: 'g', component: 'gauge' as const, bind: 'globalFields.x.value', title: 'X' },
    {
      id: 'b',
      component: 'buttonRow' as const,
      buttons: [
        { label: '问', action: 'ask_copilot' as const, question: '?' },
        { label: '发', action: 'send_message' as const, trigger: 'hi' },
      ],
    },
  ],
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function renderElement(
  card: CardContext | null,
  overrides: {
    manifest?: typeof MANIFEST | null | 'error'
    settings?: { allowSendMessage: boolean }
    inputActions?: { setDraft: ReturnType<typeof vi.fn>; submit: ReturnType<typeof vi.fn> }
    delay?: number
  } = {},
): ReactElement {
  const projections: Record<string, unknown> = {
    [CARD_KEY]: card,
    [WORLD_STATE_KEY]: {
      ...emptyWorldState(),
      globalFields: { x: { type: 'number', value: 5, definition: 'card-defined' as const } },
    },
    [WORLDLINE_DIGEST_KEY]: { turns: [{ prose: 'tail' }] },
    [RRP_SETTINGS_KEY]: overrides.settings ?? { allowSendMessage: true },
  }
  const result =
    overrides.manifest === 'error'
      ? new Error('network')
      : overrides.manifest === undefined
        ? MANIFEST
        : overrides.manifest
  const api: StageApi = {
    loadManifest: async () => {
      if (overrides.delay !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, overrides.delay))
      }
      if (result instanceof Error) return Promise.reject(result)
      return result
    },
    correctState: async () => {},
    askCopilot: () => {},
    sendMessage: async () => {},
    draftLore: async () => {},
    forget: () => {},
  }
  return createElement(StagePanel, {
    t: (key: string) => key,
    sessionId: 'session-1',
    api,
    useProjection: (key: string) => projections[key],
    inputActions: overrides.inputActions ?? { setDraft: vi.fn(), submit: vi.fn() },
  })
}

describe('StagePanel states', () => {
  let root: Root | undefined
  let container: HTMLDivElement | undefined

  beforeEach(() => {
    __clearStageManifestCache()
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

  it('shows a skeleton while the manifest loads', async () => {
    await act(async () => root?.render(renderElement(CARD, { manifest: null, delay: 100 })))
    expect(container?.querySelector('[data-rrp-skeleton]')).toBeDefined()
  })

  it('shows an error card with retry when the manifest fails', async () => {
    await act(async () => root?.render(renderElement(CARD, { manifest: 'error' })))
    await flushEffects()
    expect(container?.textContent).toContain('stage.loadFailed')
    expect(container?.textContent).toContain('stage.retry')
    // Detail is collapsed by default; expand it to verify the message is present.
    const showDetail = Array.from(container?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent === 'stage.showDetail',
    )
    expect(showDetail).toBeDefined()
    await act(async () => showDetail?.click())
    expect(container?.textContent).toContain('network')
  })

  it('shows empty guidance when the card declares no UI', async () => {
    await act(async () => root?.render(renderElement(CARD, { manifest: null, delay: 0 })))
    await flushEffects()
    expect(container?.textContent).toContain('stage.noUi')
  })

  it('renders visible L1 panels when the manifest loads', async () => {
    await act(async () => root?.render(renderElement(CARD)))
    await flushEffects()
    expect(container?.textContent).toContain('X')
    expect(container?.textContent).toContain('5')
    expect(container?.textContent).toContain('问')
    expect(container?.textContent).toContain('发')
  })

  it('disables send_message and explains why when RP settings turn it off', async () => {
    const inputActions = { setDraft: vi.fn(), submit: vi.fn() }
    await act(async () =>
      root?.render(renderElement(CARD, { settings: { allowSendMessage: false }, inputActions })),
    )
    await flushEffects()
    const buttons = container?.querySelectorAll('button') ?? []
    const sendButton = Array.from(buttons).find((b) => b.textContent === '发')
    expect(sendButton).toBeDefined()
    expect((sendButton as HTMLButtonElement).disabled).toBe(true)
  })

  it('wires send_message to the host input machine when enabled', async () => {
    const inputActions = { setDraft: vi.fn(), submit: vi.fn() }
    await act(async () => root?.render(renderElement(CARD, { inputActions })))
    await flushEffects()
    const buttons = container?.querySelectorAll('button') ?? []
    const sendButton = Array.from(buttons).find((b) => b.textContent === '发')
    expect(sendButton).toBeDefined()
    await act(async () => sendButton?.click())
    expect(inputActions.setDraft).toHaveBeenCalledWith('hi')
    expect(inputActions.submit).toHaveBeenCalled()
  })

  it('wires correct_state to the host correction API with the merged state', async () => {
    const correctState = vi.fn(async () => {})
    const manifest = {
      version: 1 as const,
      layout: 'stack' as const,
      panels: [
        {
          id: 'b',
          component: 'buttonRow' as const,
          buttons: [
            {
              label: '矫正',
              action: 'correct_state' as const,
              patch: {
                globalFields: {
                  x: {
                    type: 'number',
                    value: 9,
                    definition: 'card-defined' as const,
                    visibility: 'player' as const,
                  },
                },
              },
            },
          ],
        },
      ],
    }
    const api: StageApi = {
      loadManifest: async () => manifest,
      correctState,
      askCopilot: () => {},
      sendMessage: async () => {},
      draftLore: async () => {},
      forget: () => {},
    }
    const projections: Record<string, unknown> = {
      [CARD_KEY]: CARD,
      [WORLD_STATE_KEY]: {
        ...emptyWorldState(),
        globalFields: {
          x: { type: 'number', value: 5, definition: 'card-defined' as const },
        },
      },
      [WORLDLINE_DIGEST_KEY]: { turns: [] },
      [RRP_SETTINGS_KEY]: { allowSendMessage: true },
    }
    await act(async () =>
      root?.render(
        createElement(StagePanel, {
          t: (key: string) => key,
          sessionId: 'session-1',
          api,
          useProjection: (key: string) => projections[key],
        }),
      ),
    )
    await flushEffects()
    const button = Array.from(container?.querySelectorAll('button') ?? []).find(
      (entry) => entry.textContent === '矫正',
    ) as HTMLButtonElement | undefined
    expect(button).toBeDefined()
    expect(button?.disabled).toBe(false)
    await act(async () => button?.click())
    await flushEffects()
    expect(correctState).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        globalFields: {
          x: expect.objectContaining({ value: 9 }),
        },
      }),
    )
  })
})

describe('StagePanel bridge v2', () => {
  let root: Root | undefined
  let container: HTMLDivElement | undefined
  let postMessage: ReturnType<typeof vi.fn>

  beforeEach(() => {
    __clearStageManifestCache()
    postMessage = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<html><head></head><body>rrp:hello</body></html>', { status: 200 }),
      ),
    )
    vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockReturnValue({
      postMessage,
    } as unknown as Window)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    if (root !== undefined) act(() => root?.unmount())
    container?.remove()
    vi.unstubAllGlobals()
    root = undefined
    container = undefined
  })

  it('renders an app panel in an iframe and answers hello with ready + state', async () => {
    const manifest = {
      version: 1 as const,
      layout: 'stack' as const,
      panels: [{ id: 'app', component: 'app' as const, src: 'index.html' }],
    }
    const inputActions = { setDraft: vi.fn(), submit: vi.fn() }
    const api: StageApi = {
      loadManifest: async () => manifest,
      correctState: async () => {},
      askCopilot: () => {},
      sendMessage: async () => {},
      draftLore: async () => {},
      forget: () => {},
    }
    const projections: Record<string, unknown> = {
      [CARD_KEY]: CARD,
      [WORLD_STATE_KEY]: emptyWorldState(),
      [WORLDLINE_DIGEST_KEY]: { turns: [{ prose: 'tail' }] },
      [RRP_SETTINGS_KEY]: { allowSendMessage: true },
    }
    await act(async () =>
      root?.render(
        createElement(StagePanel, {
          t: (key: string) => key,
          sessionId: 'session-1',
          api,
          useProjection: (key: string) => projections[key],
          inputActions,
        }),
      ),
    )
    await flushEffects()

    const iframe = await vi.waitFor(() => {
      const el = container?.querySelector('iframe')
      if (el === null) throw new Error('iframe not mounted')
      return el as HTMLIFrameElement
    })

    // Simulate v2 hello from the card app.
    window.dispatchEvent(
      new MessageEvent('message', {
        source: iframe.contentWindow,
        data: { t: 'rrp:hello', protocol: 2 },
      }),
    )
    await flushEffects()

    const ready = postMessage.mock.calls.find(([m]) => m.t === 'rrp:ready')
    expect(ready).toBeDefined()
    expect(ready![0].protocol).toBe(2)
    expect(ready![0].verbs).toContain('send_message')

    const statePush = postMessage.mock.calls.find(([m]) => m.t === 'rrp:state')
    expect(statePush).toBeDefined()
    expect(statePush![0].card.id).toBe('demo-card')
  })
})
