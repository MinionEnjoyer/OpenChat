/** @type {import('jest').Config} */
// Property-test runner for FR-ROLE-002: cross-package permission calculator
// comparison.  Imports both apps/api/src/permissions/permissions.ts and
// apps/mobile/src/permissions.ts in the same test file.
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/test/property/**/*.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  testTimeout: 30_000,
  // Pure-function tests — no DB needed.
  maxWorkers: 1,
  forceExit: true,
};
