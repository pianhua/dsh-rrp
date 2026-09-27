/**
 * dsh-rrp — the card app frame (issue #18, L2): one card-authored HTML page,
 * running in a real sandbox inside the Stage panel.
 *
 * `sandbox="allow-scripts"` with NO `allow-same-origin` puts the page in an
 * opaque origin: it can run its own JavaScript and it can reach nothing else —
 * not the host DOM, not the session, not the network (the CSP injected by the
 * card-ui route keeps everything inside the plugin route). Everything crosses
 * the one narrow bridge in `src/ui-bridge.ts`.
 *
 * The iframe loads the card page by `src` so subresources (fonts, fetch, ESM)
 * resolve against the plugin route with CORS. State arrives as pushed messages,
 * so a Chronicler update never remounts the iframe and never loses the app's
 * own scroll position, form drafts, or animation.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { RRP_ROUTES } from '../route-contract.ts'
import type { WorldState } from '../world-state.ts'
import { UI_BRIDGE_PROTOCOL, UI_BRIDGE_VERBS, parseUiCall, type UiPush } from '../ui-bridge.ts'
import { applyButtonPatch } from '../ui-schema.ts'
import type { StageApi, Translate } from './stage-types.ts'

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
  t: Translate
  /** Notify the parent that a call failed so it can render the error card. */
  onError?: (message: string) => void
}

function frameUrl(cardId: string, src: string): string {
  // Path-segment form: the served document must own its URL path so relative
  // asset references (css/js/images) resolve inside the sandboxed iframe.
  return (
    RRP_ROUTES.cardUi +
    '/' +
    encodeURIComponent(cardId) +
    '/' +
    src.split('/').map(encodeURIComponent).join('/')
  )
}

export function StageFrame(props: StageFrameProps): ReactNode {
  const [url, setUrl] = useState<string | undefined>(undefined)
  const [failed, setFailed] = useState('')
  const [height, setHeight] = useState(320)
  const [retry, setRetry] = useState(0)
  const frame = useRef<HTMLIFrameElement | null>(null)
  const budget = useRef({ at: Date.now(), left: CALLS_PER_SECOND })
  const pendingPush = useRef<number | undefined>(undefined)
  const latest = useRef(props)
  latest.current = props

  const report = (message: string): void => {
    setFailed(message)
    props.onError?.(message)
  }

  // Validate the card page once per (card, page, retry), then point the iframe
  // at it. Network/non-2xx failures surface here instead of leaving a blank box.
  useEffect(() => {
    let alive = true
    setUrl(undefined)
    setFailed('')
    setHeight(320)
    const target = frameUrl(props.cardId, props.src)
    fetch(target)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.text().catch(() => '')
          throw new Error(response.status + (body.length > 0 ? ' ' + body : ''))
        }
        return response.text()
      })
      .then((html) => {
        if (!alive) return
        // The route already injects CSP and the bridge shim; just confirm it.
        if (!html.includes('rrp:hello')) {
          throw new Error(props.t('stage.appMissingBridge'))
        }
        setUrl(target)
      })
      .catch((error: unknown) => {
        if (!alive) return
        report(props.t('stage.appFailed') + ': ' + String(error))
      })
    return () => {
      alive = false
    }
  }, [props.cardId, props.src, retry])

  // The bridge: parent → app pushes state; app → parent gets the four verbs.
  useEffect(() => {
    const sendReady = (): void => {
      const target = frame.current?.contentWindow
      if (target === null || target === undefined) return
      const message: UiPush = {
        t: 'rrp:ready',
        protocol: UI_BRIDGE_PROTOCOL,
        verbs: [...UI_BRIDGE_VERBS],
      }
      target.postMessage(message, '*')
    }
    const pushNow = (): void => {
      pendingPush.current = undefined
      const target = frame.current?.contentWindow
      if (target === null || target === undefined) return
      const { cardId, cardName, state, transcript } = latest.current
      const message: UiPush = {
        t: 'rrp:state',
        protocol: UI_BRIDGE_PROTOCOL,
        state,
        card: { id: cardId, name: cardName },
        transcript,
      }
      target.postMessage(message, '*')
    }
    const pushState = (): void => {
      if (pendingPush.current !== undefined) return
      pendingPush.current = window.setTimeout(pushNow, 100)
    }
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
        sendReady()
        pushNow()
        return
      }
      if (call.t === 'rrp:resize') {
        setHeight(call.height)
        return
      }
      const { sessionId, api } = latest.current
      if (call.t === 'rrp:correct_state' && sessionId !== undefined) {
        api
          .correctState(sessionId, applyButtonPatch(latest.current.state, call.patch))
          .catch((error: unknown) => {
            report(latest.current.t('stage.correctStateFailed') + ': ' + String(error))
          })
        return
      }
      if (call.t === 'rrp:ask_copilot') {
        try {
          api.askCopilot(call.question)
        } catch (error: unknown) {
          report(latest.current.t('stage.askCopilotFailed') + ': ' + String(error))
        }
        return
      }
      if (call.t === 'rrp:send_message' && sessionId !== undefined) {
        api.sendMessage(sessionId, call.text).catch((error: unknown) => {
          report(latest.current.t('stage.sendMessageFailed') + ': ' + String(error))
        })
        return
      }
      if (call.t === 'rrp:draft_lore' && sessionId !== undefined) {
        api.draftLore(sessionId, call.entry).catch((error: unknown) => {
          report(latest.current.t('stage.draftLoreFailed') + ': ' + String(error))
        })
      }
    }
    window.addEventListener('message', onMessage)
    pushState()
    return () => {
      window.removeEventListener('message', onMessage)
      if (pendingPush.current !== undefined) {
        window.clearTimeout(pendingPush.current)
        pendingPush.current = undefined
      }
    }
  }, [props.sessionId, props.cardId, props.src, props.state, props.transcript, url])

  if (failed.length > 0) {
    return (
      <div style={S.error}>
        <div>{props.t('stage.appFailed')}</div>
        <div style={S.errorDetail}>{failed}</div>
        <div>
          <Button size="sm" variant="outline" onClick={() => setRetry((n) => n + 1)}>
            {props.t('stage.retry')}
          </Button>
        </div>
      </div>
    )
  }

  if (url === undefined) return <div style={S.pending}>{props.t('stage.appLoading')}</div>

  return (
    <iframe
      ref={frame}
      title={props.cardName}
      src={url}
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
    padding: '10px 12px',
    borderRadius: '8px',
    background: 'rgba(200,80,80,0.12)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  errorDetail: { opacity: 0.72, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
}
