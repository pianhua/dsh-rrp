/**
 * dsh-rrp — client (browser) half.
 *
 * Stage 1 skeleton: proves the client bundle loads and disposes reversibly.
 * The WorldState sidebar tab arrives in stage 3; this file only reserves the
 * seat so the wiring is verified end to end.
 */
import type { RrpClientContext } from './context-types.ts'

/** Bundle id. The client-modules compose keys on the package name dsh-rrp. */
export const name = 'dsh-rrp/client'

/** Client runtime services required before mounting. */
export const inject = ['slots']

const TAG = '[dsh-rrp]'

/** Reserved slot; the WorldState panel replaces the null renderer in stage 3. */
const RESERVED_SLOT = 'sidebar.footer'

/** Client plugin body. Registers only reversible effects. */
export function apply(ctx: RrpClientContext): void {
  ctx.effect(() => {
    console.log(`${TAG} client half active (stage 1 skeleton)`)
    return () => {
      console.log(`${TAG} client half disposed`)
    }
  }, 'dsh-rrp: client lifecycle')

  // Guarded reservation: an undeclared slot or an unexpected registry shape
  // must degrade this one seat, never reject the plugin fiber.
  try {
    ctx.slots.inject(RESERVED_SLOT, () =>
      ctx.slots.register({ name: RESERVED_SLOT, key: 'dsh-rrp' }, () => null),
    )
  } catch (error) {
    console.warn(`${TAG} reserved seat registration failed:`, error)
  }
}
