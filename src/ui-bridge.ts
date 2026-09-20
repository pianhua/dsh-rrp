/**
 * dsh-rrp — the Stage ↔ card-app bridge (issue #18, L2).
 *
 * A card may ship its own HTML page (`ui/<name>.html`). It runs in a sandboxed
 * iframe with NO same-origin access, so the page cannot touch the host, the
 * session, or the network — it can only talk over this bus. The bus is
 * deliberately narrower than Tavern Helper's: the card app receives a read-only
 * world snapshot and may ask for exactly two things, the same two a declarative
 * button may do, plus a height request so it never needs viewport hacks.
 *
 * Dependency-free: both halves import these types and guards.
 */

/** Protocol version; a mismatch is ignored rather than guessed at. */
export const UI_BRIDGE_PROTOCOL = 1

/** Parent (Stage panel) → card app. */
export type UiPush =
  | { t: 'rrp:hello-ack'; protocol: number }
  | {
      t: 'rrp:state'
      protocol: number
      /** The live WorldState slice (read-only for the card app). */
      state: unknown
      /** The active card's identity. */
      card: { id: string; name: string }
      /** Recent prose, pre-truncated by the panel; may be empty. */
      transcript: string
    }

/** Card app → parent. Anything else is dropped. */
export type UiCall =
  | { t: 'rrp:hello' }
  | { t: 'rrp:correct_state'; patch: Record<string, unknown> }
  | { t: 'rrp:ask_copilot'; question: string }
  | { t: 'rrp:resize'; height: number }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Narrow an untrusted iframe message. */
export function parseUiCall(value: unknown): UiCall | undefined {
  if (!isRecord(value) || typeof value.t !== 'string') return undefined
  switch (value.t) {
    case 'rrp:hello':
      return { t: 'rrp:hello' }
    case 'rrp:correct_state':
      return isRecord(value.patch) ? { t: 'rrp:correct_state', patch: value.patch } : undefined
    case 'rrp:ask_copilot':
      return typeof value.question === 'string' && value.question.length <= 2000
        ? { t: 'rrp:ask_copilot', question: value.question }
        : undefined
    case 'rrp:resize':
      return typeof value.height === 'number' && Number.isFinite(value.height)
        ? { t: 'rrp:resize', height: Math.max(80, Math.min(4000, Math.round(value.height))) }
        : undefined
    default:
      return undefined
  }
}

/**
 * The bootstrap shim injected into every card page.
 *
 * It hands the author a tiny `window.rrp` surface — read-only state through
 * `onState`, and the two verbs — so no card ever reaches for `parent.*`
 * (which the sandbox forbids anyway) and the protocol stays in one place.
 */
export const UI_BRIDGE_SHIM = `<script>(function(){
var subs=[];
function post(m){try{parent.postMessage(m,'*')}catch(e){}}
window.rrp={
  onState:function(fn){subs.push(fn);if(window.__rrpState)fn(window.__rrpState)},
  correctState:function(patch){post({t:'rrp:correct_state',patch:patch})},
  askCopilot:function(question){post({t:'rrp:ask_copilot',question:question})},
  resize:function(){var h=Math.ceil(document.documentElement.getBoundingClientRect().height);post({t:'rrp:resize',height:h})},
  protocol:${String(UI_BRIDGE_PROTOCOL)}
};
window.addEventListener('message',function(e){
  var d=e.data;
  if(!d||typeof d!=='object')return;
  if(d.t==='rrp:state'){window.__rrpState=d;for(var i=0;i<subs.length;i++){try{subs[i](d)}catch(err){}}}
});
post({t:'rrp:hello'});
window.addEventListener('load',function(){setTimeout(function(){window.rrp.resize()},50)});
})();</`+`script>`

/** The CSP every card page is wrapped in: inline only, no network, no frames. */
export const UI_BRIDGE_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:"
