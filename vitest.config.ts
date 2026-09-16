import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Vitest config for dsh-rrp.
 *
 * The one override: \`@deepseek-ai/dsh-client-ui-primitives\` is a browser
 * platform module (see tsdown.config.ts) that is never installed, so the client
 * unit tests alias it to a neutral stub. Everything else uses the defaults.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@deepseek-ai/dsh-client-ui-primitives': fileURLToPath(
        new URL('./tests/stubs/ui-primitives.ts', import.meta.url),
      ),
    },
  },
})
