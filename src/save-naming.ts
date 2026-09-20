/**
 * dsh-rrp — save/branch title vocabulary (issue #37).
 *
 * Pure, dependency-free title schemes shared by the gallery (new main-line
 * saves) and the worldline tab (fork branches). Host grouping supplies the
 * drawer (one workspace per card); these schemes make the drawer readable:
 * every branch name carries its parent save's full title, so a flat roster
 * inside one card workspace never hides which save a branch was cut from.
 *
 *   女仆与大小姐·主线      女仆与大小姐·主线2
 *   女仆与大小姐·主线·线1   女仆与大小姐·主线2·线1
 */

/** Base title of one card's main-line save. */
export function mainTitle(cardName: string): string {
  return cardName + '·主线'
}

/**
 * The title for a NEW main-line save of this card: the base, or base2, base3…
 * when earlier saves already occupy it. `existing` is every roster title in
 * the card workspace (any session kind — titles are workspace-unique by eye).
 */
export function uniqueMainTitle(cardName: string, existing: readonly string[]): string {
  const base = mainTitle(cardName)
  if (!existing.includes(base)) return base
  for (let n = 2; ; n += 1) {
    const candidate = base + String(n)
    if (!existing.includes(candidate)) return candidate
  }
}

/**
 * The title for a NEW branch cut from `parentTitle`: 「父档全名·线N」, where N
 * is the count of the parent's existing branches plus one. `siblingBranches`
 * carries the titles of every session already forked from the same parent.
 */
export function branchTitle(parentTitle: string, siblingBranches: readonly string[]): string {
  return parentTitle + '·线' + String(siblingBranches.length + 1)
}
