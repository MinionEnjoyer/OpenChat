/**
 * Push notification client (FR-NOTIF-002).
 *
 * Token lifecycle: request permissions → get push token → POST /api/devices.
 * Token rotation listener re-registers automatically.
 * Sign-out: DELETE /api/devices/:token (correctness — not best-effort cleanup).
 * Deep-link tap-through: parse notification data → navigate to channel/DM/server.
 *
 * Android only per docs/PRIORITIES.md §5. iOS is a no-op pending owner decision.
 *
 * @satisfies FR-NOTIF-002
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type {
  DevicePushToken,
  NotificationResponse,
  NotificationBehavior,
  NotificationPermissionsStatus,
  EventSubscription,
} from 'expo-notifications';
import { api, setLogoutHook } from '../../stores/session';
import { handleForegroundNotification, type ForegroundNotification } from './foregroundHandler';

// ── Module state (mutable for test injection) ──

let _platformOS: string = Platform.OS;

export function _setPlatformForTest(os: 'android' | 'ios'): void {
  _platformOS = os;
}

export function _resetPlatformForTest(): void {
  _platformOS = Platform.OS;
}

function isAndroid(): boolean {
  return _platformOS === 'android';
}

let _addedTokenListener: (listener: (token: DevicePushToken) => void) => EventSubscription =
  (listener) => Notifications.addPushTokenListener(listener);

let _storedToken: string | null = null;

// ── Test seams ──

export function _setNotificationsForTest(
  mock: {
    requestPermissionsAsync?: () => Promise<NotificationPermissionsStatus>;
    getDevicePushTokenAsync?: () => Promise<DevicePushToken>;
    addPushTokenListener?: (listener: (token: DevicePushToken) => void) => EventSubscription;
    setNotificationHandler?: (handler: Parameters<typeof Notifications.setNotificationHandler>[0]) => void;
    addNotificationResponseReceivedListener?: (
      listener: (response: NotificationResponse) => void,
    ) => EventSubscription;
    getLastNotificationResponse?: () => NotificationResponse | null;
    clearLastNotificationResponse?: () => void;
  },
): void {
  if (mock.requestPermissionsAsync) {
    _requestPermissions = mock.requestPermissionsAsync;
  }
  if (mock.getDevicePushTokenAsync) {
    _getDevicePushToken = mock.getDevicePushTokenAsync;
  }
  if (mock.addPushTokenListener) {
    _addedTokenListener = mock.addPushTokenListener;
  }
  if (mock.setNotificationHandler) {
    _setNotificationHandler = mock.setNotificationHandler;
  }
  if (mock.addNotificationResponseReceivedListener) {
    _addResponseListener = mock.addNotificationResponseReceivedListener;
  }
  if (mock.getLastNotificationResponse) {
    _getLastResponse = mock.getLastNotificationResponse;
  }
  if (mock.clearLastNotificationResponse) {
    _clearLastResponse = mock.clearLastNotificationResponse;
  }
}

export function _resetMocksForTest(): void {
  _requestPermissions = Notifications.requestPermissionsAsync.bind(Notifications);
  _getDevicePushToken = Notifications.getDevicePushTokenAsync.bind(Notifications);
  _addedTokenListener = Notifications.addPushTokenListener.bind(Notifications);
  _setNotificationHandler = Notifications.setNotificationHandler.bind(Notifications);
  _addResponseListener = Notifications.addNotificationResponseReceivedListener.bind(Notifications);
  _getLastResponse = Notifications.getLastNotificationResponse.bind(Notifications);
  _clearLastResponse = Notifications.clearLastNotificationResponse.bind(Notifications);
  _storedToken = null;
  _initialized = false;
  _platformOS = 'android';
  _onNavigate = null;
}

export function _setStoredTokenForTest(token: string | null): void {
  _storedToken = token;
}

// Writable function references (default to real Notifications)

let _requestPermissions: () => Promise<NotificationPermissionsStatus> =
  Notifications.requestPermissionsAsync.bind(Notifications);

let _getDevicePushToken: () => Promise<DevicePushToken> =
  Notifications.getDevicePushTokenAsync.bind(Notifications);

let _setNotificationHandler: typeof Notifications.setNotificationHandler =
  Notifications.setNotificationHandler.bind(Notifications);

let _addResponseListener: typeof Notifications.addNotificationResponseReceivedListener =
  Notifications.addNotificationResponseReceivedListener.bind(Notifications);

let _getLastResponse: typeof Notifications.getLastNotificationResponse =
  Notifications.getLastNotificationResponse.bind(Notifications);

let _clearLastResponse: typeof Notifications.clearLastNotificationResponse =
  Notifications.clearLastNotificationResponse.bind(Notifications);

// ── Permission ──

/**
 * Request notification permissions from the OS.
 * Android only — iOS is a no-op until the owner decides (docs/PRIORITIES.md §5).
 *
 * @returns true if permissions were granted
 */
export async function requestPushPermissions(): Promise<boolean> {
  if (!isAndroid()) return false;
  try {
    const { granted } = await _requestPermissions();
    return granted;
  } catch {
    return false;
  }
}

// ── Token lifecycle ──

/** Obtain the native device push token (FCM on Android). */
async function getDeviceToken(): Promise<string | null> {
  if (!isAndroid()) return null;
  try {
    const token = await _getDevicePushToken();
    return token.data;
  } catch {
    return null;
  }
}

/** POST the token to /api/devices. Returns the token on success, null on failure. */
async function registerTokenOnServer(token: string): Promise<string | null> {
  try {
    await api.request('/devices', {
      method: 'POST',
      body: { token, platform: _platformOS },
    });
    _storedToken = token;
    return token;
  } catch {
    return null;
  }
}

/** DELETE the stored token from /api/devices. Idempotent — safe to call when no token stored. */
async function deleteTokenOnServer(): Promise<void> {
  if (!_storedToken) return;
  const t = _storedToken;
  _storedToken = null;
  try {
    await api.request(`/devices/${encodeURIComponent(t)}`, { method: 'DELETE' });
  } catch {
    // Best-effort — server-side expiry handles the rest.
  }
}

/**
 * Full registration flow: get token → POST to /api/devices.
 * Call this after the user signs in and permission is granted.
 *
 * @returns the registered token, or null if any step failed
 */
export async function registerPushToken(): Promise<string | null> {
  if (!isAndroid()) return null;
  const token = await getDeviceToken();
  if (!token) return null;
  return registerTokenOnServer(token);
}

/**
 * Token rotation handler — called automatically when FCM rotates the device token.
 * Unregisters the old token and registers the new one.
 */
async function handleTokenRotation(newToken: DevicePushToken): Promise<void> {
  if (!isAndroid()) return;
  await deleteTokenOnServer();
  if (newToken.data) {
    await registerTokenOnServer(newToken.data);
  }
}

/**
 * Sign-out hook: DELETE the device token from the server.
 * This is a correctness requirement (FR-NOTIF-002): a signed-out device
 * must stop receiving push notifications.
 */
export async function unregisterPushToken(): Promise<void> {
  await deleteTokenOnServer();
}

/**
 * Subscribe to FCM token rotation. Returns a cleanup function.
 * Must be called once when the user signs in; cleanup on sign-out.
 */
export function subscribeToTokenRotation(): () => void {
  if (!isAndroid()) return () => {};
  const subscription = _addedTokenListener(handleTokenRotation);
  return () => subscription.remove();
}

// ── Foreground suppression (FR-NOTIF-004) ──

/**
 * Install the expo-notifications foreground handler so that FCM pushes
 * arriving while the app is in the foreground are suppressed and shown
 * as in-app toasts instead.
 *
 * @satisfies FR-NOTIF-004
 */
export function setupForegroundSuppression(): void {
  _setNotificationHandler({
    handleNotification: async (notification) => {
      const data = (notification.request.content.data ?? {}) as Record<string, unknown>;

      // Map FCM data payload → ForegroundNotification
      const fg: ForegroundNotification = {
        kind: (data.kind as ForegroundNotification['kind']) ?? 'notify',
        channelName: typeof data.channelName === 'string' ? data.channelName : undefined,
        authorName: typeof data.authorName === 'string' ? data.authorName : undefined,
        preview: typeof data.preview === 'string' ? data.preview : undefined,
        callerName: typeof data.callerName === 'string' ? data.callerName : undefined,
      } as ForegroundNotification;

      const suppressed = handleForegroundNotification(fg);

      const behavior: NotificationBehavior = {
        shouldShowBanner: !suppressed,
        shouldShowList: !suppressed,
        shouldPlaySound: !suppressed,
        shouldSetBadge: !suppressed,
      };
      return behavior;
    },
  });
}

// ── Deep-link routing ──

/** Route extracted from a notification's data payload. */
export interface NotificationRoute {
  type: 'channel' | 'dm' | 'server' | null;
  serverId?: string;
  channelId?: string;
  dmChannelId?: string;
}

export type NavigationHandler = (route: NotificationRoute) => void;

let _onNavigate: NavigationHandler | null = null;

/**
 * Parse a notification's data payload into a navigation route.
 *
 * The backend dispatch worker (P8-01) includes routing fields in the FCM data
 * payload: `serverId`, `channelId`, `dmChannelId`.
 */
export function parseNotificationRoute(
  data: Record<string, unknown> | undefined,
): NotificationRoute {
  if (!data) return { type: null };

  const serverId = typeof data.serverId === 'string' ? data.serverId : undefined;
  const channelId = typeof data.channelId === 'string' ? data.channelId : undefined;
  const dmChannelId = typeof data.dmChannelId === 'string' ? data.dmChannelId : undefined;

  if (dmChannelId) {
    return { type: 'dm', dmChannelId };
  }
  if (channelId && serverId) {
    return { type: 'channel', serverId, channelId };
  }
  if (serverId) {
    return { type: 'server', serverId };
  }
  return { type: null };
}

/**
 * Install the notification tap-through handler.
 *
 * Handles both:
 * - Warm-start tap (app is running; listener fires immediately)
 * - Cold-start tap (app was killed; last response is retrieved on launch)
 *
 * @param onNavigate — called with the resolved route when user taps a notification
 * @returns cleanup function (call on sign-out / unmount)
 *
 * @satisfies FR-NOTIF-002
 */
export function setupNotificationTapHandler(onNavigate: NavigationHandler): () => void {
  _onNavigate = onNavigate;

  // Warm-start: listen for taps while the app is running
  const sub = _addResponseListener((response: NotificationResponse) => {
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    const route = parseNotificationRoute(data);
    if (route.type) {
      _onNavigate?.(route);
    }
  });

  // Cold-start: handle the notification that launched the app
  const last = _getLastResponse();
  if (last) {
    const data = last.notification.request.content.data as Record<string, unknown> | undefined;
    const route = parseNotificationRoute(data);
    if (route.type) {
      _onNavigate(route);
    }
    _clearLastResponse();
  }

  return () => {
    sub.remove();
    _onNavigate = null;
  };
}

// ── One-shot initialization (called from App.tsx when user signs in) ──

let _initialized = false;

export function _resetInitializedForTest(): void {
  _initialized = false;
}

/**
 * Initialize push notifications once per session:
 *  1. Request OS permission
 *  2. Register the push token with the server
 *  3. Subscribe to token rotation
 *  4. Install foreground suppression
 *  5. Register the sign-out hook (so logout → DELETE /api/devices)
 */
export async function initializePush(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  if (!isAndroid()) return;

  const granted = await requestPushPermissions();
  if (!granted) return;

  await registerPushToken();
  subscribeToTokenRotation();
  setupForegroundSuppression();

  // Wire sign-out: DELETE token on logout (correctness requirement)
  setLogoutHook(unregisterPushToken);
}
