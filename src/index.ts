/**
 * dsh-rrp — host half.
 *
 * Stage 1 skeleton: a mountable Cordis function plugin that does nothing yet
 * except prove the bundle composes, activates, and disposes cleanly (HMR
 * safety). No RP domain logic lives here — see docs/ACTIVE_TASK.md for the
 * stage route (Author / Chronicler / WorldState / Skills / …).
 */
import type { Context } from '@deepseek-ai/cordis'

/** Loader row id. Keep in sync with cordis.patch.yml. */
export const name = 'dsh-rrp'

/** No host services are required yet; stage 1 is intentionally inert. */
export const inject: string[] = []

const TAG = '[dsh-rrp]'

/**
 * Plugin body. Every registration must be a reversible effect so unloading /
 * hot reload releases it completely.
 */
export function apply(ctx: Context): void {
  console.log(`${TAG} host half active (stage 1 skeleton)`)

  ctx.effect(() => {
    return () => {
      console.log(`${TAG} host half disposed`)
    }
  }, 'dsh-rrp: host lifecycle')
}
