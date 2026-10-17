/**
 * dsh-rrp — pure worldline topology fold (issue #28).
 *
 * Digests provide turn facts; this module only decides where each session line
 * mounts. A child's inherited prefix is never rendered twice.
 */
import type { WorldlineBadge, WorldlineTurnMeta } from './worldline-digest.ts'

export type { WorldlineBadge, WorldlineTurnMeta } from './worldline-digest.ts'

export interface WorldlineTurnFact {
  turn: number
  seq: number
  playerExcerpt: string
  proseExcerpt: string
  badge?: WorldlineBadge
  meta?: WorldlineTurnMeta
}

export interface WorldlineSessionFact {
  id: string
  cardId: string
  cardName: string
  title: string
  parentId?: string
  seedTurns?: number
  seedKnown?: boolean
  headTurn?: number
  stub?: boolean
  turns: readonly WorldlineTurnFact[]
}

export interface WorldlineNode {
  key: string
  sessionId: string
  sessionTitle: string
  turn: number
  seq: number
  playerExcerpt: string
  proseExcerpt: string
  badge?: WorldlineBadge
  meta?: WorldlineTurnMeta
  isHead?: boolean
  seedKnown?: boolean
  loaded?: boolean
  pending?: boolean
  fork: boolean
  children: WorldlineNode[]
}

export interface WorldlineTree {
  cardId: string
  cardName: string
  roots: WorldlineNode[]
}

type Chain = { head: WorldlineNode; tail: WorldlineNode }

export function foldWorldlineTrees(
  sessions: readonly WorldlineSessionFact[],
  hidden: readonly string[] = [],
): WorldlineTree[] {
  const byId = new Map<string, WorldlineSessionFact>()
  for (const session of sessions) {
    if (session.cardId.length === 0) continue
    if (byId.has(session.id))
      console.warn('[dsh-rrp] duplicate worldline session id: ' + session.id)
    byId.set(session.id, session)
  }

  const pruned = new Set(hidden)
  let grew = true
  while (grew) {
    grew = false
    for (const session of byId.values()) {
      if (
        session.parentId !== undefined &&
        pruned.has(session.parentId) &&
        !pruned.has(session.id)
      ) {
        pruned.add(session.id)
        grew = true
      }
    }
  }

  const visible = [...byId.values()].filter((session) => !pruned.has(session.id))
  const trees = new Map<string, WorldlineTree>()
  const pushRoot = (node: WorldlineNode, session: WorldlineSessionFact): void => {
    let tree = trees.get(session.cardId)
    if (tree === undefined) {
      tree = { cardId: session.cardId, cardName: session.cardName, roots: [] }
      trees.set(session.cardId, tree)
    }
    tree.roots.push(node)
  }

  const chains = new Map<string, Chain>()
  const stubs = new Map<string, WorldlineNode>()
  for (const session of visible) {
    const seed = validSeed(session.seedTurns)
    const localTurns = session.turns.filter((entry) => entry.turn >= seed)
    if (localTurns.length === 0) {
      if (session.stub === true) {
        stubs.set(session.id, {
          key: session.id + ':stub',
          sessionId: session.id,
          sessionTitle: session.title,
          turn: -1,
          seq: -1,
          playerExcerpt: '',
          proseExcerpt: '',
          ...(session.seedKnown === undefined ? {} : { seedKnown: session.seedKnown }),
          loaded: false,
          fork: false,
          children: [],
        })
      } else if (session.parentId !== undefined) {
        const pending: WorldlineNode = {
          key: session.id + ':' + String(seed),
          sessionId: session.id,
          sessionTitle: session.title,
          turn: seed,
          seq: -1,
          playerExcerpt: '',
          proseExcerpt: '',
          ...(session.seedKnown === undefined ? {} : { seedKnown: session.seedKnown }),
          pending: true,
          fork: false,
          children: [],
        }
        chains.set(session.id, { head: pending, tail: pending })
      }
      continue
    }

    let head: WorldlineNode | undefined
    let previous: WorldlineNode | undefined
    for (const turn of localTurns) {
      const node: WorldlineNode = {
        key: session.id + ':' + String(turn.turn),
        sessionId: session.id,
        sessionTitle: session.title,
        turn: turn.turn,
        seq: turn.seq,
        playerExcerpt: turn.playerExcerpt,
        proseExcerpt: turn.proseExcerpt,
        ...(turn.badge === undefined ? {} : { badge: turn.badge }),
        ...(turn.meta === undefined ? {} : { meta: turn.meta }),
        ...(session.headTurn === undefined || turn.turn !== session.headTurn
          ? {}
          : { isHead: true }),
        fork: false,
        children: [],
      }
      head ??= node
      if (previous !== undefined) previous.children.push(node)
      previous = node
    }
    if (head !== undefined && previous !== undefined)
      chains.set(session.id, { head, tail: previous })
  }

  for (const session of visible) {
    const branch = chains.get(session.id)
    const stub = stubs.get(session.id)
    if (branch === undefined && stub === undefined) continue
    const node = branch?.head ?? stub!
    const parent = session.parentId === undefined ? undefined : byId.get(session.parentId)
    // A session WITHOUT a parentId is a main line by birth: it roots its card's
    // tree and its position is inherently known. 位置未知 is only for forks
    // whose parent is missing from the map (or cross-card) — and for turn-zero
    // forks, whose zero cut is exact by definition.
    if (session.parentId === undefined) {
      pushRoot(node, session)
      continue
    }
    if (
      parent === undefined ||
      pruned.has(parent.id) ||
      parent.cardId !== session.cardId ||
      (session.seedTurns === 0 && session.seedKnown !== false)
    ) {
      if (parent === undefined || pruned.has(parent.id) || parent.cardId !== session.cardId) {
        markSeedUnknown(node)
      }
      pushRoot(node, session)
      continue
    }

    const cut = findNodeInLineage(
      parent.id,
      validSeed(session.seedTurns) - 1,
      session.cardId,
      byId,
      chains,
      stubs,
      pruned,
    )
    if (cut !== undefined) {
      cut.children.push(node)
      continue
    }

    const ancestorTail = nearestKnownAncestorTail(
      parent.id,
      session.cardId,
      byId,
      chains,
      stubs,
      pruned,
    )
    if (ancestorTail !== undefined) {
      // The cut is known but the parent's own turns are cold: the stub hangs
      // under the parent stub, which IS the honest lineage position. Only a
      // genuinely unresolved cut earns the 位置未知 badge.
      if (session.seedKnown !== true) markSeedUnknown(node)
      ancestorTail.children.push(node)
    } else {
      markSeedUnknown(node)
      pushRoot(node, session)
    }
  }

  for (const tree of trees.values()) markForks(tree.roots, new Set<string>())
  return [...trees.values()]
}

function validSeed(seed: number | undefined): number {
  return typeof seed === 'number' && Number.isSafeInteger(seed) && seed >= 0 ? seed : 0
}

function markSeedUnknown(node: WorldlineNode): void {
  node.seedKnown = false
}

function findNodeInLineage(
  startParentId: string,
  turn: number,
  cardId: string,
  byId: Map<string, WorldlineSessionFact>,
  chains: Map<string, Chain>,
  stubs: Map<string, WorldlineNode>,
  pruned: Set<string>,
): WorldlineNode | undefined {
  let currentId: string | undefined = startParentId
  const visited = new Set<string>()
  while (currentId !== undefined && !visited.has(currentId) && !pruned.has(currentId)) {
    visited.add(currentId)
    const currentSession = byId.get(currentId)
    if (currentSession?.cardId !== cardId) return undefined
    const found = findNode(chains.get(currentId), turn)
    if (found !== undefined) return found
    currentId = currentSession?.parentId
  }
  return undefined
}

function nearestKnownAncestorTail(
  startParentId: string,
  cardId: string,
  byId: Map<string, WorldlineSessionFact>,
  chains: Map<string, Chain>,
  stubs: Map<string, WorldlineNode>,
  pruned: Set<string>,
): WorldlineNode | undefined {
  let currentId: string | undefined = startParentId
  const visited = new Set<string>()
  while (currentId !== undefined && !visited.has(currentId) && !pruned.has(currentId)) {
    visited.add(currentId)
    const currentSession = byId.get(currentId)
    if (currentSession?.cardId !== cardId) return undefined
    const chain = chains.get(currentId)
    if (chain !== undefined) return chain.tail
    const stub = stubs.get(currentId)
    if (stub !== undefined) return stub
    currentId = currentSession?.parentId
  }
  return undefined
}

function findNode(chain: Chain | undefined, turn: number): WorldlineNode | undefined {
  if (chain === undefined) return undefined
  let current: WorldlineNode | undefined = chain.head
  const visited = new Set<WorldlineNode>()
  while (current !== undefined && !visited.has(current)) {
    const currentNode: WorldlineNode = current
    visited.add(currentNode)
    if (currentNode.turn === turn) return currentNode
    const nextNode: WorldlineNode | undefined = currentNode.children.find(
      (child: WorldlineNode) => child.sessionId === currentNode.sessionId,
    )
    current = nextNode
  }
  return undefined
}

function markForks(nodes: readonly WorldlineNode[], visited: Set<string>): void {
  for (const node of nodes) {
    if (visited.has(node.key)) continue
    visited.add(node.key)
    node.fork = node.children.length > 1
    markForks(node.children, visited)
  }
}
