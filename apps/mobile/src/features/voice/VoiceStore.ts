/**
 * VoiceStore — connection state for the voice layer (FR-VOX-001),
 * participant tile data (FR-VOX-002), controls for
 * mute/deafen/speaker (FR-VOX-003), and video camera (FR-VOX-006).
 *
 * PUBLIC SURFACE (for FR-VOX-002/003/005/006/007 agents):
 *   useVoiceStore()                — Zustand hook (import from features/voice)
 *   state.connectionState          — 'idle' | 'joining' | 'connected' | 'leaving'
 *   state.activeChannelId          — string | null
 *   state.error                    — string | null
 *   state.participantCount         — number (cached from last participants fetch)
 *   state.participants             — VoiceParticipantInfo[] (per-participant UI state)
 *   state.room                     — livekit-client Room | null
 *   state.isMuted                  — boolean (track-level mic mute)
 *   state.isDeafened               — boolean (local deafen)
 *   state.isSpeakerOn              — boolean (speaker vs earpiece)
 *   state.cameraEnabled            — boolean (is local camera publishing)
 *   state.cameraFacing             — 'front' | 'back'
 *   state.join(channelId)          — calls API join, sets joining state
 *   state.leave()                  — calls API leave, sets idle state
 *   state.setRoom(room|null)       — called by useVoiceConnection when Room is created/destroyed
 *   state.setConnectionState(cs)   — called by useVoiceConnection for LiveKit-level state changes
 *   state.upsertParticipant(p)     — add/update a participant in the roster (FR-VOX-002)
 *   state.removeParticipant(id)    — remove a participant by id (FR-VOX-002)
 *   state.setSpeaking(id, spk)     — set speaking state for a participant (FR-VOX-002)
 *   state.setAudioLevel(id, lvl)   — set audio level for a participant (FR-VOX-002)
 *   state.setMuted(id, muted)      — set mute state for a participant (FR-VOX-002)
 *   state.toggleMute()             — toggle mic mute (track-level)
 *   state.toggleDeafen()           — toggle deafen (local-only)
 *   state.toggleSpeaker()          — toggle speaker/earpiece
 *   voiceService                   — singleton VoiceService (test-injectable)
 *
 * The Room lifecycle is managed externally by useVoiceConnection (the hook).
 * This store tracks the high-level connection state and holds the Room
 * reference so other components can access it without prop drilling.
 *
 * @satisfies FR-VOX-001, FR-VOX-002, FR-VOX-003, FR-VOX-006
 */
import { create } from 'zustand';
import { api } from '../../stores/session';
import { VoiceService } from './VoiceService';
import type { VoiceJoinResponse } from '../../api/schema';

/** Mirror of livekit-client ConnectionState, decoupled for testability. */
export type VoiceConnectionState = 'idle' | 'joining' | 'connected' | 'leaving';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RoomRef = any; // livekit-client Room — opaque to the store, managed by useVoiceConnection

/**
 * Per-participant UI state for FR-VOX-002 (tiles).
 * Populated by useVoiceParticipants from LiveKit events.
 * @satisfies FR-VOX-002
 */
export interface VoiceParticipantInfo {
  /** LiveKit participant identity (matches our userId). */
  id: string;
  /** Cached display metadata from GET participants or participant metadata. */
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** Whether this participant is currently speaking (from ActiveSpeakersChanged). */
  isSpeaking: boolean;
  /** Audio level 0.0–1.0, for speaking ring intensity. */
  audioLevel: number;
  /** Whether the remote mic track is muted (or local mic is off). */
  isMuted: boolean;
  /** Whether this participant is the local user. */
  isLocal: boolean;
}

export interface VoiceState {
  connectionState: VoiceConnectionState;
  /** The channel we're currently connected to, or null. */
  activeChannelId: string | null;
  /** Last error message, cleared on successful state transitions. */
  error: string | null;
  /** Cached participant count from last known roster. */
  participantCount: number;
  /** Per-participant UI state for tiles (FR-VOX-002). */
  participants: VoiceParticipantInfo[];
  /** The livekit-client Room. Managed by useVoiceConnection, read by UI. */
  room: RoomRef | null;
  /** Track-level mic mute. @satisfies FR-VOX-003 */
  isMuted: boolean;
  /** Local deafen (disable remote audio + implies mute). @satisfies FR-VOX-003 */
  isDeafened: boolean;
  /** Speaker (true) vs earpiece (false). @satisfies FR-VOX-003 */
  isSpeakerOn: boolean;
  /** Whether the local camera is publishing. @satisfies FR-VOX-006 */
  cameraEnabled: boolean;
  /** Active camera facing: 'front' or 'back'. @satisfies FR-VOX-006 */
  cameraFacing: 'front' | 'back';

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

  // ── FR-VOX-002 participant roster actions ──
  /** Add or update a participant in the roster. */
  upsertParticipant: (p: VoiceParticipantInfo) => void;
  /** Remove a participant from the roster by id. */
  removeParticipant: (id: string) => void;
  /** Set speaking state for a participant. */
  setSpeaking: (id: string, speaking: boolean) => void;
  /** Set audio level (0–1) for a participant. */
  setAudioLevel: (id: string, level: number) => void;
  /** Set mute state for a participant. */
  setMuted: (id: string, muted: boolean) => void;
  /** Replace entire participant roster (e.g. on reconnect). */
  setParticipants: (list: VoiceParticipantInfo[]) => void;

  // ── FR-VOX-003 controls ──
  /** Toggle mic mute (track-level). Calls room.localParticipant.setMicrophoneEnabled. @satisfies FR-VOX-003 */
  toggleMute: () => void;
  /** Toggle deafen (local-only: disables remote audio + implies mute). @satisfies FR-VOX-003 */
  toggleDeafen: () => void;
  /** Toggle speaker/earpiece output. @satisfies FR-VOX-003 */
  toggleSpeaker: () => void;
  /** Reset controls to defaults (called on leave). */
  resetControls: () => void;
  /** Read the actual mic track state and sync isMuted to match it. @satisfies FR-VOX-003 */
  syncMicFromTrack: () => void;
  /** Explicitly mute the local mic track on join, then sync the store. @satisfies FR-VOX-003 */
  muteOnJoin: () => Promise<void>;

  // ── FR-VOX-006 video controls ──
  /** Toggle the local camera on or off. @satisfies FR-VOX-006 */
  toggleCamera: () => Promise<void>;
  /** Flip between front and back camera while active. @satisfies FR-VOX-006 */
  flipCamera: () => Promise<void>;
  /** Set camera facing mode (used internally by flipCamera). */
  setCameraFacing: (facing: 'front' | 'back') => void;
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

/**
 * Map our cameraFacing to livekit-client VideoCaptureOptions.facingMode.
 * 'front' → 'user', 'back' → 'environment'.
 */
function toFacingMode(facing: 'front' | 'back'): 'user' | 'environment' {
  return facing === 'front' ? 'user' : 'environment';
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  connectionState: 'idle',
  activeChannelId: null,
  error: null,
  participantCount: 0,
  participants: [],
  room: null,
  cameraEnabled: false,
  cameraFacing: 'front',
  isMuted: false,
  isDeafened: false,
  isSpeakerOn: true,

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
        participants: [],
        error: null,
        cameraEnabled: false,
        cameraFacing: 'front',
        isMuted: false,
        isDeafened: false,
        isSpeakerOn: true,
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

  // ── FR-VOX-002 participant roster actions ──

  upsertParticipant(p: VoiceParticipantInfo) {
    set((state) => {
      const idx = state.participants.findIndex((x) => x.id === p.id);
      if (idx >= 0) {
        const next = [...state.participants];
        next[idx] = { ...next[idx], ...p };
        return { participants: next };
      }
      // D1: enforce single-local invariant.
      // When a new isLocal:true entry arrives with a different id than
      // any existing local entry, the stale entry must be removed so
      // there is never more than one "(you)" tile.
      if (p.isLocal) {
        const localIdx = state.participants.findIndex((x) => x.isLocal);
        if (localIdx >= 0 && state.participants[localIdx]!.id !== p.id) {
          const next = [...state.participants];
          next[localIdx] = p;
          return { participants: next };
        }
      }
      return { participants: [...state.participants, p] };
    });
  },

  removeParticipant(id: string) {
    set((state) => ({
      participants: state.participants.filter((p) => p.id !== id),
    }));
  },

  setSpeaking(id: string, speaking: boolean) {
    set((state) => {
      const idx = state.participants.findIndex((p) => p.id === id);
      if (idx < 0) return state;
      const next = [...state.participants];
      const current = next[idx]!;
      next[idx] = { ...current, isSpeaking: speaking };
      return { participants: next };
    });
  },

  setAudioLevel(id: string, level: number) {
    set((state) => {
      const idx = state.participants.findIndex((p) => p.id === id);
      if (idx < 0) return state;
      const next = [...state.participants];
      const current = next[idx]!;
      next[idx] = { ...current, audioLevel: Math.max(0, Math.min(1, level)) };
      return { participants: next };
    });
  },

  setMuted(id: string, muted: boolean) {
    set((state) => {
      const idx = state.participants.findIndex((p) => p.id === id);
      if (idx < 0) return state;
      const next = [...state.participants];
      const current = next[idx]!;
      next[idx] = { ...current, isMuted: muted };
      return { participants: next };
    });
  },

  setParticipants(list: VoiceParticipantInfo[]) {
    set({ participants: list });
  },

  // ── FR-VOX-003 controls ──

  toggleMute() {
    const { room, isMuted, isDeafened } = get();
    // If deafened, mute is enforced — only allow unmute if also undeafening.
    if (isDeafened) return;

    const newMuted = !isMuted;
    if (room?.localParticipant && typeof room.localParticipant.setMicrophoneEnabled === 'function') {
      room.localParticipant.setMicrophoneEnabled(!newMuted);
    }
    set({ isMuted: newMuted });
  },

  toggleDeafen() {
    const { room, isDeafened } = get();
    const newDeafened = !isDeafened;

    if (newDeafened) {
      // Deafening: mute mic + disable all remote audio.
      if (room?.localParticipant && typeof room.localParticipant.setMicrophoneEnabled === 'function') {
        room.localParticipant.setMicrophoneEnabled(false);
      }
      // Disable remote participant audio tracks.
      if (room?.remoteParticipants) {
        for (const [, p] of room.remoteParticipants) {
          if (p.audioTrackPublications) {
            for (const [, pub] of p.audioTrackPublications) {
              if (pub.track && typeof pub.track.stop === 'function') {
                pub.track.stop();
              }
            }
          }
        }
      }
      set({ isDeafened: true, isMuted: true });
    } else {
      // Undeafening: re-enable mic. The user explicitly chose to undeafen,
      // which means they want to participate (hear and be heard).
      if (room?.localParticipant && typeof room.localParticipant.setMicrophoneEnabled === 'function') {
        room.localParticipant.setMicrophoneEnabled(true);
      }
      set({ isDeafened: false, isMuted: false });
    }
  },

  toggleSpeaker() {
    const { room, isSpeakerOn } = get();
    const newSpeaker = !isSpeakerOn;
    if (room && typeof room.switchActiveDevice === 'function') {
      room.switchActiveDevice(newSpeaker ? 'speaker' : 'earpiece');
    }
    set({ isSpeakerOn: newSpeaker });
  },

  resetControls() {
    set({ isMuted: false, isDeafened: false, isSpeakerOn: true });
  },

  syncMicFromTrack() {
    const { room } = get();
    if (room?.localParticipant && typeof room.localParticipant.isMicrophoneEnabled === 'boolean') {
      const enabled = room.localParticipant.isMicrophoneEnabled;
      set({ isMuted: !enabled });
    }
  },

  async muteOnJoin() {
    const { room } = get();
    // Join muted — the safer default for mobile (avoid accidental broadcast).
    // Explicitly disable the mic, then read back the actual track state so the
    // store cannot disagree with reality.
    if (room?.localParticipant && typeof room.localParticipant.setMicrophoneEnabled === 'function') {
      await room.localParticipant.setMicrophoneEnabled(false);
    }
    // After the await, read the actual track state to stay in sync.
    const state = get();
    if (state.room?.localParticipant && typeof state.room.localParticipant.isMicrophoneEnabled === 'boolean') {
      const enabled = state.room.localParticipant.isMicrophoneEnabled;
      set({ isMuted: !enabled });
    }
  },

  // ── FR-VOX-006 video controls ──

  async toggleCamera() {
    const { room, cameraEnabled, cameraFacing } = get();
    if (!room) return;

    const newEnabled = !cameraEnabled;
    if (room.localParticipant && typeof room.localParticipant.setCameraEnabled === 'function') {
      if (newEnabled) {
        await room.localParticipant.setCameraEnabled(true, {
          facingMode: toFacingMode(cameraFacing),
        });
      } else {
        await room.localParticipant.setCameraEnabled(false);
      }
    }
    set({ cameraEnabled: newEnabled });
  },

  async flipCamera() {
    const { cameraEnabled, room } = get();
    if (!room || !cameraEnabled) return;

    const newFacing: 'front' | 'back' = get().cameraFacing === 'front' ? 'back' : 'front';
    if (room.localParticipant && typeof room.localParticipant.setCameraEnabled === 'function') {
      await room.localParticipant.setCameraEnabled(true, {
        facingMode: toFacingMode(newFacing),
      });
    }
    set({ cameraFacing: newFacing });
  },

  setCameraFacing(facing: 'front' | 'back') {
    set({ cameraFacing: facing });
  },
}));
