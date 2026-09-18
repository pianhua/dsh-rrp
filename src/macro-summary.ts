/**
 * dsh-rrp — the macro summary (大局编年) vocabulary.
 *
 * D11: a dedicated Summarizer Agent condenses the long arc into four macro
 * dimensions so the Author does not drift. Dependency-free so host and client
 * share one wording.
 */

/** The four macro dimensions the Summarizer maintains. */
export interface MacroSummary {
  /** 主线总目标 */
  goal: string
  /** 当前核心矛盾 */
  conflict: string
  /** 重大转折（按时间顺序） */
  turningPoints: string[]
  /** 伏笔与危机 */
  threads: string[]
}

/** Projection key, also the client `useProjection(key)` lookup key. */
export const SUMMARY_KEY = 'rrpSummary'

/** Render the summary as the Author's macro compass. */
export function renderMacroSummary(summary: MacroSummary): string {
  return [
    '【大局编年 · 宏观罗盘】',
    '主线总目标：' + summary.goal,
    '当前核心矛盾：' + summary.conflict,
    '重大转折：' + (summary.turningPoints.length > 0 ? summary.turningPoints.join('；') : '（暂无）'),
    '伏笔与危机：' + (summary.threads.length > 0 ? summary.threads.join('；') : '（暂无）'),
  ].join('\n')
}

/** Shown when a Summarizer pass changed nothing material. */
export const NO_SUMMARY_CHANGE = '（无实质变化）'

/**
 * Digest of the difference between two macro summaries; NO_SUMMARY_CHANGE when
 * a pass only reworded nothing. Mirrors diffWorldState's digest contract so the
 * Summarizer can short-circuit like the Chronicler (no wasted facts republish).
 */
export function diffMacroSummary(prior: MacroSummary, next: MacroSummary): string {
  const clauses: string[] = []
  if (prior.goal !== next.goal) clauses.push('主线总目标更新')
  if (prior.conflict !== next.conflict) clauses.push('核心矛盾更新')
  if (prior.turningPoints.join('\n') !== next.turningPoints.join('\n')) {
    clauses.push('重大转折更新（现 ' + String(next.turningPoints.length) + ' 条）')
  }
  if (prior.threads.join('\n') !== next.threads.join('\n')) {
    clauses.push('伏笔危机更新（现 ' + String(next.threads.length) + ' 条）')
  }
  return clauses.length === 0 ? NO_SUMMARY_CHANGE : clauses.join('；')
}
