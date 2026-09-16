import { describe, expect, it } from 'vitest'
import {
  SUMMARY_EVENT,
  SUMMARY_KEY,
  WORLD_STATE_EVENT,
  WORLD_STATE_KEY,
  emptyWorldState,
  renderMacroSummary,
  renderWorldState,
} from '../src/contracts.ts'

describe('external read contract', () => {
  it('publishes the stable projection keys and event names', () => {
    expect(WORLD_STATE_KEY).toBe('rrpWorldState')
    expect(WORLD_STATE_EVENT).toBe('rrp/world-state')
    expect(SUMMARY_KEY).toBe('rrpSummary')
    expect(SUMMARY_EVENT).toBe('rrp/summary')
  })

  it('renders both baselines for external consumers', () => {
    expect(renderWorldState(emptyWorldState())).toContain('世界状态')
    expect(renderMacroSummary({ goal: 'g', conflict: 'c', turningPoints: [], threads: [] })).toContain('大局编年')
  })
})
