const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');

/**
 * Lint boundaries for apps/api — NestJS + TypeScript backend.
 *
 * Follows the same flat-config conventions as apps/mobile/eslint.config.js
 * but adapted for a backend: no React/JSX rules, no domain/ UI boundaries.
 * Strictness matches the mobile config where applicable.
 */
module.exports = [
  // ── Global ignores ──
  {
    ignores: ['node_modules/**', 'dist/**', '**/*.d.ts'],
  },

  // ── Base TS config for all TypeScript files ──
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // Core TS rules
      ...tseslint.configs.recommended.rules,

      // ── Log through pino, not console (mobile equivalent: no-console) ──
      'no-console': 'error',

      // Existing API boundaries still contain deliberate `any` values. Keep
      // this disabled until they can be removed as a dedicated typed-boundary
      // migration; warnings are not a usable baseline because CI enforces
      // --max-warnings=0.
      '@typescript-eslint/no-explicit-any': 'off',

      // ── Unused vars: error on the variable, ok on rest args ──
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],

      // ── Safe type-aware rules ──
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // ── Import hygiene ──
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-duplicate-imports': 'error',
    },
  },

  // ── Test files: relax rules for mocks, fixtures, test internals ──
  {
    files: ['test/**/*.ts', 'src/**/*.spec.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-duplicate-imports': 'off',
    },
  },

  // ── Prisma migrations: generated code, skip ──
  {
    ignores: ['prisma/migrations/**'],
  },
];
