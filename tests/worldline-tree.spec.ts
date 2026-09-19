import { describe, expect, it } from 'vitest'
import { foldWorldlineTrees, type WorldlineNode, type WorldlineSessionFact, type WorldlineTurnFact } from '../src/worldline-tree.ts'

function turns(count: number, tag = ''): WorldlineTurnFact[] {
  return Array.from({ length: count }, (_, turn) => ({
    turn,
    seq: turn * 2 + 1,
    playerExcerpt: tag + 'P' + String(turn),
    proseExcerpt: tag + 'A' + String(turn),
  }))
}

function session(id: string, extra: Partial<WorldlineSessionFact> = {}): WorldlineSessionFact {
  return { id, cardId: 'c1', cardName: '卡一', title: id, turns: [], ...extra }
}

/** Flatten a node's continuation chain (first-child path) for assertions. */
function chain(node: WorldlineNode | undefined): number[] {
  const out: number[] = []
  let current: WorldlineNode | undefined = node
  while (current !== undefined) {
    out.push(current.turn)
    current = current.children[0]
  }
  return out
}

describe('worldline tree fold (issue #28)', () => {
  it('folds a single main line into one chain of turn nodes', () => {
    const trees = foldWorldlineTrees([session('m', { turns: turns(3) })])
    expect(trees).toHaveLength(1)
    expect(trees[0]?.roots).toHaveLength(1)
    expect(chain(trees[0]?.roots[0])).toEqual([0, 1, 2])
  })

  it('hangs a fork tail on the parent last inherited turn, never duplicating the prefix', () => {
    const trees = foldWorldlineTrees([
      session('m', { turns: turns(4) }),
      session('f', { parentId: 'm', seedTurns: 2, turns: turns(4, 'f') }),
    ])
    const root = trees[0]?.roots[0]
    // The main trunk stays whole: 0 → 1 → 2 → 3 via first children.
    expect(chain(root)).toEqual([0, 1, 2, 3])
    // The cut node is the parent's turn 1 (last inherited): it carries the trunk's
    // turn 2 AND the fork head — the fork's inherited turns 0/1 are never duplicated.
    const cut = root?.children[0]
    expect(cut?.turn).toBe(1)
    expect(cut?.fork).toBe(true)
    expect(cut?.children.map((child) => child.sessionId + ':' + String(child.turn))).toEqual(['m:2', 'f:2'])
    expect(chain(cut?.children[1])).toEqual([2, 3])
  })

  it('supports forks of forks and keeps input order for roots', () => {
    const trees = foldWorldlineTrees([
      session('m', { turns: turns(2) }),
      session('a', { parentId: 'm', seedTurns: 1, turns: turns(3, 'a') }),
      session('b', { parentId: 'a', seedTurns: 2, turns: turns(3, 'b') }),
    ])
    // m:0 is the cut for a (seed 1 → parent turn 0).
    const mHead = trees[0]?.roots[0]
    expect(mHead?.sessionId).toBe('m')
    expect(mHead?.fork).toBe(true)
    expect(mHead?.children.map((child) => child.sessionId + ':' + String(child.turn))).toEqual(['m:1', 'a:1'])
    // b grows from a's turn 1 (seed 2 → parent turn 1): a:1 carries a:2 and b:2.
    const aHead = mHead?.children[1]
    expect(aHead?.children.map((child) => child.sessionId + ':' + String(child.turn))).toEqual(['a:2', 'b:2'])
  })

  it('hiding a line prunes its whole subtree, keeping the parent trunk intact', () => {
    const trees = foldWorldlineTrees(
      [
        session('m', { turns: turns(2) }),
        session('a', { parentId: 'm', seedTurns: 1, turns: turns(2, 'a') }),
        session('b', { parentId: 'a', seedTurns: 1, turns: turns(2, 'b') }),
      ],
      ['a'],
    )
    expect(chain(trees[0]?.roots[0])).toEqual([0, 1])
    const trunk = trees[0]?.roots[0]?.children[0]
    expect(trunk?.sessionId).toBe('m')
    expect(trunk?.children.some((child) => child.sessionId === 'a')).toBe(false)
  })

  it('ignores card-less sessions and separates cards into their own trees', () => {
    const trees = foldWorldlineTrees([
      session('free', { cardId: '', turns: turns(2) }),
      session('m1', { turns: turns(1) }),
      session('m2', { cardId: 'c2', cardName: '卡二', turns: turns(1) }),
    ])
    expect(trees.map((tree) => tree.cardId)).toEqual(['c1', 'c2'])
  })

  it('promotes orphans (parent absent or hidden) to roots instead of dropping them', () => {
    const trees = foldWorldlineTrees([session('o', { parentId: 'ghost', seedTurns: 2, turns: turns(3) })])
    expect(trees[0]?.roots).toHaveLength(1)
    expect(chain(trees[0]?.roots[0])).toEqual([2])
  })

  it('a fork taken at turn zero starts as its own root (no cut node exists)', () => {
    const trees = foldWorldlineTrees([
      session('m', { turns: turns(2) }),
      session('f', { parentId: 'm', seedTurns: 0, turns: turns(2, 'f') }),
    ])
    expect(trees[0]?.roots.map((root) => root.sessionId)).toEqual(['m', 'f'])
  })
})
