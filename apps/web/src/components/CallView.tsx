import type { VoiceParticipant, } from '../lib/useVoice';
import type { WatchPartyState } from '../lib/types';
import { Avatar } from './Avatar';
import { WatchPartyPlayer } from './WatchPartyPlayer';
import { Icon } from './Icon';

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
