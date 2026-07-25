/**
 * Foreground notification handler (FR-NOTIF-004).
 *
 * When the app is in the foreground, push notifications should be suppressed
 * and shown as in-app toasts instead. This module takes notification payloads
 * (from FCM onMessage or WS notify/mention/call.ring events) and routes them
 * to the app's toast system.
 *
 * @satisfies FR-NOTIF-004
 */
import { AppState } from 'react-native';
import { showToast } from '../../ui/Toast';
import { strings } from '../../ui/strings';

// ── Notification payload shapes ──

/** Payload from a WebSocket `mention` frame. */
export interface MentionPayload {
  kind: 'mention';
  channelName: string;
  authorName: string;
  preview: string;
}

/** Payload from a WebSocket `call.ring` frame. */
export interface CallRingPayload {
  kind: 'call.ring';
  callerName: string;
}

/** Payload from a WebSocket `notify` frame (friend request, server invite, etc). */
export interface NotifyPayload {
  kind: 'notify';
}

export type ForegroundNotification = MentionPayload | CallRingPayload | NotifyPayload;

// ── Helper: is the app in the foreground? ──

let _currentState: 'active' | 'inactive' | 'background' | 'unknown' | 'extension' = AppState.currentState;

export function _setAppStateForTest(state: 'active' | 'inactive' | 'background'): void {
  _currentState = state;
}

export function _resetAppStateForTest(): void {
  _currentState = AppState.currentState;
}

function isForeground(): boolean {
  return _currentState === 'active';
}

// ── Handler ──

/**
 * Handle a notification while the app is in the foreground.
 *
 * If the app is active, suppresses the native push notification and shows an
 * in-app toast. If the app is in the background, returns false — let the OS
 * display the native notification.
 *
 * @returns true if the notification was handled in-app (native push should be suppressed)
 */
export function handleForegroundNotification(notification: ForegroundNotification): boolean {
  if (!isForeground()) return false;

  let message: string;

  switch (notification.kind) {
    case 'mention':
      message = notification.authorName
        ? strings.notifications.mentionToast
            .replace('{author}', notification.authorName)
            .replace('{channel}', notification.channelName)
            .replace('{preview}', notification.preview)
        : strings.notifications.genericNotification;
      break;
    case 'call.ring':
      message = notification.callerName
        ? strings.notifications.callRingToast.replace('{caller}', notification.callerName)
        : strings.notifications.genericNotification;
      break;
    case 'notify':
      message = strings.notifications.genericNotification;
      break;
  }

  showToast(message);
  return true;
}
