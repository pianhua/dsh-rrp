/**
 * dsh-rrp — Galgame Flowchart layout engine: pure, zero-DOM.
 * Computes (x, y) coordinates and cubic Bezier links for worldline tree nodes.
 */
import type { WorldlineNode } from '../../worldline-tree.ts'

export const NODE_WIDTH = 260
export const NODE_HEIGHT = 104
export const GAP_X = 50
export const GAP_Y = 54

export interface PositionedNode {
  node: WorldlineNode
  x: number
  y: number
  width: number
  height: number
  depth: number
  isCurrent: boolean
}

export interface TreeLink {
  fromKey: string
  toKey: string
  x1: number
  y1: number
  x2: number
  y2: number
  pathData: string
  isCurrent: boolean
  isPending: boolean
  isStub: boolean
}

export interface LayoutResult {
  nodes: PositionedNode[]
  links: TreeLink[]
  width: number
  height: number
}

/**
 * Layout a forest of roots (or multiple cards) into absolute diagram space.
 */
export function layoutWorldlineForest(
  roots: readonly WorldlineNode[],
  currentSessionId?: string,
): LayoutResult {
  const positionedNodes: PositionedNode[] = []
  const links: TreeLink[] = []

  let currentX = 40
  let maxHeight = 0

  for (const root of roots) {
    const subtree = layoutSubtree(root, currentX, 40, 0, currentSessionId)
    positionedNodes.push(...subtree.nodes)
    links.push(...subtree.links)
    currentX += subtree.subtreeWidth + GAP_X * 2
    maxHeight = Math.max(maxHeight, subtree.subtreeHeight)
  }

  const maxWidth = Math.max(currentX - GAP_X * 2 + 40, 600)
  return {
    nodes: positionedNodes,
    links,
    width: maxWidth,
    height: Math.max(maxHeight + 100, 400),
  }
}

interface SubtreeLayout {
  nodes: PositionedNode[]
  links: TreeLink[]
  subtreeWidth: number
  subtreeHeight: number
}

function layoutSubtree(
  root: WorldlineNode,
  originX: number,
  originY: number,
  depth: number,
  currentSessionId?: string,
): SubtreeLayout {
  const nodes: PositionedNode[] = []
  const links: TreeLink[] = []

  const isCurrent = root.sessionId === currentSessionId && root.loaded !== false && !root.pending

  // Base node
  const rootPos: PositionedNode = {
    node: root,
    x: originX,
    y: originY,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    depth,
    isCurrent,
  }
  nodes.push(rootPos)

  if (root.children.length === 0) {
    return {
      nodes,
      links,
      subtreeWidth: NODE_WIDTH,
      subtreeHeight: originY + NODE_HEIGHT + 20,
    }
  }

  const [continuation, ...branches] = root.children
  const childY = originY + NODE_HEIGHT + GAP_Y

  // 1. Continuation (trunk) stays directly aligned under root
  let trunkWidth = NODE_WIDTH
  let maxChildHeight = childY
  if (continuation !== undefined) {
    const contLayout = layoutSubtree(continuation, originX, childY, depth + 1, currentSessionId)
    nodes.push(...contLayout.nodes)
    links.push(
      createLink(
        rootPos,
        contLayout.nodes[0]!,
        isCurrent && contLayout.nodes[0]?.isCurrent === true,
      ),
    )
    links.push(...contLayout.links)
    trunkWidth = contLayout.subtreeWidth
    maxChildHeight = Math.max(maxChildHeight, contLayout.subtreeHeight)
  }

  // 2. Branches offset to the right of the entire continuation subtree
  let branchOriginX = originX + trunkWidth + GAP_X
  let totalSubtreeWidth = trunkWidth

  for (const branch of branches) {
    const branchLayout = layoutSubtree(branch, branchOriginX, childY, depth + 1, currentSessionId)
    nodes.push(...branchLayout.nodes)
    links.push(
      createLink(
        rootPos,
        branchLayout.nodes[0]!,
        isCurrent && branchLayout.nodes[0]?.isCurrent === true,
      ),
    )
    links.push(...branchLayout.links)

    branchOriginX += branchLayout.subtreeWidth + GAP_X
    totalSubtreeWidth += GAP_X + branchLayout.subtreeWidth
    maxChildHeight = Math.max(maxChildHeight, branchLayout.subtreeHeight)
  }

  return {
    nodes,
    links,
    subtreeWidth: Math.max(NODE_WIDTH, totalSubtreeWidth),
    subtreeHeight: maxChildHeight,
  }
}

function createLink(from: PositionedNode, to: PositionedNode, isCurrent: boolean): TreeLink {
  const x1 = from.x + from.width / 2
  const y1 = from.y + from.height
  const x2 = to.x + to.width / 2
  const y2 = to.y

  const pathData =
    Math.abs(x1 - x2) < 2
      ? `M ${x1} ${y1} L ${x2} ${y2}`
      : `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`

  return {
    fromKey: from.node.key,
    toKey: to.node.key,
    x1,
    y1,
    x2,
    y2,
    pathData,
    isCurrent,
    isPending: to.node.pending === true,
    isStub: to.node.loaded === false,
  }
}
