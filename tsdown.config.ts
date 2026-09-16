import { defineConfig } from 'tsdown'

/**
 * tsdown build for dsh-rrp.
 *
 * Two artifacts, mirroring the official DSH client preset
 * (packages/client/tsdown.client.ts) for an external package:
 *
 * - lib/index.js   — host half: plain ESM for Node, DSH peer deps external.
 * - lib/client.js  — browser half: a CJS closure factory wrapped as
 *                    `window.__ModuleLoader__.load({ id, factory })`, with only
 *                    baseline platform modules left as externals and everything
 *                    else inlined. A `require()` the loader module table cannot
 *                    answer is a guaranteed runtime throw, so nothing else may
 *                    stay external.
 *
 * Types are emitted separately by `tsc -p tsconfig.build.json` into lib/types
 * (see package.json scripts), not by tsdown — the client banner/footer would
 * corrupt a declaration emit for that face.
 */

/** Bundle id: the client-modules compose keys on the package name. */
const CLIENT_ID = 'dsh-rrp'

/**
 * Baseline platform modules the web shell seeds into its frozen module table
 * (the PLATFORM_MODULES list): resolvable through the injected `require`,
 * never bundled.
 */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  '@deepseek-ai/dsh-client-ui-primitives',
]

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2022',
    // Let the extension follow package.json "type": "module" → lib/index.js.
    fixedExtension: false,
    dts: false,
    sourcemap: false,
    clean: false,
  },
  {
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    sourcemap: false,
    clean: false,
    deps: {
      neverBundle: [...CLIENT_EXTERNALS],
      alwaysBundle: (source: string) => !CLIENT_EXTERNALS.includes(source),
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(CLIENT_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
