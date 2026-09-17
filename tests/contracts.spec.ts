import { describe, expect, it } from 'vitest'
import {
  RRP_PLUGIN,
  RRP_SETTINGS_KEY,
  RRP_SEDIMENT_KEY,
  SUMMARY_KEY,
  WORLD_STATE_KEY,
  emptyWorldState,
  renderMacroSummary,
  renderWorldState,
  rrpPayloadOf,
  rrpStateMessage,
} from '../src/contracts.ts'

describe('external read contract', () => {
  it('publishes the stable projection keys', () => {
    expect(WORLD_STATE_KEY).toBe('rrpWorldState')
    expect(SUMMARY_KEY).toBe('rrpSummary')
    expect(RRP_SETTINGS_KEY).toBe('rrpSettings')
    expect(RRP_SEDIMENT_KEY).toBe('rrpSediment')
  })

  it('round-trips a structured payload through a known user/message event', () => {
    const state = { ...emptyWorldState(), scene: { location: '门口' } }
    const message = rrpStateMessage('m1', renderWorldState(state), { worldState: state })
    const payload = rrpPayloadOf({ type: 'user/message', data: message })
    expect(payload?.worldState).toEqual(state)
    // A plain user message carries no payload: extensions can rely on this.
    expect(rrpPayloadOf({ type: 'user/message', data: { id: 'x', role: 'user', content: [] } })).toBeUndefined()
  })

  it('renders both baselines for external consumers', () => {
    expect(renderWorldState(emptyWorldState())).toContain('世界状态')
    expect(renderMacroSummary({ goal: 'g', conflict: 'c', turningPoints: [], threads: [] })).toContain('大局编年')
  })

  it('names the plugin identity extensions match on', () => {
    expect(RRP_PLUGIN).toBe('dsh-rrp')
  })
})
