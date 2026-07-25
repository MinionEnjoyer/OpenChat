// eslint-config-expo already registers the `import` and `@typescript-eslint`
// plugins; re-declaring either here is a hard config error.
const expoConfig = require('eslint-config-expo/flat');

/**
 * Lint boundaries for apps/mobile.
 *
 * 06 §2 defines the allowed dependency directions and says plainly that
 * "violations are lint errors, not review comments" — so the architecture is
 * enforced here rather than in someone's head. Each zone below maps to a line
 * of that spec section.
 */
module.exports = [
  ...expoConfig,
  {
    ignores: ['node_modules/**', 'android/**', 'ios/**', 'src/**/*.d.ts', '.expo/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // ── 06 §2: ui/ and domain/ import nothing app-level ──
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/ui',
              from: './src',
              except: ['./ui'],
              message:
                'ui/ is a leaf: design-system primitives may not depend on app modules (06 §2).',
            },
            {
              target: './src/domain',
              from: './src',
              except: ['./domain', './api'],
              message:
                'domain/ is pure logic: it may not depend on app modules (06 §2). It MAY import type from api/.',
            },
          ],
        },
      ],

      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // A feature's public surface is its index.ts; reaching past it
              // couples two features to each other's internals (06 §2).
              group: [
                '**/features/*/screens/*',
                '**/features/*/components/*',
                '**/features/*/hooks/*',
              ],
              message:
                'Import a feature through its public index.ts, not its internals (06 §2).',
            },
          ],
        },
      ],

      // ── 04 §10: log through the logger so events reach the ring buffer ──
      'no-console': 'error',

      // ── NFR-08: no `any` in src ──
      '@typescript-eslint/no-explicit-any': 'error',

      // ── NFR-11: user-facing text comes from ui/strings.ts, never a literal ──
      'react/jsx-no-literals': ['error', { noStrings: true, ignoreProps: true }],
    },
  },
  {
    // ── 06 §2: domain/ is pure — zero React Native imports; type-only api/ ok ──
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              message: 'domain/ must stay pure: no React Native imports (06 §2).',
            },
            {
              name: 'react',
              message: 'domain/ must stay pure: no React imports (06 §2).',
            },
          ],
          patterns: [
            {
              group: ['../api', '../api/*', '../../api', '../../api/*'],
              message: 'domain/ may only use type-only imports from src/api (import type { … }).',
              allowTypeImports: true,
            },
            {
              group: [
                '../features', '../features/*',
                '../lib', '../lib/*',
                '../navigation', '../navigation/*',
                '../realtime', '../realtime/*',
                '../stores', '../stores/*',
                '../sync', '../sync/*',
                '../ui', '../ui/*',
                '../../features', '../../features/*',
                '../../lib', '../../lib/*',
                '../../navigation', '../../navigation/*',
                '../../realtime', '../../realtime/*',
                '../../stores', '../../stores/*',
                '../../sync', '../../sync/*',
                '../../ui', '../../ui/*',
              ],
              message: 'domain/ must stay pure: no app-level value imports (06 §2).',
            },
          ],
        },
      ],
    },
  },
  {
    // ── 06 §3: sync/ is the single writer to the server-state cache ──
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/sync/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='setQueryData']",
          message:
            'Only sync/ may write the query cache; route this through sync/ (06 §3).',
        },
      ],
    },
  },
  {
    // Tests may reach for internals and assert on console output.
    files: ['**/__tests__/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
