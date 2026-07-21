/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/test/characterization/**/*.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  testTimeout: 30_000,
  globalSetup: '<rootDir>/test/characterization/global-setup.ts',
  // Run sequentially — tests share a single dev DB (tmpfs)
  maxWorkers: 1,
  // Force exit to clean up WS connections
  forceExit: true,
};
