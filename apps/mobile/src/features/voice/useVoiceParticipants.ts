/**
 * useVoiceParticipants — hooks into LiveKit events to populate the
 * participant roster for FR-VOX-002 tiles.
 *
 * Wires RoomEvent.ParticipantConnected / Disconnected,
 * ActiveSpeakersChanged, and TrackMuted/Unmuted into the VoiceStore's
 * participant list.  Call this hook once when the voice-connection UI
 * mounts; it is idempotent.
 *
 * LiveKit imports are deferred via require() so Jest suites not testing
 * voice can import features/voice without loading native WebRTC modules.
 *
 * @satisfies FR-VOX-002
 */
import { useEffect, useRef } from 'react';
import { useVoiceStore } from './VoiceStore';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RoomType = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ParticipantType = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TrackPubType = any;

/** Returns the display name to show in the tile. */
function displayNameFor(
  identity: string,
  _metadata: string | undefined,
): { username: string; displayName: string | null } {
  // LiveKit participant.name defaults to identity.
  // Per-contract, our identity = userId, so we use that as username initially.
  // The caller can enrich from the GET participants response later.
  return { username: identity, displayName: null };
}

function isParticipantMuted(p: ParticipantType): boolean {
  try {
    // Participant.isMicrophoneEnabled is false when muted
    const track = p.getTrackPublication?.('microphone');
    if (track && typeof track.isMuted === 'boolean') return track.isMuted;
  } catch {
    // best-effort
  }
  try {
    // Fallback: Participant.isMicrophoneEnabled
    if (typeof p.isMicrophoneEnabled === 'boolean') return !p.isMicrophoneEnabled;
  } catch {
    // best-effort
  }
  return false;
}

/**
 * Main hook — call once from the voice UI (e.g. VoiceTileGrid).
 * Requires the VoiceStore to already have a `room` (set by useVoiceConnection).
 */
export function useVoiceParticipants(): void {
  const room = useVoiceStore((s) => s.room);
  const roomRef = useRef<RoomType | null>(null);
  const listenerRef = useRef(false);

  useEffect(() => {
    // Guard: no room yet, or already listening
    if (!room || listenerRef.current) return;
    listenerRef.current = true;
    roomRef.current = room;

    // Dynamic require — livekit-client is a native module; Jest mocks it at the boundary.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { RoomEvent: RE } = require('livekit-client');

    const store = useVoiceStore.getState;

    /** Build a VoiceParticipantInfo from a LiveKit Participant. */
    function participantToInfo(p: ParticipantType, local: boolean) {
      const identity = String(p.identity ?? '');
      const meta = displayNameFor(identity, p.metadata);
      return {
        id: identity,
        username: meta.username,
        displayName: meta.displayName,
        avatarUrl: null,
        isSpeaking: false,
        audioLevel: 0,
        isMuted: isParticipantMuted(p),
        isLocal: local,
      };
    }

    // ── Participant join/leave ──

    room.on(RE.ParticipantConnected, (p: ParticipantType) => {
      store().upsertParticipant(participantToInfo(p, false));
    });

    room.on(RE.ParticipantDisconnected, (p: ParticipantType) => {
      store().removeParticipant(String(p.identity ?? ''));
    });

    // ── Speaking indicators ──

    room.on(RE.ActiveSpeakersChanged, (speakers: ParticipantType[]) => {
      // Clear all speaking flags
      for (const p of store().participants) {
        store().setSpeaking(p.id, false);
        store().setAudioLevel(p.id, 0);
      }
      // Set speaking for active speakers
      for (const sp of speakers) {
        const id = String(sp.identity ?? '');
        store().setSpeaking(id, true);
        // LiveKit exposes audioLevel on Participant; clamp 0–1
        let level = 0;
        try {
          if (typeof sp.audioLevel === 'number') {
            level = Math.max(0, Math.min(1, sp.audioLevel));
          }
        } catch {
          // best-effort
        }
        store().setAudioLevel(id, level);
      }
    });

    // ── Mute tracking ──

    function updateMute(p: ParticipantType) {
      const id = String(p.identity ?? '');
      store().setMuted(id, isParticipantMuted(p));
    }

    room.on(RE.TrackMuted, (_pub: TrackPubType, p: ParticipantType) => {
      updateMute(p);
    });

    room.on(RE.TrackUnmuted, (_pub: TrackPubType, p: ParticipantType) => {
      updateMute(p);
    });

    room.on(RE.TrackPublished, (_pub: TrackPubType, p: ParticipantType) => {
      updateMute(p);
    });

    // Wire local participant
    try {
      const local = room.localParticipant;
      if (local) {
        store().upsertParticipant(participantToInfo(local, true));
        updateMute(local);
      }
    } catch {
      // best-effort
    }

    // Seed existing remote participants
    try {
      if (typeof room.remoteParticipants?.forEach === 'function') {
        (room.remoteParticipants as Map<string, ParticipantType>).forEach((p: ParticipantType) => {
          store().upsertParticipant(participantToInfo(p, false));
        });
      }
    } catch {
      // best-effort
    }

    // ── Cleanup on disconnect ──

    room.once(RE.Disconnected, () => {
      store().setParticipants([]);
      listenerRef.current = false;
      roomRef.current = null;
    });

  }, [room]);
}
