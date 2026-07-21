import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, createLocalScreenTracks, type RemoteTrack, type RemoteTrackPublication, type RemoteParticipant, type LocalTrack } from 'livekit-client';
import * as api from './api';
import { getAudioPrefs, saveAudioPrefs, type AudioPrefs } from './audioPrefs';

export interface VoiceParticipant {
  identity: string;
  name: string;
  isMe: boolean;
  speaking: boolean;
  micOn: boolean;
}

/** A live screen-share video (local preview or a remote participant's share). */
export interface ScreenShare {
  id: string;
  identity: string; // owning participant's identity (for correlating to their tile)
  name: string;
  isMe: boolean;
  track: MediaStreamTrack;
}

/**
 * App-level voice session. The LiveKit Room lives here (not in the view) so the connection
 * persists while the user browses other channels.
 */
export function useVoice() {
  const roomRef = useRef<Room | null>(null);
  const audioEls = useRef<HTMLMediaElement[]>([]);
  // Soundboard: a WebAudio destination published as a separate LiveKit track; sounds are
  // decoded and played into it (and locally) so everyone in the call hears them.
  const soundCtxRef = useRef<AudioContext | null>(null);
  const soundDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const soundTrackRef = useRef<MediaStreamTrack | null>(null);
  const soundCache = useRef<Map<string, AudioBuffer>>(new Map());
  // Screen sharing: one entry per shared surface/monitor; each groups its video +
  // (optional) system-audio track so a single surface can be stopped independently.
  const screenSurfacesRef = useRef<{ id: string; tracks: LocalTrack[] }[]>([]);
  const [screens, setScreens] = useState<ScreenShare[]>([]);
  const [sharing, setSharing] = useState(false);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [muted, setMuted] = useState(false);
  const [connecting, setConnecting] = useState(false);
  // Diagnostics for testing: live connection phase + last failure reason.
  const [status, setStatus] = useState('');
  const [lastError, setLastError] = useState<string | null>(null);

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
    // Stop any active screen shares.
    for (const surface of screenSurfacesRef.current) for (const t of surface.tracks) { try { t.stop(); } catch { /* ignore */ } }
    screenSurfacesRef.current = [];
    setScreens([]);
    setSharing(false);
    // Tear down the soundboard graph + published track.
    soundTrackRef.current?.stop();
    soundTrackRef.current = null;
    soundDestRef.current = null;
    soundCtxRef.current?.close().catch(() => {});
    soundCtxRef.current = null;
    soundCache.current.clear();
  }, []);

  /** Play a soundboard clip into the current call (everyone hears it) + locally. */
  const playSound = useCallback(async (url: string) => {
    if (getAudioPrefs().muteSoundboard) return; // soundboard disabled for this user
    const room = roomRef.current;
    if (!room) return;
    // Lazily create the audio graph + publish a dedicated soundboard track.
    if (!soundCtxRef.current) {
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      soundCtxRef.current = ctx;
      soundDestRef.current = dest;
      const track = dest.stream.getAudioTracks()[0];
      soundTrackRef.current = track;
      try {
        await room.localParticipant.publishTrack(track, { name: 'soundboard', dtx: true, red: false });
      } catch { /* ignore — publish may already exist */ }
    }
    const ctx = soundCtxRef.current;
    const dest = soundDestRef.current;
    if (!ctx || !dest) return;
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch { /* ignore */ } }
    let buf = soundCache.current.get(url);
    if (!buf) {
      const res = await fetch(url, { credentials: 'include' });
      const arr = await res.arrayBuffer();
      buf = await ctx.decodeAudioData(arr);
      soundCache.current.set(url, buf);
    }
    const node = ctx.createBufferSource();
    node.buffer = buf;
    node.connect(dest);            // → published to the room
    node.connect(ctx.destination); // → local monitor so the clicker hears it too
    node.start();
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
    setLastError(null);
    setStatus('requesting token');
    try {
      const { url, token } = await api.voiceJoin(chId);
      console.debug('[voice] token ok, connecting to', url);
      setStatus('connecting');
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room
        .on(RoomEvent.SignalConnected, () => { console.debug('[voice] signal connected (media negotiating…)'); setStatus('negotiating media'); })
        .on(RoomEvent.ConnectionStateChanged, (s) => { console.debug('[voice] connection state:', s); setStatus(String(s)); })
        .on(RoomEvent.Reconnecting, () => { console.warn('[voice] reconnecting…'); setStatus('reconnecting'); })
        .on(RoomEvent.Reconnected, () => { console.debug('[voice] reconnected'); setStatus('connected'); })
        .on(RoomEvent.MediaDevicesError, (e) => { console.error('[voice] media/device error', e); setLastError('Mic/device error: ' + ((e as any)?.message ?? e)); })
        .on(RoomEvent.ParticipantConnected, () => snapshot(room))
        .on(RoomEvent.ParticipantDisconnected, () => snapshot(room))
        .on(RoomEvent.ActiveSpeakersChanged, () => snapshot(room))
        .on(RoomEvent.TrackMuted, () => snapshot(room))
        .on(RoomEvent.TrackUnmuted, () => snapshot(room))
        .on(RoomEvent.LocalTrackPublished, () => snapshot(room))
        .on(RoomEvent.Disconnected, (reason) => {
          console.debug('[voice] disconnected, reason:', reason);
          // Close the server-side session on ANY disconnect (drop, SFU restart, kick),
          // not just an explicit leave — otherwise the user is left as a ghost participant.
          api.voiceLeave(chId).catch(() => {});
          roomRef.current = null;
          setChannelId(null);
          setParticipants([]);
          setStatus('');
          cleanupAudio();
        })
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach();
            el.style.display = 'none';
            // Tag the soundboard track so it can be silenced independently of voices.
            if (pub?.trackName === 'soundboard') {
              (el as HTMLElement).dataset.sb = '1';
              el.muted = getAudioPrefs().muteSoundboard;
            }
            document.body.appendChild(el);
            applyOutput(el);
            audioEls.current.push(el);
          } else if (track.kind === Track.Kind.Video) {
            // A participant's screen share.
            const name = participant?.name || participant?.identity || 'Screen';
            setScreens((prev) => [...prev.filter((s) => s.id !== pub.trackSid), { id: pub.trackSid, identity: participant?.identity ?? pub.trackSid, name, isMe: false, track: track.mediaStreamTrack }]);
          }
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, pub: RemoteTrackPublication) => {
          if (track.kind === Track.Kind.Audio) track.detach().forEach((el) => el.remove());
          else if (track.kind === Track.Kind.Video) setScreens((prev) => prev.filter((s) => s.id !== pub.trackSid));
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
      setStatus('connected');
      console.debug('[voice] connected to', chId);
      snapshot(room);
    } catch (e) {
      const msg = (e as any)?.message || String(e);
      console.error('[voice] join failed:', msg, e);
      setLastError(msg);
      setStatus('failed');
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

  /** Stop a single shared surface (video + its system audio) by id. */
  const stopScreen = useCallback(async (id: string) => {
    const room = roomRef.current;
    const surface = screenSurfacesRef.current.find((s) => s.id === id);
    if (!surface) return;
    screenSurfacesRef.current = screenSurfacesRef.current.filter((s) => s.id !== id);
    for (const t of surface.tracks) {
      try { if (room) await room.localParticipant.unpublishTrack(t, true); } catch { /* ignore */ }
      try { t.stop(); } catch { /* ignore */ }
    }
    setScreens((prev) => prev.filter((s) => s.id !== id));
    setSharing(screenSurfacesRef.current.length > 0);
  }, []);

  /** Stop every active screen share (unpublish + release the capture). */
  const stopScreenShare = useCallback(async () => {
    const room = roomRef.current;
    const surfaces = screenSurfacesRef.current;
    screenSurfacesRef.current = [];
    for (const surface of surfaces) for (const t of surface.tracks) {
      try { if (room) await room.localParticipant.unpublishTrack(t, true); } catch { /* ignore */ }
      try { t.stop(); } catch { /* ignore */ }
    }
    setScreens((prev) => prev.filter((s) => !s.isMe));
    setSharing(false);
  }, []);

  /**
   * Start a screen share. The browser's native picker lets the user choose an
   * application window, a browser tab, or an entire monitor (incl. tab/system audio).
   * Calling this again adds another surface — e.g. a second monitor — as its own track.
   */
  const startScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    let tracks: LocalTrack[];
    try {
      tracks = await createLocalScreenTracks({
        audio: true,
        contentHint: 'detail', // prioritise sharpness (text/UI) over framerate
        resolution: { width: 2560, height: 1440, frameRate: 30 },
      });
    } catch {
      return; // user cancelled the picker or capture was denied
    }
    const maxBitrate = Math.round(Math.max(1, getAudioPrefs().screenShareBitrate) * 1_000_000);
    const published: LocalTrack[] = [];
    for (const t of tracks) {
      const opts = t.kind === Track.Kind.Video
        ? { screenShareEncoding: { maxBitrate, maxFramerate: 30, priority: 'high' as const }, degradationPreference: 'maintain-resolution' as const }
        : undefined;
      try { await room.localParticipant.publishTrack(t, opts); published.push(t); }
      catch { try { t.stop(); } catch { /* ignore */ } }
    }
    const video = published.find((t) => t.kind === Track.Kind.Video);
    if (!video) {
      // Nothing usable was published — clean up whatever went through.
      for (const t of published) { try { await room.localParticipant.unpublishTrack(t, true); } catch { /* ignore */ } try { t.stop(); } catch { /* ignore */ } }
      return;
    }
    const mst = video.mediaStreamTrack;
    const id = mst.id;
    screenSurfacesRef.current.push({ id, tracks: published });
    setScreens((prev) => [...prev, { id, identity: room.localParticipant.identity, name: 'You', isMe: true, track: mst }]);
    setSharing(true);
    // When the user stops this surface from the browser's own "Stop sharing" bar.
    mst.addEventListener('ended', () => { stopScreen(id); }, { once: true });
  }, [stopScreen]);

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

  const setMuteSoundboard = useCallback((m: boolean) => {
    saveAudioPrefs({ muteSoundboard: m });
    for (const el of audioEls.current) {
      if ((el as HTMLElement).dataset?.sb === '1') el.muted = m;
    }
  }, []);

  // Persist the screen-share bitrate; applies to the next share you start.
  const setScreenShareBitrate = useCallback((mbps: number) => {
    saveAudioPrefs({ screenShareBitrate: Math.max(1, Math.min(50, Math.round(mbps))) });
  }, []);

  const getPrefs = useCallback((): AudioPrefs => getAudioPrefs(), []);

  // Disconnect if the whole app unmounts.
  useEffect(() => () => { roomRef.current?.disconnect().catch(() => {}); }, []);

  return {
    channelId, participants, muted, connecting, status, lastError, join, leave, toggleMute, playSound,
    screens, sharing, startScreenShare, stopScreenShare, stopScreen,
    audio: { getPrefs, setInputDevice, setOutputDevice, setOutputVolume, setMuteSoundboard, setScreenShareBitrate },
  };
}
