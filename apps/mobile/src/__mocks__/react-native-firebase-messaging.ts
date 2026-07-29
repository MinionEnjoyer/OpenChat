/**
 * Global Jest mock for @react-native-firebase/messaging.
 *
 * Used by push.ts on iOS to obtain FCM registration tokens. Tests inject
 * their own behavior via _setIosMessagingForTest; this mock provides a
 * safe fallback default that returns null (no Firebase configured).
 */
const mockMessagingInstance = {
  getToken: jest.fn(() => Promise.resolve(null as unknown as string)),
  onTokenRefresh: jest.fn(() => () => {}),
};

const mockMessaging = jest.fn(() => mockMessagingInstance);

export default mockMessaging;
