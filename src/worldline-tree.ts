/**
 * dsh-rrp — the worldline tree fold (issue #28): pure, host/client shared.
 *
 * The save-map semantics live here and nowhere else: a node is ONE player
 * turn (every turn is an autosave), a fork session contributes only its LIVE
 * tail (the inherited prefix is the parent's own nodes — the durable fork
 * cut), and lineage comes from the host's authoritative fork stamps
 * (parentSession + seed length converted to turns by the caller). We never
 * invent coordinates or a parallel session model: the tree is a fold of
 * facts the host already keeps.
 */
import type { WorldlineBadge } from './worldline-digest.ts'

export type { WorldlineBadge } from './worldline-digest.ts'

/** One player turn as the fold sees it (excerpts pre-cut by the caller). */
export interface WorldlineTurnFact {
  /** 0-based turn index over the session's FULL log (inherited prefix included). */
  turn: number
  /** Seq of the player message; also the fork boundary for rerolls. */
  seq: number
  playerExcerpt: string
  proseExcerpt: string
  badge?: WorldlineBadge
}

/** One live session as the fold sees it. */
export interface WorldlineSessionFact {
  id: string
  /** Card ownership (from the rrpCard projection); sessions without a card never enter the map. */
  cardId: string
  cardName: string
  title: string
  /** Host header.parentSession — present exactly on forked worldlines. */
  parentId?: string
  /** How many FULL turns of the parent this fork inherited (seedLength converted). */
  seedTurns?: number
  /**
   * True for COLD skeleton facts (issue #29): the session exists on disk but is
   * not loaded, so there are no turn digests — only lineage and a title. The
   * fold renders it as one placeholder node instead of skipping it.
   */
  stub?: boolean
  /** Every player turn of this session, in order, turn indices 0..n-1. */
  turns: readonly WorldlineTurnFact[]
}

/** One map node = one turn of one worldline. */
export interface WorldlineNode {
  key: string
  sessionId: string
  sessionTitle: string
  turn: number
  /** Seq of the player message — the fork boundary for "reroll from here". */
  seq: number
  playerExcerpt: string
  proseExcerpt: string
  badge?: WorldlineBadge
  /**
   * False exactly on cold skeleton nodes (issue #29): the session is on disk
   * but not loaded, so excerpts are empty and reroll/load must not be offered.
   * Absent means true (every turn-bearing node is live by construction).
   */
  loaded?: boolean
  /**
   * True for freshly forked sessions that have not yet recorded their first turn.
   */
  pending?: boolean
  /** True when more than one line continues from this turn (its children). */
  fork: boolean
  children: WorldlineNode[]
}

/** One card's forest: roots are main lines (and orphans, defensively). */
export interface WorldlineTree {
  cardId: string
  cardName: string
  roots: WorldlineNode[]
}

/**
 * Fold session facts into per-card worldline trees.
 *
 * Live sessions contribute their turn chains exactly as before. Freshly forked
 * live sessions without turns yet become pending placeholder nodes at the cut.
 * Cold skeleton facts (issue #29 — `stub: true`, no turns) become single placeholder
 * nodes: they hang off the parent's visible chain tail when the parent is in the map,
 * nest under a parent placeholder, or stand as roots when no ancestor is visible.
 *
 * @param sessions - live + skeleton session facts (any order; roots follow input order).
 * @param hidden - soft-archived session ids; their whole subtree is pruned.
 * @returns one tree per card that has visible sessions.
 */
export function foldWorldlineTrees(
  sessions: readonly WorldlineSessionFact[],
  hidden: readonly string[] = [],
): WorldlineTree[] {
  const byId = new Map<string, WorldlineSessionFact>()
  for (const session of sessions) if (session.cardId.length > 0) byId.set(session.id, session)

  // Hide a line = hide everything grown from it (subtree semantics, #28).
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

  // Group by card, preserving first-seen order for roots.
  const trees = new Map<string, WorldlineTree>()
  const pushRoot = (head: WorldlineNode, session: WorldlineSessionFact): void => {
    let tree = trees.get(session.cardId)
    if (tree === undefined) {
      tree = { cardId: session.cardId, cardName: session.cardName, roots: [] }
      trees.set(session.cardId, tree)
    }
    tree.roots.push(head)
  }

  // First pass: every session's live tail becomes a linear chain; every
  // skeleton becomes a single placeholder node; freshly forked live sessions
  // with no turns yet become a single pending leaf on the branch.
  const chains = new Map<string, { head: WorldlineNode; tail: WorldlineNode }>()
  const stubs = new Map<string, WorldlineNode>()
  for (const session of visible) {
    const seed = session.seedTurns ?? 0
    const live = session.turns.filter((entry) => entry.turn >= seed)
    if (live.length === 0) {
      if (session.stub === true) {
        stubs.set(session.id, {
          key: session.id + ':stub',
          sessionId: session.id,
          sessionTitle: session.title,
          turn: -1,
          seq: -1,
          playerExcerpt: '',
          proseExcerpt: '',
          loaded: false,
          fork: false,
          children: [],
        })
      } else if (session.parentId !== undefined) {
        // Freshly forked live session: waiting for first player message on this branch.
        const pendingNode: WorldlineNode = {
          key: session.id + ':' + String(seed),
          sessionId: session.id,
          sessionTitle: session.title,
          turn: seed,
          seq: -1,
          playerExcerpt: '',
          proseExcerpt: '',
          pending: true,
          fork: false,
          children: [],
        }
        chains.set(session.id, { head: pendingNode, tail: pendingNode })
      }
      continue
    }
    let head: WorldlineNode | undefined
    let prev: WorldlineNode | undefined
    for (const turn of live) {
      const node: WorldlineNode = {
        key: session.id + ':' + String(turn.turn),
        sessionId: session.id,
        sessionTitle: session.title,
        turn: turn.turn,
        seq: turn.seq,
        playerExcerpt: turn.playerExcerpt,
        proseExcerpt: turn.proseExcerpt,
        ...(turn.badge === undefined ? {} : { badge: turn.badge }),
        fork: false,
        children: [],
      }
      head ??= node
      if (prev !== undefined) prev.children.push(node)
      prev = node
    }
    if (head !== undefined && prev !== undefined) chains.set(session.id, { head, tail: prev })
  }

  // Second pass: attach chains at the durable fork cut — the parent's LAST
  // inherited turn (recursively searching ancestors if needed) — or promote
  // them to roots (main lines and orphans).
  for (const session of visible) {
    const chain = chains.get(session.id)
    if (chain !== undefined) {
      // The fork grows from the parent's turn seedTurns - 1 (0-based).
      const seed = session.seedTurns ?? 0
      const parent = session.parentId !== undefined ? byId.get(session.parentId) : undefined
      const cut =
        parent !== undefined && !pruned.has(parent.id) && seed > 0
          ? findNodeInLineage(parent.id, seed - 1, byId, chains, pruned)
          : undefined
      if (cut !== undefined) {
        cut.children.push(chain.head)
        continue
      }
      pushRoot(chain.head, session)
      continue
    }
    // Skeleton: no turns, so no exact cut. Attach to the parent's visible
    // chain tail / parent placeholder when possible, else stand as a root.
    const stub = stubs.get(session.id)
    if (stub === undefined) continue
    const parent = session.parentId !== undefined ? byId.get(session.parentId) : undefined
    if (parent !== undefined && !pruned.has(parent.id)) {
      const parentChain = chains.get(parent.id)
      if (parentChain !== undefined) {
        parentChain.tail.children.push(stub)
        continue
      }
      const parentStub = stubs.get(parent.id)
      if (parentStub !== undefined) {
        parentStub.children.push(stub)
        continue
      }
    }
    pushRoot(stub, session)
  }

  // Mark fork points: a node with more than one continuation.
  for (const tree of trees.values()) markForks(tree.roots)
  return [...trees.values()]
}

function findNodeInLineage(
  startParentId: string,
  turn: number,
  byId: Map<string, WorldlineSessionFact>,
  chains: Map<string, { head: WorldlineNode; tail: WorldlineNode }>,
  pruned: Set<string>,
): WorldlineNode | undefined {
  let currId: string | undefined = startParentId
  const visited = new Set<string>()
  while (currId !== undefined && !visited.has(currId) && !pruned.has(currId)) {
    visited.add(currId)
    const chain = chains.get(currId)
    const found = findNode(chain, turn)
    if (found !== undefined) return found
    const currSession = byId.get(currId)
    currId = currSession?.parentId
  }
  return undefined
}

function findNode(
  chain: { head: WorldlineNode; tail: WorldlineNode } | undefined,
  turn: number,
): WorldlineNode | undefined {
  if (chain === undefined) return undefined
  let current: WorldlineNode | undefined = chain.head
  while (current !== undefined) {
    if (current.turn === turn) return current
    current = current.children[0]
  }
  return undefined
}

function markForks(nodes: readonly WorldlineNode[]): void {
  for (const node of nodes) {
    node.fork = node.children.length > 1
    markForks(node.children)
  }
}
