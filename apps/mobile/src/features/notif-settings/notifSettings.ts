/**
 * Pure logic for notification settings — no React, no hooks, no side-effects (FR-NOTIF-003).
 * @satisfies FR-NOTIF-003
 */

import type { NotificationSetting } from '../../api/schema';

/** Look up a notification override by scope + scopeId. */
export function getSetting(
  settings: NotificationSetting[],
  scope: NotificationSetting['scope'],
  scopeId: string,
): NotificationSetting | undefined {
  return settings.find((s) => s.scope === scope && s.scopeId === scopeId);
}

/** Return an ISO date-time string representing now + ms, or null if ms is null (= forever). */
export function computeMutedUntil(ms: number | null): string | null {
  if (ms === null) return null;
  return new Date(Date.now() + ms).toISOString();
}

/** Resolve the user-visible level from a setting (defaults to ALL when no override). */
export function effectiveLevel(
  setting: NotificationSetting | undefined,
): NotificationSetting['level'] {
  return setting?.level ?? 'ALL';
}

/** Human-readable label for a notification level. */
export function levelLabel(level: NotificationSetting['level']): string {
  switch (level) {
    case 'ALL': return 'All';
    case 'MENTIONS': return 'Mentions';
    case 'NONE': return 'None';
  }
}

/**
 * The mute duration options presented to the user.
 * Each maps a human-readable label to a millisecond duration (or null for forever).
 */
export const MUTE_OPTIONS = [
  { label: '15 min', ms: 15 * 60_000 },
  { label: '1 hour', ms: 60 * 60_000 },
  { label: '8 hours', ms: 8 * 60 * 60_000 },
  { label: '24 hours', ms: 24 * 60 * 60_000 },
  { label: 'Until I turn it back on', ms: null },
] as const;
