import { useEffect, useRef } from 'react';
import type { VoiceParticipant, ScreenShare } from '../lib/useVoice';
import type { WatchPartyState } from '../lib/types';
import { Avatar } from './Avatar';
import { WatchPartyPlayer } from './WatchPartyPlayer';
import { Icon } from './Icon';

/** Renders one live screen-share track into a <video>, with click-to-fullscreen. */
function ScreenTile({ share }: { share: ScreenShare }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = new MediaStream([share.track]);
    el.play?.().catch(() => {});
    return () => { el.srcObject = null; };
  }, [share.track]);
  return (
    <div style={{ position: 'relative', background: '#000', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={share.isMe}
        onClick={() => ref.current?.requestFullscreen?.().catch(() => {})}
        style={{ width: '100%', height: '100%', maxHeight: '46vh', objectFit: 'contain', display: 'block', cursor: 'zoom-in' }}
      />
      <div style={{ position: 'absolute', left: 8, bottom: 8, padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, fontWeight: 600 }}>
        🖥️ {share.isMe ? 'You' : share.name}
      </div>
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
  onShareScreen,
  onStopShare,
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
  onShareScreen: () => void;
  onStopShare: () => void;
}) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {party && (
        <WatchPartyPlayer
          party={party}
          isHost={party.hostId === meId}
          onState={onWatchState}
          onStop={onStopWatch}
        />
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-strong)' }}>🔊 {channelName}</div>

        {connected ? (
          <>
            {screens.length > 0 && (
              <div style={{ width: '100%', display: 'grid', gridTemplateColumns: screens.length > 1 ? 'repeat(auto-fit, minmax(280px, 1fr))' : '1fr', gap: 12 }}>
                {screens.map((sh) => <ScreenTile key={sh.id} share={sh} />)}
              </div>
            )}
            {participants.length > 0 && (
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
                {participants.map((sp) => {
                  const speaking = sp.speaking && sp.micOn;
                  const nameColor = !sp.micOn ? '#a02c2c' : speaking ? '#ffffff' : 'var(--text)';
                  return (
                    <div key={sp.identity} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 96 }}>
                      <div style={{ borderRadius: '50%', padding: 3, border: `3px solid ${speaking ? 'var(--success)' : 'transparent'}`, transition: 'border-color 0.12s' }}>
                        <Avatar user={{ username: sp.name, displayName: sp.name, avatarUrl: null }} size={64} />
                      </div>
                      <div style={{ fontSize: 13, color: nameColor, fontWeight: speaking ? 700 : 400, transition: 'color 0.12s', display: 'flex', alignItems: 'center', gap: 4, maxWidth: 96, overflow: 'hidden' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sp.isMe ? 'You' : sp.name}</span>
                        {!sp.micOn && <Icon name="mute" size={14} alt="Muted" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button onClick={onToggleMute}
                style={{ padding: '10px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8, background: muted ? 'var(--danger)' : 'var(--input-bg)', color: muted ? '#fff' : 'var(--text)' }}>
                <Icon name={muted ? 'mute' : 'unmute'} size={17} /> {muted ? 'Unmute' : 'Mute'}
              </button>
              <button onClick={onOpenSoundboard}
                style={{ padding: '10px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, background: 'var(--input-bg)', color: 'var(--text)' }}>
                🔊 Soundboard
              </button>
              <button onClick={onShareScreen} title="Share an app window, a browser tab, or an entire monitor"
                style={{ padding: '10px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, background: 'var(--input-bg)', color: 'var(--text)' }}>
                🖥️ {sharing ? 'Share Another' : 'Share Screen'}
              </button>
              {sharing && (
                <button onClick={onStopShare}
                  style={{ padding: '10px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, background: 'var(--danger)', color: '#fff' }}>
                  Stop Sharing
                </button>
              )}
              {!party && (
                <button onClick={onStartWatch}
                  style={{ padding: '10px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--accent)', color: 'var(--accent-text)' }}>
                  <Icon name="watchparty" size={17} /> Start Watch Party
                </button>
              )}
              <button onClick={onLeave}
                style={{ padding: '10px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--danger)', color: '#fff' }}>
                <Icon name="disconnect" size={17} /> Disconnect
              </button>
            </div>
          </>
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
