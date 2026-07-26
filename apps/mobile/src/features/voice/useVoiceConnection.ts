/**
 * useVoiceConnection — main public hook for FR-VOX-001.
 *
 * Wires the VoiceStore to the LiveKit RN SDK: calls POST /voice/:id/join,
 * creates a livekit-client Room, connects, and synchronises room events
 * (participant count, connection-state changes) into the store.
 *
 * LiveKit imports are deferred to `require()` calls inside the hook body
 * so that Jest suites not testing voice can import features/voice without
 * loading native WebRTC modules. Tests that exercise this hook mock
 * `livekit-client` and `@livekit/react-native` at the Jest module boundary.
 *
 * PUBLIC SURFACE:
 *   const { connectionState, activeChannelId, error, participantCount,
 *           join, leave } = useVoiceConnection();
 *
 *   join(channelId: string): Promise<void>
 *     - calls the API, creates a Room, connects, watches events.
 *     - idempotent: if already connected to channelId, no-ops.
 *     - auto-leave: if connected to a different channel, leaves first.
 *
 *   leave(): Promise<void>
 *     - disconnects the LiveKit room, calls POST /voice/:id/leave.
 *     - idempotent: no-op if not connected.
 *
 * @satisfies FR-VOX-001
 * @satisfies FR-VOX-006
 */
import { useCallback, useRef } from 'react';
import { useVoiceStore, type VoiceConnectionState } from './VoiceStore';

export interface VoiceConnectionAPI {
  connectionState: VoiceConnectionState;
  activeChannelId: string | null;
  error: string | null;
  participantCount: number;
  /** Track-level mic mute. @satisfies FR-VOX-003 */
  isMuted: boolean;
  /** Local deafen. @satisfies FR-VOX-003 */
  isDeafened: boolean;
  /** Speaker (true) vs earpiece (false). @satisfies FR-VOX-003 */
  isSpeakerOn: boolean;
  join: (channelId: string) => Promise<void>;
  leave: () => Promise<void>;
  /** Toggle mic mute. @satisfies FR-VOX-003 */
  toggleMute: () => void;
  /** Toggle deafen. @satisfies FR-VOX-003 */
  toggleDeafen: () => void;
  /** Toggle speaker/earpiece. @satisfies FR-VOX-003 */
  toggleSpeaker: () => void;

  // ── Video controls (FR-VOX-006) ──
  /** Whether the local camera is currently publishing. */
  cameraEnabled: boolean;
  /** Which camera facing is active. */
  cameraFacing: 'front' | 'back';
  /** Toggle the local camera on or off. */
  toggleCamera: () => Promise<void>;
  /** Flip between front and back camera while camera is active. */
  flipCamera: () => Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RoomType = any;

/** Map livekit-client ConnectionState strings to our VoiceConnectionState. */
const CS_MAP: Record<string, VoiceConnectionState> = {
  disconnected: 'idle',
  connecting: 'joining',
  connected: 'connected',
  reconnecting: 'joining',
};

export function useVoiceConnection(): VoiceConnectionAPI {
  const store = useVoiceStore();
  const roomRef = useRef<RoomType | null>(null);

  /** Create a livekit-client Room (lazy require). */
  function createRoom(): RoomType {
    // Dynamic require — livekit-client is a native module; Jest mocks it at the boundary.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Room } = require('livekit-client');
    return new Room();
  }

  /** Wire room events → store. */
  function wireRoom(room: RoomType): void {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { RoomEvent: RE } = require('livekit-client');

    room.on(RE.ConnectionStateChanged, (state: string) => {
      const mapped = CS_MAP[String(state)] ?? 'idle';
      useVoiceStore.getState().setConnectionState(mapped);
    });

    const updateCount = () => {
      const count = 1 + (room.remoteParticipants?.size ?? 0);
      useVoiceStore.getState().setParticipantCount(count);
    };

    room.on(RE.ParticipantConnected, updateCount);
    room.on(RE.ParticipantDisconnected, updateCount);

    room.once(RE.Disconnected, () => {
      useVoiceStore.getState().setRoom(null);
      useVoiceStore.getState().setParticipantCount(0);
      useVoiceStore.getState().setConnectionState('idle');
    });

    // Keep the store's isMuted in sync with the actual mic track state.
    // TrackMuted / TrackUnmuted fire for both remote and local participants.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    room.on(RE.TrackMuted, (pub: any, participant: any) => {
      if (participant === room.localParticipant && pub?.source === 'microphone') {
        useVoiceStore.getState().syncMicFromTrack();
      }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    room.on(RE.TrackUnmuted, (pub: any, participant: any) => {
      if (participant === room.localParticipant && pub?.source === 'microphone') {
        useVoiceStore.getState().syncMicFromTrack();
      }
    });

    // Initial count
    updateCount();
  }

  const join = useCallback(async (channelId: string) => {
    // 1. Call the API (store manages join/leave state transitions).
    const joinResp = await useVoiceStore.getState().join(channelId);
    if (!joinResp) return; // already connected to this channel (no-op)

    // 2. Create and connect the LiveKit Room.
    const room = createRoom();
    roomRef.current = room;
    useVoiceStore.getState().setRoom(room);
    wireRoom(room);

    try {
      await room.connect(joinResp.url, joinResp.token);
      // Joining muted is the safer default for mobile (avoid accidental broadcast).
      // This explicitly sets the mic track state and syncs the store to match it.
      await useVoiceStore.getState().muteOnJoin();
    } catch (e) {
      // Connection failed — clean up.
      roomRef.current = null;
      useVoiceStore.getState().setRoom(null);
      const msg = e instanceof Error ? e.message : 'connection failed';
      useVoiceStore.setState({ connectionState: 'idle', activeChannelId: null, error: msg });
      throw e;
    }
  }, []);

  const leave = useCallback(async () => {
    const room = roomRef.current;
    if (room && typeof room.disconnect === 'function') {
      room.disconnect();
    }
    roomRef.current = null;
    await useVoiceStore.getState().leave();
  }, []);

  const toggleCamera = useCallback(async () => {
    await useVoiceStore.getState().toggleCamera();
  }, []);

  const flipCamera = useCallback(async () => {
    await useVoiceStore.getState().flipCamera();
  }, []);

  const storeControls = useVoiceStore.getState();
  return {
    connectionState: store.connectionState,
    activeChannelId: store.activeChannelId,
    error: store.error,
    participantCount: store.participantCount,
    isMuted: store.isMuted,
    isDeafened: store.isDeafened,
    isSpeakerOn: store.isSpeakerOn,
    join,
    leave,
    toggleMute: storeControls.toggleMute,
    toggleDeafen: storeControls.toggleDeafen,
    toggleSpeaker: storeControls.toggleSpeaker,
    cameraEnabled: store.cameraEnabled,
    cameraFacing: store.cameraFacing,
    toggleCamera,
    flipCamera,
  };
}
