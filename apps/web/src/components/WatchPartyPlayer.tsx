import { useEffect, useRef, useState } from 'react';
import type { WatchPartyState } from '../lib/types';

/**
 * Synced Jellyfin player. The host's play/pause/seek drive everyone; followers apply incoming
 * state to their <video> and don't emit. Browser autoplay policies may require a click first.
 */
export function WatchPartyPlayer({
  party,
  isHost,
  onState,
  onStop,
}: {
  party: WatchPartyState;
  isHost: boolean;
  onState: (positionMs: number, paused: boolean) => void;
  onStop: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [needsGesture, setNeedsGesture] = useState(false);

  // Followers: apply incoming host state to the video.
  useEffect(() => {
    if (isHost) return;
    const v = videoRef.current;
    if (!v) return;
    const target = party.positionMs / 1000;
    if (Math.abs(v.currentTime - target) > 1.5) v.currentTime = target;
    if (party.paused && !v.paused) v.pause();
    if (!party.paused && v.paused) v.play().catch(() => setNeedsGesture(true));
  }, [party.positionMs, party.paused, isHost]);

  // Host: emit on play/pause/seek + a heartbeat while playing.
  useEffect(() => {
    if (!isHost) return;
    const v = videoRef.current;
    if (!v) return;
    const emit = () => onState(Math.round(v.currentTime * 1000), v.paused);
    v.addEventListener('play', emit);
    v.addEventListener('pause', emit);
    v.addEventListener('seeked', emit);
    const hb = setInterval(() => { if (!v.paused) emit(); }, 4000);
    return () => {
      v.removeEventListener('play', emit);
      v.removeEventListener('pause', emit);
      v.removeEventListener('seeked', emit);
      clearInterval(hb);
    };
  }, [isHost, onState, party.itemId]);

  // On (re)load of a title, seek to the shared position.
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.currentTime = party.positionMs / 1000;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party.itemId]);

  function resume() {
    setNeedsGesture(false);
    videoRef.current?.play().catch(() => setNeedsGesture(true));
  }

  return (
    <div style={{ background: '#000', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', color: 'var(--text-strong)', background: 'var(--panel-dark)' }}>
        <span style={{ fontWeight: 700 }}>🎬 {party.itemName}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{isHost ? 'You are hosting' : 'Host controls playback'}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {isHost && (
            <button onClick={onStop} style={{ padding: '4px 12px', borderRadius: 4, border: 'none', background: 'var(--danger)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
              End Party
            </button>
          )}
        </div>
      </div>
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
        <video
          ref={videoRef}
          src={party.streamUrl}
          controls={isHost}
          autoPlay={!party.paused}
          playsInline
          style={{ width: '100%', maxHeight: '52vh', background: '#000' }}
        />
        {needsGesture && (
          <button onClick={resume}
            style={{ position: 'absolute', inset: 0, margin: 'auto', width: 200, height: 56, borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
            ▶ Tap to watch
          </button>
        )}
      </div>
    </div>
  );
}
