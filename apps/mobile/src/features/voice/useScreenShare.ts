/**
 * useScreenShare — subscribe to remote screen share tracks (FR-VOX-007).
 *
 * Listens for screen share tracks published by remote participants via
 * livekit-client Room events. Returns an array of ScreenShareTrack objects
 * and a per-stream toggle for show/hide.
 *
 * Uses the Room from VoiceStore; does NOT create its own connection.
 *
 * @satisfies FR-VOX-007
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useVoiceStore } from './VoiceStore';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TrackRefType = any; // TrackReference from @livekit/components-core

export interface ScreenShareTrack {
  /** Unique track SID from the publication. */
  id: string;
  /** Display name of the participant sharing. */
  participantName: string;
  /** TrackReference constructed for the VideoTrack component. */
  trackRef: TrackRefType;
  /** Whether this screen share is currently visible (user-toggle). */
  visible: boolean;
}

export interface UseScreenShareResult {
  /** Active remote screen share tracks. */
  screens: ScreenShareTrack[];
  /** Number of screen shares currently available. */
  count: number;
  /** Toggle visibility of a specific screen share stream. */
  toggleVisibility: (id: string) => void;
}

/** Build a TrackReference from a publication+participant for VideoTrack. */
function buildTrackRef(
  participant: TrackRefType,
  publication: TrackRefType,
  source: string,
): TrackRefType {
  return { participant, publication, source };
}

export function useScreenShare(): UseScreenShareResult {
  const room = useVoiceStore((s) => s.room);
  const [screens, setScreens] = useState<ScreenShareTrack[]>([]);
  const subscribedIds = useRef<Set<string>>(new Set());

  // Wire room events for screen share track subscription
  useEffect(() => {
    if (!room) {
      setScreens([]);
      subscribedIds.current.clear();
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { RoomEvent: RE, Track } = require('livekit-client');

    const SCREEN_SHARE_SOURCE = Track.Source?.ScreenShare ?? 'screen_share';

    const handleSubscribed = (
      _track: TrackRefType,
      publication: TrackRefType,
      participant: TrackRefType,
    ) => {
      const sid = publication?.trackSid;
      if (!sid || subscribedIds.current.has(sid)) return;
      if (publication?.source !== SCREEN_SHARE_SOURCE) return;

      subscribedIds.current.add(sid);
      const name =
        participant?.name || participant?.identity || 'Screen';
      const trackRef = buildTrackRef(participant, publication, SCREEN_SHARE_SOURCE);

      setScreens((prev) => [
        ...prev,
        { id: sid, participantName: name, trackRef, visible: true },
      ]);
    };

    const handleUnsubscribed = (
      _track: TrackRefType,
      publication: TrackRefType,
    ) => {
      const sid = publication?.trackSid;
      if (!sid) return;
      subscribedIds.current.delete(sid);
      setScreens((prev) => prev.filter((s) => s.id !== sid));
    };

    // Scan existing participants for already-published screen share tracks
    const snapshotExisting = () => {
      const participants = room.remoteParticipants;
      if (!participants || typeof participants.forEach !== 'function') return;
      participants.forEach((p: TrackRefType) => {
        const pubs = p.trackPublications;
        if (!pubs || typeof pubs.forEach !== 'function') return;
        pubs.forEach((pub: TrackRefType) => {
          if (pub?.source === SCREEN_SHARE_SOURCE && pub.track) {
            const sid = pub.trackSid;
            if (!sid || subscribedIds.current.has(sid)) return;
            subscribedIds.current.add(sid);
            const name = p.name || p.identity || 'Screen';
            const trackRef = buildTrackRef(p, pub, SCREEN_SHARE_SOURCE);
            setScreens((prev) => [
              ...prev,
              { id: sid, participantName: name, trackRef, visible: true },
            ]);
          }
        });
      });
    };

    room.on(RE.TrackSubscribed, handleSubscribed);
    room.on(RE.TrackUnsubscribed, handleUnsubscribed);

    // Snapshot after a short delay to let existing subscriptions settle
    const timer = setTimeout(snapshotExisting, 100);

    return () => {
      clearTimeout(timer);
      room.off(RE.TrackSubscribed, handleSubscribed);
      room.off(RE.TrackUnsubscribed, handleUnsubscribed);
    };
  }, [room]);

  const toggleVisibility = useCallback((id: string) => {
    setScreens((prev) =>
      prev.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)),
    );
  }, []);

  return {
    screens,
    count: screens.length,
    toggleVisibility,
  };
}
