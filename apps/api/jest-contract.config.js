/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/test/contract/**/*.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  testTimeout: 30_000,
  // Run sequentially — tests share a single dev DB (tmpfs)
  maxWorkers: 1,
  // ts-jest should not typecheck (characterization tests use any liberally)
  globals: {
    'ts-jest': {
      diagnostics: false,
    },
  },
  forceExit: true,
};