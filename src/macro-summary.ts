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

/** Session event type carrying a complete post-change summary (whole-value rule). */
export const SUMMARY_EVENT = 'rrp/summary'

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
