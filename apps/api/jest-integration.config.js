/** @type {import('jest').Config} */
// P1 — integration tests: new behavior built by phase work items, running
// against the live dev stack. Distinct from characterization (which pins
// pre-existing behavior and only changes via the intentional-change ritual).
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  testTimeout: 30_000,
  // Run sequentially — tests share a single dev DB (tmpfs)
  maxWorkers: 1,
  forceExit: true,
};
