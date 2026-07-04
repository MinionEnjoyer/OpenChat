import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';
import * as api from './api';
import { getAudioPrefs, saveAudioPrefs, type AudioPrefs } from './audioPrefs';

export interface VoiceParticipant {
  identity: string;
  name: string;
  isMe: boolean;
  speaking: boolean;
  micOn: boolean;
}

/**
 * App-level voice session. The LiveKit Room lives here (not in the view) so the connection
 * persists while the user browses other channels.
 */
export function useVoice() {
  const roomRef = useRef<Room | null>(null);
  const audioEls = useRef<HTMLMediaElement[]>([]);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [muted, setMuted] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const snapshot = useCallback((room: Room) => {
    const all = [room.localParticipant, ...room.remoteParticipants.values()];
    setParticipants(all.map((p) => ({
      identity: p.identity,
      name: p.name || p.identity,
      isMe: p === room.localParticipant,
      speaking: p.isSpeaking,
      micOn: p.isMicrophoneEnabled,
    })));
  }, []);

  const cleanupAudio = useCallback(() => {
    for (const el of audioEls.current) el.remove();
    audioEls.current = [];
  }, []);

  // Apply saved output device + volume to a freshly-attached remote audio element.
  const applyOutput = useCallback((el: HTMLMediaElement) => {
    const p = getAudioPrefs();
    el.volume = Math.max(0, Math.min(1, p.outputVolume / 100));
    if (p.outputDeviceId && 'setSinkId' in el) {
      (el as any).setSinkId(p.outputDeviceId).catch(() => {});
    }
  }, []);

  const leave = useCallback(async () => {
    const room = roomRef.current;
    const ch = channelId;
    roomRef.current = null;
    setChannelId(null);
    setParticipants([]);
    cleanupAudio();
    if (room) { try { await room.disconnect(); } catch { /* ignore */ } }
    if (ch) { try { await api.voiceLeave(ch); } catch { /* ignore */ } }
  }, [channelId, cleanupAudio]);

  const join = useCallback(async (chId: string) => {
    if (roomRef.current && channelId === chId) return; // already here
    if (roomRef.current) await leave(); // switch rooms
    setConnecting(true);
    try {
      const { url, token } = await api.voiceJoin(chId);
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room
        .on(RoomEvent.ParticipantConnected, () => snapshot(room))
        .on(RoomEvent.ParticipantDisconnected, () => snapshot(room))
        .on(RoomEvent.ActiveSpeakersChanged, () => snapshot(room))
        .on(RoomEvent.TrackMuted, () => snapshot(room))
        .on(RoomEvent.TrackUnmuted, () => snapshot(room))
        .on(RoomEvent.LocalTrackPublished, () => snapshot(room))
        .on(RoomEvent.Disconnected, () => {
          roomRef.current = null;
          setChannelId(null);
          setParticipants([]);
          cleanupAudio();
        })
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach();
            el.style.display = 'none';
            document.body.appendChild(el);
            applyOutput(el);
            audioEls.current.push(el);
          }
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Audio) track.detach().forEach((el) => el.remove());
        });
      // Boot the user out if the connection can't establish within 30s (dead media path,
      // unreachable SFU, etc.) instead of hanging on "Connecting…" forever.
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          room.connect(url, token),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Voice connection timed out after 30s')), 30_000);
          }),
        ]);
      } finally {
        clearTimeout(timeoutId);
      }
      const prefs = getAudioPrefs();
      await room.localParticipant.setMicrophoneEnabled(
        true,
        prefs.inputDeviceId ? { deviceId: { exact: prefs.inputDeviceId } } : undefined,
      );
      setMuted(false);
      setChannelId(chId);
      snapshot(room);
    } catch (e) {
      if (roomRef.current) { try { await roomRef.current.disconnect(); } catch { /* ignore */ } }
      roomRef.current = null;
      setChannelId(null);
      setParticipants([]);
      cleanupAudio();
      throw e;
    } finally {
      setConnecting(false);
    }
  }, [channelId, leave, snapshot, cleanupAudio]);

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
    snapshot(room);
  }, [muted, snapshot]);

  // ---- live device / volume controls (persisted to localStorage) ----
  const setInputDevice = useCallback(async (deviceId: string) => {
    saveAudioPrefs({ inputDeviceId: deviceId || null });
    const room = roomRef.current;
    if (room && deviceId) {
      try { await room.switchActiveDevice('audioinput', deviceId); } catch { /* ignore */ }
    }
  }, []);

  const setOutputDevice = useCallback(async (deviceId: string) => {
    saveAudioPrefs({ outputDeviceId: deviceId || null });
    for (const el of audioEls.current) {
      if ('setSinkId' in el) (el as any).setSinkId(deviceId).catch(() => {});
    }
    const room = roomRef.current;
    if (room && deviceId) {
      try { await room.switchActiveDevice('audiooutput', deviceId); } catch { /* ignore */ }
    }
  }, []);

  const setOutputVolume = useCallback((vol: number) => {
    const v = Math.max(0, Math.min(100, Math.round(vol)));
    saveAudioPrefs({ outputVolume: v });
    for (const el of audioEls.current) el.volume = v / 100;
  }, []);

  const getPrefs = useCallback((): AudioPrefs => getAudioPrefs(), []);

  // Disconnect if the whole app unmounts.
  useEffect(() => () => { roomRef.current?.disconnect().catch(() => {}); }, []);

  return {
    channelId, participants, muted, connecting, join, leave, toggleMute,
    audio: { getPrefs, setInputDevice, setOutputDevice, setOutputVolume },
  };
}
