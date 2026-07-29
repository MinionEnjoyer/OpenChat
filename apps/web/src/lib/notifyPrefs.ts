// Client-side mirror of the server's push notification-settings gate
// (apps/api/src/push/push-dispatch.service.ts → shouldPush). Lets the desktop shell
// suppress OS notifications for muted channels/servers and honor per-scope levels,
// matching what the mobile FCM path already does server-side.
import * as api from './api';
import type { NotificationLevel, NotificationSetting } from './types';

let cache: NotificationSetting[] = [];

/** Fetch the user's notification settings into the module cache (best-effort). */
export async function loadNotifyPrefs(): Promise<void> {
  try { cache = await api.getNotificationSettings(); } catch { /* keep previous cache */ }
}

/** Replace the cache after the user edits a setting (mute/level change). */
export function setNotifyPrefs(settings: NotificationSetting[]): void {
  cache = settings;
}

function levelAllows(s: NotificationSetting, required: 'ALL' | 'MENTIONS'): boolean {
  if (s.mutedUntil && new Date(s.mutedUntil).getTime() > Date.now()) return false;
  if (s.level === 'NONE') return false;
  if (s.level === 'MENTIONS') return required === 'MENTIONS';
  return true; // ALL
}

/**
 * Should we surface a notification for this event? Resolution order (most specific wins):
 * CHANNEL setting → SERVER setting → default ALL. `isMention` means the event is a mention
 * (so MENTIONS-level scopes still fire). Mirrors the server's shouldPush().
 */
export function notifyAllowed(opts: { channelId: string; serverId?: string | null; isMention: boolean }): boolean {
  const required: 'ALL' | 'MENTIONS' = opts.isMention ? 'MENTIONS' : 'ALL';
  const ch = cache.find((s) => s.scope === 'CHANNEL' && s.scopeId === opts.channelId);
  if (ch) return levelAllows(ch, required);
  if (opts.serverId) {
    const sv = cache.find((s) => s.scope === 'SERVER' && s.scopeId === opts.serverId);
    if (sv) return levelAllows(sv, required);
  }
  return true; // no setting → default ALL
}

export type { NotificationLevel };
