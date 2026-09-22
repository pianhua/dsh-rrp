import { describe, expect, it } from 'vitest'
import {
  layoutWorldlineForest,
  NODE_WIDTH,
  NODE_HEIGHT,
  GAP_X,
  GAP_Y,
} from '../src/client/components/worldline-layout.ts'
import type { WorldlineNode } from '../src/worldline-tree.ts'

function node(sessionId: string, turn: number, children: WorldlineNode[] = []): WorldlineNode {
  return {
    key: sessionId + ':' + String(turn),
    sessionId,
    sessionTitle: sessionId,
    turn,
    seq: turn * 2,
    playerExcerpt: 'P' + String(turn),
    proseExcerpt: 'A' + String(turn),
    fork: children.length > 1,
    children,
  }
}

describe('Galgame Flowchart Layout Engine', () => {
  it('computes vertical trunk alignment for linear chains', () => {
    const root = node('m', 0, [node('m', 1, [node('m', 2)])])
    const res = layoutWorldlineForest([root], 'm')
    expect(res.nodes).toHaveLength(3)
    expect(res.links).toHaveLength(2)

    const [n0, n1, n2] = res.nodes
    // x remains constant along trunk
    expect(n0?.x).toBe(40)
    expect(n1?.x).toBe(40)
    expect(n2?.x).toBe(40)

    // y steps down by NODE_HEIGHT + GAP_Y
    expect(n1?.y).toBe(40 + NODE_HEIGHT + GAP_Y)
    expect(n2?.y).toBe(40 + (NODE_HEIGHT + GAP_Y) * 2)

    // vertical link data
    expect(res.links[0]?.pathData).toContain('L')
  })

  it('offsets branches horizontally and generates smooth Bezier curves', () => {
    const branch1 = node('b1', 1)
    const trunkNext = node('m', 1)
    const root = node('m', 0, [trunkNext, branch1])

    const res = layoutWorldlineForest([root], 'm')
    expect(res.nodes).toHaveLength(3)
    expect(res.links).toHaveLength(2)

    const [r, t, b] = res.nodes
    expect(r?.x).toBe(40)
    expect(t?.x).toBe(40)
    expect(b?.x).toBe(40 + NODE_WIDTH + GAP_X)

    // Branch link must be a Bezier curve
    const branchLink = res.links.find((l) => l.toKey === 'b1:1')
    expect(branchLink?.pathData).toContain('C')
  })
})
