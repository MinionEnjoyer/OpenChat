/**
 * Blocked-user store (FR-SOC-007).
 *
 * Fetches the list of blocked user IDs from GET /api/friends/blocked
 * and exposes a Set for O(1) lookup in message renderers.
 */
import { create } from 'zustand';
import { api } from '../../stores/session';
import type { User } from '../../api/schema';

interface BlockedStore {
  /** Set of blocked user IDs for O(1) lookup. */
  blockedIds: Set<string>;
  /** True once the first fetch has completed (successful or not). */
  fetched: boolean;
  /** Fetch the blocked list from the server. */
  fetch(): Promise<void>;
}

export const useBlockedStore = create<BlockedStore>((set) => ({
  blockedIds: new Set(),
  fetched: false,

  async fetch() {
    try {
      const data = await api.request<User[]>('/friends/blocked');
      set({ blockedIds: new Set(data.map((u) => u.id)), fetched: true });
    } catch {
      // If the endpoint is unavailable, leave the set empty rather than
      // blocking all messages — a 401 (logged out) or a 500 won't produce
      // false positives.
      set({ fetched: true });
    }
  },
}));

/**
 * Hook: is the given authorId blocked by the current user?
 * Returns false until the first fetch completes (no flash of blocked banners).
 */
export function useIsBlocked(authorId: string): boolean {
  return useBlockedStore((s) => s.fetched && s.blockedIds.has(authorId));
}
