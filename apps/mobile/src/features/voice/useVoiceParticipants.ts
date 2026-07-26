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
 * D1 (duplicate local participant) diagnosis:
 *   On Android LiveKit RN, the room.remoteParticipants map can transiently
 *   include the local participant during room setup (timing window in the
 *   native bridge).  The ParticipantConnected event is specified to fire
 *   only for remote participants but the seed path (remoteParticipants.forEach)
 *   may pick up the local participant before the identity check completes.
 *   Fix: skip any participant whose identity matches room.localParticipant.identity
 *   in both the event handler and the remote seed loop.
 *
 * D2 (raw UUID display name):
 *   LiveKit participants carry identity = userId (UUID).  The tile needs a
 *   human-readable username.  After seeding from LiveKit, fetch
 *   GET /voice/:channelId/participants and merge displayName / username
 *   into the store.
 *
 * @satisfies FR-VOX-002
 */
import { useEffect, useRef } from 'react';
import { useVoiceStore, getVoiceService } from './VoiceStore';
import type { VoiceParticipant } from '../../api/schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RoomType = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ParticipantType = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TrackPubType = any;

/**
 * Returns the display name to show in the tile.
 *
 * On first call, returns the identity as a fallback username.
 * Enriched later via mergeParticipantDisplay() from the API response
 * (GET /voice/:channelId/participants), which provides the real username.
 * @satisfies D2
 */
function displayNameFor(
  identity: string,
  _metadata: string | undefined,
): { username: string; displayName: string | null } {
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
    // D1: skip the local participant — on Android the native bridge may
    // transiently include the local identity in remoteParticipants or fire
    // ParticipantConnected for it.  We already add the local participant
    // explicitly below.
    const localIdentity = (() => {
      try {
        return String(room.localParticipant?.identity ?? '');
      } catch {
        return '';
      }
    })();

    room.on(RE.ParticipantConnected, (p: ParticipantType) => {
      const identity = String(p.identity ?? '');
      // @satisfies D1 — skip duplicate local participant when identity
      // was already captured at mount time.  When localIdentity is empty
      // (Android RN timing), the second guard below catches the real
      // local participant and adds it with isLocal:true.
      if (identity && identity === localIdentity) return;
      // D1: when identity was empty at mount time, detect the local
      // participant by comparing against the live localParticipant.identity
      // (which may have been populated since the effect ran).
      const liveLocalId = (() => {
        try { return String(room.localParticipant?.identity ?? ''); } catch { return ''; }
      })();
      if (identity && liveLocalId && identity === liveLocalId) {
        store().upsertParticipant(participantToInfo(p, true));
      } else {
        store().upsertParticipant(participantToInfo(p, false));
      }
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
    // D1: if identity is empty (Android RN timing — native bridge hasn't
    // synchronised yet), skip the local add.  The ParticipantConnected
    // handler detects the local participant when identity arrives and
    // adds it with isLocal:true.
    try {
      const local = room.localParticipant;
      if (local) {
        const identity = String(local.identity ?? '');
        if (identity) {
          store().upsertParticipant(participantToInfo(local, true));
          updateMute(local);
        }
      }
    } catch {
      // best-effort
    }

    // Seed existing remote participants
    // @satisfies D1 — skip any participant whose identity matches the local
    // participant, because on Android the remoteParticipants map can
    // transiently include it during room setup.
    try {
      if (typeof room.remoteParticipants?.forEach === 'function') {
        (room.remoteParticipants as Map<string, ParticipantType>).forEach((p: ParticipantType) => {
          const identity = String(p.identity ?? '');
          if (identity && identity === localIdentity) return;
          store().upsertParticipant(participantToInfo(p, false));
        });
      }
    } catch {
      // best-effort
    }

    // ── D2: enrich participant display names from API ──
    // Fetch GET /voice/:channelId/participants to resolve UUID identities
    // to human-readable usernames, then merge into store.
    // @satisfies D2
    const channelId = useVoiceStore.getState().activeChannelId;
    if (channelId) {
      getVoiceService().getParticipants(channelId)
        .then((apiParticipants: VoiceParticipant[]) => {
          for (const ap of apiParticipants) {
            const current = useVoiceStore.getState().participants.find((p) => p.id === ap.id);
            if (!current) continue; // only enrich already-known participants
            useVoiceStore.getState().upsertParticipant({
              ...current,
              username: ap.username,
              displayName: ap.displayName,
              avatarUrl: ap.avatarUrl,
            });
          }
        })
        .catch(() => {
          // best-effort: tiles fall back to identity as username
        });
    }

    // ── Cleanup on disconnect ──

    room.once(RE.Disconnected, () => {
      store().setParticipants([]);
      listenerRef.current = false;
      roomRef.current = null;
    });

  }, [room]);
}
