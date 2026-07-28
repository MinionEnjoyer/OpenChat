/**
 * FR-APP-002 — Cold start restores last viewed channel.
 *
 * Persists { serverId, channelId } whenever the user selects a channel.
 * On next boot, after session restore and data load, resolves the stored
 * preference against the actual server/channel lists and falls back
 * gracefully if the channel was deleted or access lost.
 */

import type { Storage } from '../../lib/storage';
import type { Server, Channel } from '../../api/schema';

export interface LastChannel {
  serverId: string;
  channelId: string;
}

const KEY = 'ui.lastChannel';

export function saveLastChannel(storage: Storage, serverId: string | null, channelId: string | null): void {
  if (serverId && channelId) {
    storage.setJson(KEY, { serverId, channelId });
  }
}

/**
 * Resolve the stored last channel against live data.
 * Returns the matching channel id if it still exists, or `undefined` to
 * trigger the default (first server, no channel).
 */
export function resolveLastChannel(
  storage: Storage,
  servers: Server[],
  channelsByServer: (serverId: string) => Channel[],
): string | undefined {
  const pref = storage.getJson<LastChannel>(KEY);
  if (!pref) return undefined;

  // Server must still exist in the member list.
  if (!servers.some((s) => s.id === pref.serverId)) return undefined;

  // Channel must still exist and be a text channel.
  const channels = channelsByServer(pref.serverId);
  const ch = channels.find((c) => c.id === pref.channelId && c.type === 'TEXT');
  if (!ch) return undefined;

  return ch.id;
}

/**
 * Resolve which text channel to auto-select for a server.
 *
 * Priority:
 * 1. Stored preference (ui.lastChannel) — if it matches this server and the
 *    channel still exists as TEXT or ANNOUNCEMENT.
 * 2. First text channel (TEXT or ANNOUNCEMENT) in server-defined order.
 *
 * Returns `undefined` only when there are genuinely no text/announcement
 * channels — the caller should show an empty-state placeholder.
 *
 * @satisfies FR-APP-002, FR-SRV-010, DD-024
 */
export function resolveTextChannel(
  storage: Storage,
  serverId: string,
  channels: Channel[],
): string | undefined {
  const textChannels = channels.filter(
    (c) => c.type === 'TEXT' || c.type === 'ANNOUNCEMENT',
  );
  if (textChannels.length === 0) return undefined;

  // Try stored preference first
  const pref = storage.getJson<LastChannel>(KEY);
  if (pref && pref.serverId === serverId) {
    const match = textChannels.find((c) => c.id === pref.channelId);
    if (match) return match.id;
  }

  // Fallback to first text channel (length > 0 guaranteed by guard above)
  return textChannels[0]!.id;
}
