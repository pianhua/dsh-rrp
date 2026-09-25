import { describe, expect, it } from 'vitest'
import {
  RRP_PLUGIN,
  RRP_SETTINGS_KEY,
  RRP_LORE_KEY,
  SUMMARY_KEY,
  WORLD_STATE_KEY,
  WORLD_STATE_TIMELINE_KEY,
  WORLD_STATE_TIMELINE_VERSION,
  WORLD_STATE_VERSION,
  emptyWorldState,
  renderMacroSummary,
  renderWorldState,
  rrpPayloadOf,
  rrpStateMessage,
} from '../src/contracts.ts'

describe('external read contract', () => {
  it('publishes the stable projection keys', () => {
    expect(WORLD_STATE_KEY).toBe('rrpWorldState')
    expect(WORLD_STATE_VERSION).toBe(2)
    expect(WORLD_STATE_TIMELINE_KEY).toBe('rrpWorldStateTimeline')
    expect(WORLD_STATE_TIMELINE_VERSION).toBe(1)
    expect(SUMMARY_KEY).toBe('rrpSummary')
    expect(RRP_SETTINGS_KEY).toBe('rrpSettings')
    expect(RRP_LORE_KEY).toBe('rrpSediment')
  })

  it('round-trips the complete v2 snapshot and timeline batch through a known user/message event', () => {
    const state = {
      ...emptyWorldState(),
      globalFields: {
        weather: { type: 'string' as const, value: '雨', definition: 'undeclared' as const },
      },
    }
    const worldStateTimelineBatch = {
      kind: 'baseline' as const,
      snapshot: 'initial-state' as const,
      provenance: { actor: 'initial-state' as const },
    }
    const message = rrpStateMessage('m1', renderWorldState(state), {
      worldState: state,
      worldStateTimelineBatch,
    })
    const payload = rrpPayloadOf({ type: 'user/message', data: message })
    expect(payload?.worldState).toEqual(state)
    expect(payload?.worldStateTimelineBatch).toEqual(worldStateTimelineBatch)
    // A plain user message carries no payload: extensions can rely on this.
    expect(
      rrpPayloadOf({ type: 'user/message', data: { id: 'x', role: 'user', content: [] } }),
    ).toBeUndefined()
  })

  it('renders both baselines for external consumers', () => {
    expect(renderWorldState(emptyWorldState())).toContain('世界状态')
    expect(
      renderMacroSummary({ goal: 'g', conflict: 'c', turningPoints: [], threads: [] }),
    ).toContain('剧情脉络')
  })

  it('names the plugin identity extensions match on', () => {
    expect(RRP_PLUGIN).toBe('dsh-rrp')
  })
})
