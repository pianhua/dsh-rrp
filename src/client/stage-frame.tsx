/**
 * dsh-rrp — the card app frame (issue #18, L2): one card-authored HTML page,
 * running in a real sandbox inside the Stage panel.
 *
 * `sandbox="allow-scripts"` with NO `allow-same-origin` puts the page in an
 * opaque origin: it can run its own JavaScript and it can reach nothing else —
 * not the host DOM, not the session, not the network (the CSP we inject allows
 * inline assets only). Everything crosses the one narrow bridge in
 * `src/ui-bridge.ts`.
 *
 * The srcdoc is computed once per page. State arrives as a pushed message, so a
 * Chronicler update never remounts the iframe and never loses the app's own
 * scroll position, form drafts, or animation.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { RRP_ROUTES } from '../route-contract.ts'
import type { WorldState } from '../world-state.ts'
import {
  UI_BRIDGE_CSP,
  UI_BRIDGE_PROTOCOL,
  UI_BRIDGE_SHIM,
  parseUiCall,
  type UiPush,
} from '../ui-bridge.ts'
import { applyButtonPatch } from '../ui-schema.ts'
import type { StageApi } from './stage-types.ts'

/** Calls a card app may raise per second; a runaway page must not flood the ledger. */
const CALLS_PER_SECOND = 20

interface StageFrameProps {
  cardId: string
  cardName: string
  src: string
  state: WorldState
  /** One-line prose tail so a card app can react to what just happened. */
  transcript: string
  sessionId?: string
  api: StageApi
  t: (key: string) => string
}

/** Put the CSP and the shim ahead of anything the card authored. */
export function assembleSandboxDoc(html: string): string {
  const head =
    '<meta http-equiv="Content-Security-Policy" content="' + UI_BRIDGE_CSP + '">' + UI_BRIDGE_SHIM
  const at = html.search(/<head[^>]*>/i)
  if (at === -1) return head + html
  const cut = html.indexOf('>', at) + 1
  return html.slice(0, cut) + head + html.slice(cut)
}

export function StageFrame(props: StageFrameProps): ReactNode {
  const [html, setHtml] = useState<string | undefined>(undefined)
  const [failed, setFailed] = useState('')
  const [height, setHeight] = useState(320)
  const frame = useRef<HTMLIFrameElement | null>(null)
  const budget = useRef({ at: Date.now(), left: CALLS_PER_SECOND })
  const latest = props

  // One fetch per (card, page): the srcdoc below must stay byte-stable.
  useEffect(() => {
    let alive = true
    setHtml(undefined)
    setFailed('')
    void fetch(
      RRP_ROUTES.cardUi +
        '?card=' +
        encodeURIComponent(props.cardId) +
        '&file=' +
        encodeURIComponent(props.src),
    )
      .then(async (response) => {
        if (!response.ok) setFailed(await response.text())
        return response.text()
      })
      .catch((error: unknown) => {
        if (alive) setFailed(String(error))
        return ''
      })
      .then((text) => {
        if (alive && text.length > 0) setHtml(text)
      })
    return () => {
      alive = false
    }
  }, [props.cardId, props.src])

  const srcDoc = useMemo(() => (html === undefined ? undefined : assembleSandboxDoc(html)), [html])

  // The bridge: parent → app pushes state; app → parent gets the two verbs.
  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      const target = frame.current?.contentWindow
      if (target === null || target === undefined || event.source !== target) return
      const call = parseUiCall(event.data)
      if (call === undefined) return
      const now = Date.now()
      if (now - budget.current.at > 1000) {
        budget.current = { at: now, left: CALLS_PER_SECOND }
      }
      if (budget.current.left <= 0) return
      budget.current.left -= 1
      if (call.t === 'rrp:hello') {
        push()
        return
      }
      if (call.t === 'rrp:resize') {
        setHeight(call.height)
        return
      }
      if (call.t === 'rrp:correct_state' && latest.sessionId !== undefined) {
        void latest.api.correctState(latest.sessionId, applyButtonPatch(latest.state, call.patch))
        return
      }
      if (call.t === 'rrp:ask_copilot') {
        latest.api.askCopilot(call.question)
      }
    }
    const push = (): void => {
      const target = frame.current?.contentWindow
      if (target === null || target === undefined) return
      const message: UiPush = {
        t: 'rrp:state',
        protocol: UI_BRIDGE_PROTOCOL,
        state: latest.state,
        card: { id: latest.cardId, name: latest.cardName },
        transcript: latest.transcript,
      }
      target.postMessage(message, '*')
    }
    window.addEventListener('message', onMessage)
    push()
    return () => {
      window.removeEventListener('message', onMessage)
    }
  }, [props.state, props.transcript, props.cardId, props.cardName, srcDoc])

  if (failed.length > 0) return <div style={S.error}>{latest.t('stage.appFailed')}</div>
  if (srcDoc === undefined) return <div style={S.pending}>{latest.t('stage.appLoading')}</div>
  return (
    <iframe
      ref={frame}
      title={latest.cardName}
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      style={{ ...S.frame, height: String(height) + 'px' }}
    />
  )
}

const S: Record<string, CSSProperties> = {
  frame: {
    width: '100%',
    border: 'none',
    display: 'block',
    background: 'transparent',
    borderRadius: '8px',
  },
  pending: { fontSize: '12px', opacity: 0.55, padding: '16px 0', textAlign: 'center' },
  error: {
    fontSize: '12px',
    lineHeight: 1.6,
    padding: '8px 10px',
    borderRadius: '8px',
    background: 'rgba(200,80,80,0.12)',
  },
}
