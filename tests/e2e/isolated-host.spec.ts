import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { startIsolatedHost } from './support/isolated-host.ts'

/**
 * Ticket 01: the isolated boot must prove it is isolated. Each assertion below exists because the
 * manual dev profile has already silently disappeared once on this machine — a harness that quietly
 * reused it would have "passed" against a composition nobody maintains.
 */

const repoRoot = resolve(import.meta.dirname, '../..')
const runnerStateFile = resolve(repoRoot, '.scratch/dsh-host.json')
const BOOT_TIMEOUT_MS = 180_000

function mtimeOrZero(path: string): number {
  return existsSync(path) ? Math.floor(statSync(path).mtimeMs) : 0
}

describe('隔离宿主现场（play-e2e 票据 01）', () => {
  it(
    '从源码重建 profile、服务插件路由，且关掉后不留临时目录',
    { timeout: BOOT_TIMEOUT_MS },
    async () => {
      // The plugin's package main is lib/index.js, so a stale or missing build would boot an old
      // composition and every later assertion would be measuring the wrong code.
      expect(existsSync(resolve(repoRoot, 'lib/index.js')), 'E2E 前必须先 pnpm run build').toBe(
        true,
      )

      const stateBefore = mtimeOrZero(runnerStateFile)
      const host = await startIsolatedHost({ repoRoot })
      try {
        expect(host.port).not.toBe(3099)
        expect(host.root).toContain('dsh-rrp-e2e-')
        expect(existsSync(host.root)).toBe(true)

        // Plugin routes are not behind the host's connection auth gate, so a 2xx with a JSON body
        // here is proof the whole composition — bundles, patch, plugin registration — loaded.
        const response = await fetch(`${host.baseUrl}/dsh-rrp/cards`)
        const body = await response.text()
        expect(response.status, body).toBe(200)
        expect(JSON.parse(body)).toBeTruthy()
      } finally {
        await host.close()
      }

      expect(existsSync(host.root), 'close() 必须销毁临时 DSH_HOME').toBe(false)
      // The dev runner's manifest belongs to a human's session; this harness must never write it.
      expect(mtimeOrZero(runnerStateFile)).toBe(stateBefore)
    },
  )

  it('连续起停三次，端口互不冲突且无残留', { timeout: BOOT_TIMEOUT_MS * 3 }, async () => {
    const roots: string[] = []
    for (let run = 0; run < 3; run++) {
      const host = await startIsolatedHost({ repoRoot, profileName: `e2e${run}` })
      roots.push(host.root)
      expect(host.port).toBeGreaterThan(0)
      await host.close()
    }
    expect(new Set(roots).size).toBe(3)
    for (const root of roots) {
      expect(existsSync(root), `第 ${roots.indexOf(root) + 1} 次启动的临时目录未清理`).toBe(false)
    }
  })
})
