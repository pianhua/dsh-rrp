import { describe, expect, it } from 'vitest'
import {
  forkCutTurn,
  isWorldlineFork,
  registerWorldlineForkMarker,
} from '../src/worldline-fork-marker.ts'
import { emptyWorldlineDigest } from '../src/worldline-digest.ts'

function session(id: string, header: Record<string, unknown> = {}) {
  return { id, header, inheritedEventCount: 5, append: () => {} }
}

describe('worldline fork marker', () => {
  it('recognizes seeded non-subagent children only', () => {
    expect(isWorldlineFork(session('child', { parentSession: 'parent', isSeeded: true }))).toBe(
      true,
    )
    expect(isWorldlineFork(session('child', { parentSession: 'parent', isSeeded: false }))).toBe(
      false,
    )
    expect(
      isWorldlineFork(
        session('child', { parentSession: 'parent', isSeeded: true, origin: 'subagent' }),
      ),
    ).toBe(false)
  })

  it('computes the cut from the last parent slot before inheritedEventCount', () => {
    const digest = {
      ...emptyWorldlineDigest(),
      turns: [
        { turn: 0, seq: 1, player: 'a', prose: '' },
        { turn: 1, seq: 3, player: 'b', prose: '' },
        { turn: 2, seq: 7, player: 'c', prose: '' },
      ],
      nextTurn: 3,
    }
    expect(forkCutTurn(digest, 5)).toBe(2)
    expect(forkCutTurn(digest, 1)).toBeNull()
  })

  it('publishes once per child through the parent and is idempotent', () => {
    const parent = session('parent')
    let appendCount = 0
    parent.append = () => {
      appendCount += 1
    }
    const child = session('child', { parentSession: 'parent', isSeeded: true })
    let listener: ((session: unknown) => void) | undefined
    const ctx = {
      get(name: string) {
        if (name === 'sessions')
          return { get: (id: string) => (id === 'parent' ? parent : undefined) }
        if (name === 'sessionProjections') {
          return {
            stateOf: () => ({
              ...emptyWorldlineDigest(),
              turns: [{ turn: 4, seq: 3, player: 'a', prose: '' }],
            }),
          }
        }
        return undefined
      },
      effect(fn: () => (() => void) | void) {
        return fn()
      },
      on(event: string, callback: (session: unknown) => void) {
        expect(event).toBe('session/created')
        listener = callback
        return () => {}
      },
    }
    registerWorldlineForkMarker(ctx as never)
    listener?.(child)
    listener?.(child)
    expect(appendCount).toBe(1)
  })
})
