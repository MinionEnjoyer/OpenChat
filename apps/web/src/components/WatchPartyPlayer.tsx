import { useCallback, useEffect, useRef, useState } from 'react';
import type { WatchPartyState } from '../lib/types';
import { serverOrigin, mediaUrl } from '../lib/serverConfig';

/**
 * Synced watch-party player. The host's play/pause/seek drive everyone; followers apply the
 * incoming shared state and don't emit. Supports a Jellyfin stream (<video>) or a YouTube
 * video (IFrame Player API via an https-origin shim so it also works in the desktop app).
 */
export function WatchPartyPlayer({
  party,
  isHost,
  viewers,
  onState,
  onClose,
  onLeave,
}: {
  party: WatchPartyState;
  isHost: boolean;
  viewers?: string[];
  onState: (positionMs: number, paused: boolean) => void;
  onClose: () => void;
  onLeave: () => void;
}) {
  return (
    <div style={{ background: '#000', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', color: 'var(--text-strong)', background: 'var(--panel-dark)' }}>
        <span style={{ fontWeight: 700 }}>{party.source === 'youtube' ? '📺' : '🎬'} {party.itemName}</span>
        <span title={`${party.hostName} is hosting`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'var(--accent)', color: '#fff', whiteSpace: 'nowrap' }}>
          👑 {isHost ? 'You' : party.hostName}
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{isHost ? 'You control playback' : 'Host controls playback'}</span>
        {viewers && viewers.length > 0 && (
          <span title={`Watching: ${viewers.join(', ')}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)', minWidth: 0 }}>
            👁 {viewers.length}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>· {viewers.join(', ')}</span>
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={isHost ? onClose : onLeave}
            style={{ padding: '4px 12px', borderRadius: 4, border: 'none', background: isHost ? 'var(--danger)' : 'var(--panel-hover)', color: isHost ? '#fff' : 'var(--text-strong)', cursor: 'pointer', fontWeight: 600, fontSize: 12, flexShrink: 0 }}
          >
            {isHost ? 'Close Party' : 'Exit Party'}
          </button>
        </div>
      </div>
      {party.source === 'youtube' && party.youtubeId
        ? <YouTubeInner party={party} isHost={isHost} onState={onState} />
        : <JellyfinInner party={party} isHost={isHost} onState={onState} />}
    </div>
  );
}

function JellyfinInner({ party, isHost, onState }: { party: WatchPartyState; isHost: boolean; onState: (positionMs: number, paused: boolean) => void }) {
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
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      <video
        ref={videoRef}
        src={party.streamUrl ? mediaUrl(party.streamUrl) : undefined}
        poster={party.posterUrl ? mediaUrl(party.posterUrl) : undefined}
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
  );
}

function YouTubeInner({ party, isHost, onState }: { party: WatchPartyState; isHost: boolean; onState: (positionMs: number, paused: boolean) => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [muted, setMuted] = useState(true); // followers start muted (so playback can autoplay)
  const lastEmit = useRef(0);
  const partyRef = useRef(party);
  partyRef.current = party;

  const src = `${serverOrigin()}/yt-party.html?v=${party.youtubeId}&host=${isHost ? 1 : 0}`;

  const cmd = useCallback((msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage({ ns: 'ytparty-cmd', ...msg }, '*');
  }, []);

  // Messages from the shim's YouTube player.
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || d.ns !== 'ytparty') return;
      if (isHost) {
        // Host: forward the player's position/paused as the shared state (throttled; always
        // on an explicit state change like play/pause/seek).
        if (d.type === 'state' || d.type === 'time') {
          const now = Date.now();
          if (d.type === 'state' || now - lastEmit.current > 3000) {
            lastEmit.current = now;
            onState(Math.round((d.time || 0) * 1000), !!d.paused);
          }
        }
      } else {
        if (typeof d.muted === 'boolean') setMuted(d.muted);
        // Apply the current shared state as soon as the player is ready.
        if (d.type === 'ready') {
          const p = partyRef.current;
          cmd({ action: 'sync', time: p.positionMs / 1000, paused: p.paused });
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [isHost, onState, cmd]);

  // Follower: apply incoming host state changes.
  useEffect(() => {
    if (isHost) return;
    cmd({ action: 'sync', time: party.positionMs / 1000, paused: party.paused });
  }, [party.positionMs, party.paused, party.youtubeId, isHost, cmd]);

  return (
    <div style={{ position: 'relative', width: '100%', maxHeight: '52vh', aspectRatio: '16 / 9', background: '#000', margin: '0 auto' }}>
      <iframe
        key={party.youtubeId ?? undefined}
        ref={iframeRef}
        src={src}
        title={party.itemName}
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      />
      {!isHost && (
        <>
          {/* Followers can't control playback — swallow clicks to the YouTube player. */}
          <div style={{ position: 'absolute', inset: 0 }} />
          {muted && (
            <button
              onClick={() => cmd({ action: 'unmute' })}
              style={{ position: 'absolute', bottom: 12, right: 12, zIndex: 2, padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
            >
              🔊 Unmute
            </button>
          )}
        </>
      )}
    </div>
  );
}
