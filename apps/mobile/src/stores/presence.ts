/**
 * Presence store (FR-SOC-004). Fed by the global `presence` gateway op
 * and the `ready` frame's own-user status. Consumers read live presence
 * for any userId.
 *
 * @satisfies FR-SOC-004
 */
import { create } from 'zustand';
import { PRESENCE_PRIORITY } from '../domain/members';

interface PresenceState {
  /** Live presence map: userId → status string (ONLINE | AWAY | DND | INVISIBLE | OFFLINE). */
  presenceMap: Record<string, string>;

  /**
   * Record a presence update from the gateway.
   * The server already masks INVISIBLE→OFFLINE for peers, but we
   * also guard here as defense-in-depth.
   */
  setPresence: (userId: string, status: string) => void;

  /** Get the live status for a userId, falling back to OFFLINE if unknown. */
  getStatus: (userId: string) => string;

  /** True if the user is ONLINE, AWAY, or DND — not INVISIBLE/OFFLINE. */
  isOnline: (userId: string) => boolean;
}

export const usePresence = create<PresenceState>((set, get) => ({
  presenceMap: {},

  setPresence(userId: string, status: string) {
    // Normalize: INVISIBLE is effectively OFFLINE for peers.
    // (Server already masks this; defense-in-depth.)
    const normalized = status === 'INVISIBLE' ? 'OFFLINE' : status;
    set((s) => ({
      presenceMap: { ...s.presenceMap, [userId]: normalized },
    }));
  },

  getStatus(userId: string): string {
    return get().presenceMap[userId] ?? 'OFFLINE';
  },

  isOnline(userId: string): boolean {
    const s = get().presenceMap[userId] ?? 'OFFLINE';
    const pri = PRESENCE_PRIORITY[s] ?? 0;
    return pri >= 2; // AWAY(2), DND(3), ONLINE(4) are "online"; INVISIBLE(1)/OFFLINE(0) are not
  },
}));
