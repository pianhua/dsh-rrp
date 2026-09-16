import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as rrp from '../src/index.ts'

/**
 * The mandatory HMR-safety check: mounting then disposing the fiber must leave
 * no residue behind. Stage 2 adds file materialization, so the test points
 * DSH_HOME at a throwaway directory and asserts the preset is cleaned up.
 */
describe('dsh-rrp host half', () => {
  let home: string
  let previousHome: string | undefined

  beforeEach(() => {
    previousHome = process.env.DSH_HOME
    home = mkdtempSync(join(tmpdir(), 'dsh-rrp-host-'))
    process.env.DSH_HOME = home
  })

  afterEach(() => {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  })

  it('mounts and disposes cleanly (HMR safety)', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(rrp)
    expect(fiber).toBeTruthy()
    await fiber.dispose()
  })
})
