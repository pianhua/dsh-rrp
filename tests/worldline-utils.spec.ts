import { describe, expect, it } from 'vitest'
import type { WorldlineNode, WorldlineTree } from '../src/worldline-tree.ts'
import {
  branchTitleForCount,
  directChildCount,
  flattenWorldlineBranches,
  relativeTimeOf,
  visibleTurnWindow,
} from '../src/client/worldline-utils.ts'

function node(
  sessionId: string,
  turn: number,
  children: WorldlineNode[] = [],
  extra: Partial<WorldlineNode> = {},
): WorldlineNode {
  return {
    key: sessionId + ':' + String(turn),
    sessionId,
    sessionTitle: sessionId,
    turn,
    seq: turn + 1,
    playerExcerpt: 'player ' + String(turn),
    proseExcerpt: 'prose ' + String(turn),
    fork: children.length > 1,
    children,
    ...extra,
  }
}

describe('worldline client utilities', () => {
  it('flattens each session line once and counts descendants', () => {
    const child = node('child', 2, [node('grandchild', 3)])
    const root = node('main', 0, [node('main', 1, [child])])
    const trees: WorldlineTree[] = [{ cardId: 'card', cardName: 'Card', roots: [root] }]

    const groups = flattenWorldlineBranches(trees)
    expect(groups[0]?.branches.map((branch) => branch.sessionId)).toEqual([
      'main',
      'child',
      'grandchild',
    ])
    expect(groups[0]?.branches.find((branch) => branch.sessionId === 'main')?.latestTurn).toBe(1)
    expect(groups[0]?.branches.find((branch) => branch.sessionId === 'main')?.descendantCount).toBe(
      2,
    )
  })

  it('marks cold branches and uses roster activity for relative time', () => {
    const root = node('cold', -1, [], { loaded: false, seedKnown: false })
    const trees: WorldlineTree[] = [{ cardId: 'card', cardName: 'Card', roots: [root] }]
    const groups = flattenWorldlineBranches(trees, {
      activityBySession: { cold: '2026-09-25T10:00:00.000Z' },
      now: Date.parse('2026-09-25T10:02:00.000Z'),
    })

    expect(groups[0]?.branches[0]).toMatchObject({
      sessionId: 'cold',
      cold: true,
      seedKnown: false,
      activity: { value: 2, unit: 'minute' },
    })
  })

  it('calculates automatic branch names from the server child count', () => {
    expect(branchTitleForCount('Main', 0)).toBe('Main·线1')
    expect(branchTitleForCount('Main', 2)).toBe('Main·线3')
  })

  it('counts direct child lines without counting continuation nodes', () => {
    const root = node('main', 0, [node('main', 1), node('child', 1), node('child', 2)])
    const trees: WorldlineTree[] = [{ cardId: 'card', cardName: 'Card', roots: [root] }]
    expect(directChildCount(trees, 'main')).toBe(1)
  })

  it('returns a viewport window with five-node buffers', () => {
    expect(visibleTurnWindow(20, 10, 1)).toEqual({ start: 5, end: 16 })
    expect(visibleTurnWindow(4, 2, 100)).toEqual({ start: 0, end: 4 })
  })

  it('rejects invalid activity timestamps without fabricating a time', () => {
    expect(relativeTimeOf('not-a-date', 0)).toBeUndefined()
    expect(relativeTimeOf(undefined, 0)).toBeUndefined()
  })
})
