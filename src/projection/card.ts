/**
 * dsh-rrp — the active-card session-projection unit.
 *
 * A whole-value \`rrp/card\` event adopts the card's model-facing setting. This
 * is what turns a card start into an actual setting: the Author's per-step
 * context reads this projection, so the world core and persona are present
 * without ever being stuffed into every message.
 */
import { z } from 'zod'
import { CARD_KEY, type CardContext } from '../card-types.ts'
import { rrpPayloadOf } from '../state-payload.ts'

const playerSchema = z.object({ name: z.string(), description: z.string().optional() })

const cardSchema = z.object({
  id: z.string(),
  name: z.string(),
  persona: z.string(),
  worldCore: z.string(),
  player: playerSchema.optional(),
})

const stateSchema = z.union([cardSchema, z.null()])

/** The projection definition registered into \`ctx.sessionProjections\`. */
export const cardProjection = {
  key: CARD_KEY,
  stateSchema,
  stateVersion: 1,
  init: (): CardContext | null => null,
  apply: (state: CardContext | null, event: { type: string; data?: unknown }): CardContext | null =>
    rrpPayloadOf(event)?.card ?? state,
  wire: {
    viewSchema: stateSchema,
    view: (state: CardContext | null): CardContext | null => state,
  },
}
