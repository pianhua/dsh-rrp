import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'lib/**',
      'node_modules/**',
      'docs/**',
      'cards/**',
      'dist/**',
      '.worktrees/**',
      '.agents/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Host-facing service bags are structurally typed and routinely carry a
      // few members a given caller does not read; the wide any here is the
      // seam, not sloppiness.
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // TS owns undefined-ness here, and the plain-.mjs harness files (stub plugins, isolated-host
    // boot) reference Node globals that ESLint cannot see without a globals package.
    files: ['tests/**/*.ts', 'tests/**/*.mjs', 'scripts/**/*.mjs'],
    rules: {
      'no-undef': 'off',
    },
  },
)
