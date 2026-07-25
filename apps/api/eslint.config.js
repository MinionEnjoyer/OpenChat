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
        project: './tsconfig.json',
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

      // ── No `any` in src — matches mobile config strictness ──
      // TODO: 48 sites — see BACKLOG. Typed incrementally; must not grow.
      '@typescript-eslint/no-explicit-any': 'warn',

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
    files: ['test/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-duplicate-imports': 'off',
    },
  },

  // ── Prisma migrations: generated code, skip ──
  {
    ignores: ['prisma/migrations/**'],
  },
];
