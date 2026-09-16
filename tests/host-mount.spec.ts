import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as rrp from '../src/index.ts'

/**
 * The mandatory HMR-safety check: mounting then disposing the fiber must
 * leave no residue behind (the host plugin currently registers only a
 * lifecycle effect, so a clean mount/dispose is the whole contract).
 */
describe('dsh-rrp host half', () => {
  it('mounts and disposes cleanly (HMR safety)', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(rrp)
    expect(fiber).toBeTruthy()
    await fiber.dispose()
  })
})
