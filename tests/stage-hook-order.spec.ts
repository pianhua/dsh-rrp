// @vitest-environment happy-dom
import { act } from 'react'
import { createElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CARD_KEY, type CardContext } from '../src/card-types.ts'
import { StagePanel, type StageApi } from '../src/client/stage-tab.tsx'
import { WORLDLINE_DIGEST_KEY } from '../src/worldline-digest.ts'
import { WORLD_STATE_KEY, emptyWorldState } from '../src/world-state.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const CARD: CardContext = {
  id: 'demo-card',
  name: 'Demo Card',
  persona: '',
  worldCore: '',
}
const SECOND_CARD = { ...CARD, id: 'second-card', name: 'Second Card' }
const MANIFEST = {
  version: 1 as const,
  layout: 'stack' as const,
  panels: [{ id: 'app', component: 'app' as const, src: 'index.html' }],
}

function renderElement(card: CardContext | null, prose: string): ReactElement {
  const projections: Record<string, unknown> = {
    [CARD_KEY]: card,
    [WORLD_STATE_KEY]: emptyWorldState(),
    [WORLDLINE_DIGEST_KEY]: { turns: [{ prose }] },
  }
  const api: StageApi = {
    loadManifest: async () => (card === null ? null : MANIFEST),
    correctState: async () => {},
    askCopilot: () => {},
    forget: () => {},
  }
  return createElement(StagePanel, {
    t: (key: string) => key,
    sessionId: 'session-1',
    api,
    useProjection: (key: string) => projections[key],
  })
}

function flushEffects(): Promise<void> {
  return act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('StagePanel projection hook order', () => {
  let root: Root | undefined
  let container: HTMLDivElement | undefined
  let postMessage: ReturnType<typeof vi.fn>

  afterEach(() => {
    if (root !== undefined) act(() => root?.unmount())
    container?.remove()
    vi.unstubAllGlobals()
    root = undefined
    container = undefined
  })

  it('keeps one component instance stable across card removal and activation', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    await act(async () => root?.render(renderElement(null, '')))
    await act(async () => root?.render(renderElement(CARD, 'new prose')))
    await flushEffects()
    await act(async () => root?.render(renderElement(null, '')))

    expect(error.mock.calls.flat().join('\n')).not.toMatch(
      /Rendered (more|fewer) hooks than during the previous render/,
    )
    error.mockRestore()
  })

  it('pushes digest updates to the card app and drops its frame when the card changes', async () => {
    postMessage = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, text: async () => '<p>card app</p>' })),
    )
    vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockReturnValue({
      postMessage,
    } as unknown as Window)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    await act(async () => root?.render(renderElement(CARD, 'first prose')))
    await flushEffects()
    await act(async () => root?.render(renderElement(CARD, 'latest prose')))
    await flushEffects()

    expect(container.querySelector('iframe')?.getAttribute('title')).toBe('Demo Card')
    expect(postMessage.mock.calls.some(([message]) => message.transcript === 'latest prose')).toBe(
      true,
    )

    await act(async () => root?.render(renderElement(SECOND_CARD, 'second branch prose')))
    await flushEffects()
    expect(container.querySelector('iframe')?.getAttribute('title')).toBe('Second Card')
    expect(container.textContent).not.toContain('Demo Card')
  })
})
