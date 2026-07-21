import { useEffect, useRef, useState } from 'react';
import type { VoiceParticipant, ScreenShare } from '../lib/useVoice';
import type { WatchPartyState } from '../lib/types';
import type { AudioControls } from '../lib/audioPrefs';
import { Avatar } from './Avatar';
import { WatchPartyPlayer } from './WatchPartyPlayer';
import { ScreenQualityControls } from './ScreenQualityControls';
import { Icon } from './Icon';

/** Poll a screen-share track's WebRTC stats for a live "1080p · 58fps · 7.9 Mbps" readout. */
function useScreenStats(videoRef: React.RefObject<HTMLVideoElement | null>, share: ScreenShare, enabled: boolean) {
  const [text, setText] = useState('');
  const last = useRef<{ bytes: number; ts: number } | null>(null);
  useEffect(() => {
    if (!enabled) { setText(''); last.current = null; return; }
    let alive = true;
    const tick = async () => {
      const el = videoRef.current;
      const dims = el && el.videoWidth ? `${el.videoWidth}×${el.videoHeight}` : '';
      let fps = 0;
      let mbps = 0;
      try {
        const report = await share.getStats?.();
        report?.forEach((r: any) => {
          if ((r.type === 'outbound-rtp' || r.type === 'inbound-rtp') && (r.kind === 'video' || r.mediaType === 'video')) {
            if (typeof r.framesPerSecond === 'number') fps = Math.round(r.framesPerSecond);
            const bytes = r.bytesSent ?? r.bytesReceived;
            const ts = r.timestamp;
            if (typeof bytes === 'number' && typeof ts === 'number') {
              if (last.current && ts > last.current.ts) {
                const dt = (ts - last.current.ts) / 1000;
                mbps = ((bytes - last.current.bytes) * 8) / 1e6 / dt;
              }
              last.current = { bytes, ts };
            }
          }
        });
      } catch { /* ignore */ }
      const parts: string[] = [];
      if (dims) parts.push(dims);
      if (fps) parts.push(`${fps} fps`);
      if (mbps > 0) parts.push(`${mbps.toFixed(1)} Mbps`);
      if (alive) setText(parts.join(' · '));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(t); };
  }, [enabled, share, videoRef]);
  return text;
}

const overlayBtn: React.CSSProperties = {
  padding: '4px 8px', borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff',
  cursor: 'pointer', fontSize: 12, fontWeight: 600,
};

/** Placeholder shown in place of a remote screen the viewer has chosen to hide.
 *  Not rendering the <video> lets adaptiveStream pause the incoming data. */
function HiddenScreen({ share, onShow }: { share: ScreenShare; onShow: () => void }) {
  return (
    <div style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 10, minHeight: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 }}>
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>🖥️ {share.name}'s screen — hidden</div>
      <button onClick={onShow}
        style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
        View stream
      </button>
    </div>
  );
}

/** Renders one live screen-share track: click/expand to fullscreen, pop-out (PiP),
 *  optional live stats overlay, an in-player quality panel (own share), and
 *  stop (own) / hide (remote) controls. */
function ScreenTile({ share, showStats, audio, onStop, onHide, onReshare }: {
  share: ScreenShare;
  showStats: boolean;
  audio?: AudioControls;
  onStop?: (id: string) => void;
  onHide?: () => void;
  onReshare?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const stats = useScreenStats(ref, share, showStats);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pipSupported = typeof document !== 'undefined' && (document as any).pictureInPictureEnabled;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = new MediaStream([share.track]);
    el.play?.().catch(() => {});
    return () => { el.srcObject = null; };
  }, [share.track]);
  const expand = () => ref.current?.requestFullscreen?.().catch(() => {});
  const popOut = () => (ref.current as any)?.requestPictureInPicture?.().catch(() => {});
  return (
    <div style={{ position: 'relative', background: '#000', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={share.isMe}
        onClick={expand}
        style={{ width: '100%', height: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block', cursor: 'zoom-in' }}
      />
      <div style={{ position: 'absolute', left: 8, bottom: 8, padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, fontWeight: 600 }}>
        🖥️ {share.isMe ? 'You' : share.name}
      </div>
      {showStats && stats && (
        <div style={{ position: 'absolute', right: 8, bottom: 8, padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.6)', color: '#7dd3fc', fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {stats}
        </div>
      )}
      <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 4 }}>
        <button onClick={(e) => { e.stopPropagation(); expand(); }} title="Fullscreen" style={overlayBtn}>⛶</button>
        {pipSupported && <button onClick={(e) => { e.stopPropagation(); popOut(); }} title="Pop out (Picture-in-Picture)" style={overlayBtn}>⧉</button>}
        {share.isMe && audio && (
          <button onClick={(e) => { e.stopPropagation(); setSettingsOpen((v) => !v); }} title="Stream settings"
            style={{ ...overlayBtn, background: settingsOpen ? 'var(--accent)' : 'rgba(0,0,0,0.55)', color: settingsOpen ? 'var(--accent-text)' : '#fff' }}>⚙</button>
        )}
      </div>
      {share.isMe && onStop && (
        <button
          onClick={(e) => { e.stopPropagation(); onStop(share.id); }}
          title="Stop sharing this screen"
          style={{ ...overlayBtn, position: 'absolute', top: 8, right: 8, background: 'var(--danger)' }}>
          ⏹ Stop
        </button>
      )}
      {!share.isMe && onHide && (
        <button
          onClick={(e) => { e.stopPropagation(); onHide(); }}
          title="Hide this stream"
          style={{ ...overlayBtn, position: 'absolute', top: 8, right: 8 }}>
          🙈 Hide
        </button>
      )}
      {settingsOpen && audio && (
        <div onClick={(e) => e.stopPropagation()}
          style={{ position: 'absolute', top: 44, left: 8, width: 280, maxHeight: 'calc(100% - 56px)', overflowY: 'auto', zIndex: 6,
            background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, color: 'var(--text-strong)', fontSize: 14 }}>Stream Settings</span>
            <button onClick={() => setSettingsOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>
          <ScreenQualityControls audio={audio} compact />
          {onReshare && (
            <button onClick={() => { setSettingsOpen(false); onReshare(); }}
              style={{ width: '100%', marginTop: 12, padding: '8px 0', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              Re-share to apply now
            </button>
          )}
          <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--muted-2)' }}>Changes apply to your next share, or re-share to apply immediately (re-picks the source).</p>
        </div>
      )}
    </div>
  );
}

export function CallView({
  channelName,
  connected,
  connecting,
  status,
  participants,
  muted,
  onJoin,
  onLeave,
  onToggleMute,
  party,
  meId,
  onStartWatch,
  onWatchState,
  onStopWatch,
  onOpenSoundboard,
  screens,
  sharing,
  audio,
  onShareScreen,
  onStopShare,
  onStopScreen,
}: {
  channelName: string;
  connected: boolean;
  connecting: boolean;
  status?: string;
  participants: VoiceParticipant[];
  muted: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
  party: WatchPartyState | null;
  meId: string;
  onStartWatch: () => void;
  onWatchState: (positionMs: number, paused: boolean) => void;
  onStopWatch: () => void;
  onOpenSoundboard: () => void;
  screens: ScreenShare[];
  sharing: boolean;
  audio: AudioControls;
  onShareScreen: () => void;
  onStopShare: () => void;
  onStopScreen: (id: string) => void;
}) {
  const myScreenCount = screens.filter((s) => s.isMe).length;
  const streamingIds = new Set(screens.map((s) => s.identity));
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showStats, setShowStats] = useState(false);
  const toggleHidden = (id: string) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const theater = connected && screens.length > 0;

  const btn: React.CSSProperties = { padding: '10px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 };

  const renderParticipants = (compact: boolean) => participants.length === 0 ? null : (
    <div style={{ display: 'flex', gap: compact ? 12 : 20, flexWrap: 'wrap', justifyContent: 'center' }}>
      {participants.map((sp) => {
        const speaking = sp.speaking && sp.micOn;
        const nameColor = !sp.micOn ? '#a02c2c' : speaking ? '#ffffff' : 'var(--text)';
        const streaming = streamingIds.has(sp.identity);
        const size = compact ? 34 : 64;
        return (
          <div key={sp.identity} style={{ display: 'flex', flexDirection: compact ? 'row' : 'column', alignItems: 'center', gap: 6, width: compact ? 'auto' : 96 }}>
            <div style={{ position: 'relative', borderRadius: '50%', padding: 3, border: `3px solid ${speaking ? 'var(--success)' : 'transparent'}`, transition: 'border-color 0.12s' }}>
              <Avatar user={{ username: sp.name, displayName: sp.name, avatarUrl: null }} size={size} />
              {streaming && (
                <span title="Sharing their screen"
                  style={{ position: 'absolute', bottom: -3, left: '50%', transform: 'translateX(-50%)', background: '#e02424', color: '#fff', fontSize: 9, fontWeight: 800, letterSpacing: 0.5, padding: '1px 5px', borderRadius: 8, border: '2px solid var(--panel)', whiteSpace: 'nowrap' }}>
                  ● LIVE
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: nameColor, fontWeight: speaking ? 700 : 400, transition: 'color 0.12s', display: 'flex', alignItems: 'center', gap: 4, maxWidth: compact ? 120 : 96, overflow: 'hidden' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sp.isMe ? 'You' : sp.name}</span>
              {!sp.micOn && <Icon name="mute" size={14} alt="Muted" />}
            </div>
          </div>
        );
      })}
    </div>
  );

  const screensGrid = (
    <div style={{ width: '100%', minHeight: 0, flex: theater ? 1 : undefined, display: 'grid', gridTemplateColumns: screens.length > 1 ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr', gap: 12, alignContent: 'center' }}>
      {screens.map((sh) => (
        !sh.isMe && hidden.has(sh.id)
          ? <HiddenScreen key={sh.id} share={sh} onShow={() => toggleHidden(sh.id)} />
          : <ScreenTile key={sh.id} share={sh} showStats={showStats}
              audio={sh.isMe ? audio : undefined}
              onStop={onStopScreen}
              onHide={() => toggleHidden(sh.id)}
              onReshare={sh.isMe ? () => { onStopScreen(sh.id); onShareScreen(); } : undefined} />
      ))}
    </div>
  );

  const controls = (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
      <button onClick={onToggleMute} style={{ ...btn, background: muted ? 'var(--danger)' : 'var(--input-bg)', color: muted ? '#fff' : 'var(--text)' }}>
        <Icon name={muted ? 'mute' : 'unmute'} size={17} /> {muted ? 'Unmute' : 'Mute'}
      </button>
      <button onClick={onOpenSoundboard} style={{ ...btn, background: 'var(--input-bg)', color: 'var(--text)' }}>🔊 Soundboard</button>
      <button onClick={onShareScreen} title="Share an app window, a browser tab, or an entire monitor"
        style={{ ...btn, background: 'var(--input-bg)', color: 'var(--text)' }}>
        🖥️ {sharing ? 'Share Another' : 'Share Screen'}
      </button>
      {sharing && (
        <button onClick={onStopShare} style={{ ...btn, background: 'var(--danger)', color: '#fff' }}>
          {myScreenCount > 1 ? 'Stop All Sharing' : 'Stop Sharing'}
        </button>
      )}
      {screens.length > 0 && (
        <button onClick={() => setShowStats((v) => !v)} title="Toggle stream stats"
          style={{ ...btn, background: showStats ? 'var(--accent)' : 'var(--input-bg)', color: showStats ? 'var(--accent-text)' : 'var(--text)' }}>
          📊 Stats
        </button>
      )}
      {!party && (
        <button onClick={onStartWatch} style={{ ...btn, background: 'var(--accent)', color: 'var(--accent-text)' }}>
          <Icon name="watchparty" size={17} /> Start Watch Party
        </button>
      )}
      <button onClick={onLeave} style={{ ...btn, background: 'var(--danger)', color: '#fff' }}>
        <Icon name="disconnect" size={17} /> Disconnect
      </button>
    </div>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {party && (
        <WatchPartyPlayer party={party} isHost={party.hostId === meId} onState={onWatchState} onStop={onStopWatch} />
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: theater ? 'hidden' : 'auto', display: 'flex', flexDirection: 'column', alignItems: theater ? 'stretch' : 'center', justifyContent: theater ? 'flex-start' : 'center', padding: theater ? 16 : 24, gap: theater ? 14 : 20 }}>
        <div style={{ fontSize: theater ? 16 : 22, fontWeight: 700, color: 'var(--text-strong)', textAlign: 'center', flexShrink: 0 }}>🔊 {channelName}</div>

        {connected ? (
          theater ? (
            <>
              {screensGrid}
              {renderParticipants(true)}
              {controls}
            </>
          ) : (
            <>
              {renderParticipants(false)}
              {controls}
            </>
          )
        ) : (
          <button onClick={onJoin} disabled={connecting}
            style={{ padding: '12px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15, background: 'var(--success)', color: '#fff' }}>
            {connecting ? (status ? `Connecting… (${status})` : 'Connecting…') : 'Join Voice'}
          </button>
        )}
      </div>
    </div>
  );
}
