/**
 * Unit tests for apps/mobile.
 *
 * The contract consumer suite under src/api/__tests__/contract/ is run by the
 * api package's contract runner (it validates generated types against
 * contracts/), so it is excluded here to keep this config to unit scope.
 */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^expo-notifications$': '<rootDir>/src/__mocks__/expo-notifications.ts',
    '^@expo/vector-icons$': '<rootDir>/src/__mocks__/@expo-vector-icons.ts',
    '^expo-audio$': '<rootDir>/src/__mocks__/expo-audio.ts',
    '^@react-native-firebase/messaging$': '<rootDir>/src/__mocks__/react-native-firebase-messaging.ts',
  },
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts?(x)'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/src/api/__tests__/contract/'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
};
