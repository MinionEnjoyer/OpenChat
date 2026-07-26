/**
 * Global Jest mock for expo-notifications.
 *
 * expo-notifications runs side effects (DevicePushTokenAutoRegistration) at
 * module import time that crash when the native bridge is missing.  This mock
 * replaces the module via moduleNameMapper so no test file ever loads the real
 * module — including tests that only transitively import push.ts via ShellScreen.
 *
 * Test files that need fine-grained control (e.g. push.test.ts) still apply
 * their own narrower jest.mock(), which overrides this one file-locally.
 */

export const requestPermissionsAsync = jest.fn(() =>
  Promise.resolve({ granted: false }),
);
export const getDevicePushTokenAsync = jest.fn(() =>
  Promise.resolve({ type: 'android' as const, data: 'mock-token' }),
);
export const addPushTokenListener = jest.fn(() => ({ remove: jest.fn() }));
export const setNotificationHandler = jest.fn();
export const addNotificationResponseReceivedListener = jest.fn(() => ({
  remove: jest.fn(),
}));
export const getLastNotificationResponse = jest.fn(() => null);
export const clearLastNotificationResponse = jest.fn();
export const AndroidImportance = { DEFAULT: 3 };
