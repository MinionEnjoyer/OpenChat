/**
 * VoiceStore — connection state for the voice layer (FR-VOX-001).
 *
 * PUBLIC SURFACE (for FR-VOX-002/003/005/006/007 agents):
 *   useVoiceStore()                — Zustand hook (import from features/voice)
 *   state.connectionState          — 'idle' | 'joining' | 'connected' | 'leaving'
 *   state.activeChannelId          — string | null
 *   state.error                    — string | null
 *   state.participantCount         — number (cached from last participants fetch)
 *   state.room                     — livekit-client Room | null
 *   state.join(channelId)          — calls API join, sets joining state
 *   state.leave()                  — calls API leave, sets idle state
 *   state.setRoom(room|null)       — called by useVoiceConnection when Room is created/destroyed
 *   state.setConnectionState(cs)   — called by useVoiceConnection for LiveKit-level state changes
 *   voiceService                   — singleton VoiceService (test-injectable)
 *
 * The Room lifecycle is managed externally by useVoiceConnection (the hook).
 * This store tracks the high-level connection state and holds the Room
 * reference so other components can access it without prop drilling.
 *
 * @satisfies FR-VOX-001
 */
import { create } from 'zustand';
import { api } from '../../stores/session';
import { VoiceService } from './VoiceService';
import type { VoiceJoinResponse } from '../../api/schema';

/** Mirror of livekit-client ConnectionState, decoupled for testability. */
export type VoiceConnectionState = 'idle' | 'joining' | 'connected' | 'leaving';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RoomRef = any; // livekit-client Room — opaque to the store, managed by useVoiceConnection

export interface VoiceState {
  connectionState: VoiceConnectionState;
  /** The channel we're currently connected to, or null. */
  activeChannelId: string | null;
  /** Last error message, cleared on successful state transitions. */
  error: string | null;
  /** Cached participant count from last known roster. */
  participantCount: number;
  /** The livekit-client Room. Managed by useVoiceConnection, read by UI. */
  room: RoomRef | null;

  /** Begin joining a voice channel: calls POST /voice/:id/join, sets joining → connected. Returns join response, or undefined if already connected. */
  join: (channelId: string) => Promise<VoiceJoinResponse | undefined>;
  /** Leave the current voice channel: calls POST /voice/:id/leave, sets idle. */
  leave: () => Promise<void>;
  /** Store the livekit-client Room reference (called by useVoiceConnection). */
  setRoom: (room: RoomRef | null) => void;
  /** Update just the connection state (called by useVoiceConnection event handlers). */
  setConnectionState: (cs: VoiceConnectionState) => void;
  /** Update participant count (called by useVoiceConnection after roster change). */
  setParticipantCount: (n: number) => void;
  /** Clear any error. */
  clearError: () => void;
}

let singleton: VoiceService | null = null;

/** Test injection point — call before tests, or leave undefined for production. */
export function getVoiceService(): VoiceService {
  if (!singleton) singleton = new VoiceService(api);
  return singleton;
}

/** Replace the singleton (tests only). */
export function injectVoiceService(svc: VoiceService): void {
  singleton = svc;
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  connectionState: 'idle',
  activeChannelId: null,
  error: null,
  participantCount: 0,
  room: null,

  async join(channelId: string) {
    const state = get();
    // If already connected to a different channel, leave first.
    if (state.activeChannelId && state.activeChannelId !== channelId) {
      await state.leave();
    }
    if (state.activeChannelId === channelId && state.connectionState === 'connected') {
      return; // already connected to this channel
    }

    set({ connectionState: 'joining', activeChannelId: channelId, error: null });
    try {
      const svc = getVoiceService();
      const result = await svc.joinChannel(channelId);
      set({ connectionState: 'connected' });
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'join failed';
      set({ connectionState: 'idle', activeChannelId: null, error: msg });
      throw e;
    }
  },

  async leave() {
    const { activeChannelId, room } = get();
    if (!activeChannelId) return;

    set({ connectionState: 'leaving' });
    try {
      // Disconnect the LiveKit room first (if one exists).
      if (room && typeof room.disconnect === 'function') {
        room.disconnect();
      }
      const svc = getVoiceService();
      await svc.leaveChannel(activeChannelId);
    } catch {
      // Best-effort: even if the API call fails, we're leaving locally.
    } finally {
      set({
        connectionState: 'idle',
        activeChannelId: null,
        room: null,
        participantCount: 0,
        error: null,
      });
    }
  },

  setRoom(room: RoomRef | null) {
    set({ room });
  },

  setConnectionState(cs: VoiceConnectionState) {
    set({ connectionState: cs });
  },

  setParticipantCount(n: number) {
    set({ participantCount: n });
  },

  clearError() {
    set({ error: null });
  },
}));
