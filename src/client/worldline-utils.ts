import type { WorldlineNode, WorldlineTree } from '../worldline-tree.ts'

export type RelativeTimeUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

export interface RelativeTime {
  value: number
  unit: RelativeTimeUnit
}

export interface WorldlineBranch {
  cardId: string
  cardName: string
  sessionId: string
  title: string
  nodes: WorldlineNode[]
  latest?: WorldlineNode
  latestTurn?: number
  badge?: WorldlineNode['badge']
  descendantCount: number
  cold: boolean
  pending: boolean
  seedKnown?: boolean
  activity?: RelativeTime
}

export interface WorldlineBranchGroup {
  cardId: string
  cardName: string
  branches: WorldlineBranch[]
}

export interface FlattenBranchOptions {
  activityBySession?: Readonly<Record<string, string | number>>
  now?: number
}

export function flattenWorldlineBranches(
  trees: readonly WorldlineTree[],
  options: FlattenBranchOptions = {},
): WorldlineBranchGroup[] {
  return trees.map((tree) => {
    const bySession = new Map<string, WorldlineBranch>()
    const descendants = new Map<string, Set<string>>()
    const visit = (node: WorldlineNode, ancestorSessionIds: readonly string[]): void => {
      let branch = bySession.get(node.sessionId)
      if (branch === undefined) {
        branch = {
          cardId: tree.cardId,
          cardName: tree.cardName,
          sessionId: node.sessionId,
          title: node.sessionTitle,
          nodes: [],
          descendantCount: 0,
          cold: false,
          pending: false,
        }
        bySession.set(node.sessionId, branch)
      }
      branch.nodes.push(node)
      branch.title = branch.title || node.sessionTitle
      branch.cold ||= node.loaded === false
      branch.pending ||= node.pending === true
      if (node.seedKnown === false) branch.seedKnown = false
      if (node.turn >= 0 && (branch.latest === undefined || node.turn > branch.latest.turn)) {
        branch.latest = node
        branch.latestTurn = node.turn
        branch.badge = node.badge
      }
      for (const ancestorId of ancestorSessionIds) {
        if (ancestorId === node.sessionId) continue
        let set = descendants.get(ancestorId)
        if (set === undefined) {
          set = new Set<string>()
          descendants.set(ancestorId, set)
        }
        set.add(node.sessionId)
      }
      const nextAncestors = [...ancestorSessionIds, node.sessionId]
      for (const child of node.children) visit(child, nextAncestors)
    }
    for (const root of tree.roots) visit(root, [])
    for (const branch of bySession.values()) {
      branch.title ||= branch.sessionId
      branch.descendantCount = descendants.get(branch.sessionId)?.size ?? 0
      const rawActivity = options.activityBySession?.[branch.sessionId]
      branch.activity = relativeTimeOf(rawActivity, options.now)
    }
    return {
      cardId: tree.cardId,
      cardName: tree.cardName,
      branches: [...bySession.values()],
    }
  })
}

export function branchTitleForCount(parentTitle: string, childCount: number): string {
  return parentTitle + '·线' + String(Math.max(0, Math.trunc(childCount)) + 1)
}

export function directChildCount(trees: readonly WorldlineTree[], sessionId: string): number {
  const children = new Set<string>()
  const visit = (node: WorldlineNode): void => {
    if (node.sessionId === sessionId) {
      for (const child of node.children) {
        if (child.sessionId !== sessionId) children.add(child.sessionId)
      }
    }
    for (const child of node.children) visit(child)
  }
  for (const tree of trees) for (const root of tree.roots) visit(root)
  return children.size
}

export function relativeTimeOf(
  timestamp: string | number | undefined,
  now = Date.now(),
): RelativeTime | undefined {
  if (timestamp === undefined) return undefined
  const at = typeof timestamp === 'number' ? timestamp : Date.parse(timestamp)
  if (!Number.isFinite(at)) return undefined
  const elapsed = Math.max(0, now - at)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  const week = 7 * day
  const month = 30 * day
  const year = 365 * day
  if (elapsed < minute) return { value: Math.max(1, Math.floor(elapsed / 1000)), unit: 'second' }
  if (elapsed < hour) return { value: Math.floor(elapsed / minute), unit: 'minute' }
  if (elapsed < day) return { value: Math.floor(elapsed / hour), unit: 'hour' }
  if (elapsed < week) return { value: Math.floor(elapsed / day), unit: 'day' }
  if (elapsed < month) return { value: Math.floor(elapsed / week), unit: 'week' }
  if (elapsed < year) return { value: Math.floor(elapsed / month), unit: 'month' }
  return { value: Math.floor(elapsed / year), unit: 'year' }
}

export function visibleTurnWindow(
  total: number,
  viewportStart: number,
  viewportSize: number,
  buffer = 5,
): { start: number; end: number } {
  const safeTotal = Math.max(0, Math.trunc(total))
  const safeStart = Math.min(Math.max(0, Math.trunc(viewportStart)), safeTotal)
  const safeSize = Math.max(0, Math.trunc(viewportSize))
  return {
    start: Math.max(0, safeStart - buffer),
    end: Math.min(safeTotal, safeStart + safeSize + buffer),
  }
}
