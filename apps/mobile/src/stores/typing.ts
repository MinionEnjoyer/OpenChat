/**
 * Typing-indicator store (FR-MSG-009). Per-channel typist map with TTL-based
 * expiry and an outbound throttle so the client emits typing.start at most
 * once per 3 s per channel while the user is actively typing.
 *
 * All time reads and timers go through lib/clock — the E2E harness freezes
 * the clock and a direct Date.now() would break determinism.
 */
import { create } from 'zustand';
import { clock, type TimeoutHandle } from '../lib/clock';

const TTL_MS = 5_000;       // entries expire 5s after last typing event
const THROTTLE_MS = 3_000;  // outbound send at most every 3s per channel

interface TypingState {
  /** Per-channel map of userId → lastTypingAt (epoch ms from clock.now()). */
  typists: Record<string, Record<string, number>>;

  /** Per-channel timestamp of the last outbound typing.start send. */
  lastSent: Record<string, number>;

  /** Timers that will clean up stale entries. Key: `${channelId}|${userId}` */
  activeTimers: Record<string, TimeoutHandle>;

  /**
   * Record an inbound typing event from the server (s2c typing op).
   * Schedules a TTL cleanup for the entry. Idempotent per (channelId, userId).
   */
  recordTyping: (channelId: string, userId: string) => void;

  /**
   * Return active typist userIds for a channel, excluding the given user
   * (so you never see your own typing indicator).
   */
  getActiveTypistIds: (channelId: string, excludeUserId: string) => string[];

  /**
   * Whether enough time has passed to send another typing.start for this
   * channel. Does NOT mutate state — just a read-only predicate.
   */
  shouldSendTyping: (channelId: string) => boolean;

  /** Record that we just sent a typing.start for this channel. */
  markSent: (channelId: string) => void;
}

export const useTyping = create<TypingState>((set, get) => ({
  typists: {},
  lastSent: {},
  activeTimers: {},

  recordTyping(channelId: string, userId: string) {
    const now = clock.now();
    const timerKey = `${channelId}|${userId}`;

    set((s) => {
      const channel = { ...(s.typists[channelId] ?? {}) };
      channel[userId] = now;

      // Cancel any existing timer for this entry
      const existingTimer = s.activeTimers[timerKey];
      if (existingTimer !== undefined) {
        clock.clearTimeout(existingTimer);
      }

      // Schedule a new TTL cleanup
      const newTimer = clock.setTimeout(() => {
        set((s2) => {
          const ch = { ...(s2.typists[channelId] ?? {}) };
          delete ch[userId];
          const updatedTypists = { ...s2.typists };
          if (Object.keys(ch).length === 0) {
            delete updatedTypists[channelId];
          } else {
            updatedTypists[channelId] = ch;
          }
          const updatedTimers = { ...s2.activeTimers };
          delete updatedTimers[timerKey];
          return { typists: updatedTypists, activeTimers: updatedTimers };
        });
      }, TTL_MS);

      return {
        typists: { ...s.typists, [channelId]: channel },
        activeTimers: { ...s.activeTimers, [timerKey]: newTimer },
      };
    });
  },

  getActiveTypistIds(channelId: string, excludeUserId: string): string[] {
    const now = clock.now();
    const channel = get().typists[channelId];
    if (!channel) return [];
    return Object.entries(channel)
      .filter(([userId, lastAt]) => userId !== excludeUserId && now - lastAt < TTL_MS)
      .map(([userId]) => userId);
  },

  shouldSendTyping(channelId: string): boolean {
    const last = get().lastSent[channelId];
    if (last === undefined) return true;
    return clock.now() - last >= THROTTLE_MS;
  },

  markSent(channelId: string) {
    set((s) => ({
      lastSent: { ...s.lastSent, [channelId]: clock.now() },
    }));
  },
}));
