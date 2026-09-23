import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

/**
 * Vitest config for dsh-rrp.
 *
 * The client alias maps \`@deepseek-ai/dsh-client-ui-primitives\`, an uninstalled
 * browser platform module (see tsdown.config.ts), to a neutral stub for unit tests.
 */
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '.worktrees/**'],
  },
  resolve: {
    alias: {
      '@deepseek-ai/dsh-client-ui-primitives': fileURLToPath(
        new URL('./tests/stubs/ui-primitives.ts', import.meta.url),
      ),
    },
  },
})
