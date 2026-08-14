import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import type { MutableRefObject } from 'react';
import { Avatar } from '../components/Avatar';
import { CallView } from '../components/CallView';
import { MessageList } from '../components/MessageList';
import type { AudioControls } from '../lib/audioPrefs';
import type { Message, User, WatchPartyState } from '../lib/types';
import type { ScreenShare, VoiceParticipant } from '../lib/useVoice';
import '../index.css';
import './showcase.css';

declare global {
  interface Window {
    __openChatShowcaseRoot?: ReturnType<typeof ReactDOM.createRoot>;
  }
}

type Scenario = 'public-server' | 'private-call' | 'watch-party' | 'screen-share';

const me: User = { id: 'alex', username: 'alex', displayName: 'alex', avatarUrl: null, status: 'ONLINE' };
const morgan: User = { id: 'morgan', username: 'morgan', displayName: 'Morgan', avatarUrl: null, status: 'ONLINE' };
const sky: User = { id: 'sky', username: 'sky', displayName: 'Sky', avatarUrl: null, status: 'ONLINE' };
const jordan: User = { id: 'jordan', username: 'jordan', displayName: 'Jordan', avatarUrl: null, status: 'AWAY' };

const audio: AudioControls = {
  getPrefs: () => ({ inputDeviceId: null, outputDeviceId: null, outputVolume: 100, muteSoundboard: false, screenShareBitrate: 12, screenShareFps: 30, screenShareResolution: '1440', inputMode: 'vad', pttKeybind: null }),
  setInputDevice: () => {}, setOutputDevice: () => {}, setOutputVolume: () => {}, setMuteSoundboard: () => {},
  setScreenShareBitrate: () => {}, setScreenShareFps: () => {}, setScreenShareResolution: () => {}, setInputMode: () => {}, setPttKeybind: () => {},
};

const baseParticipants: VoiceParticipant[] = [
  { identity: 'alex', name: 'alex', isMe: true, speaking: true, micOn: true },
  { identity: 'morgan', name: 'Morgan', isMe: false, speaking: false, micOn: true },
  { identity: 'sky', name: 'Sky', isMe: false, speaking: false, micOn: true },
  { identity: 'jordan', name: jordan.displayName || jordan.username, isMe: false, speaking: false, micOn: false },
];

function scenarioFromLocation(): Scenario {
  const requested = new URLSearchParams(window.location.search).get('scenario');
  return requested === 'private-call' || requested === 'watch-party' || requested === 'screen-share' ? requested : 'public-server';
}

function message(id: string, author: User, content: string, minute: number): Message {
  return {
    id, channelId: 'general', authorId: author.id, author, content,
    createdAt: `2026-08-08T18:${String(minute).padStart(2, '0')}:00.000Z`, editedAt: null, deletedAt: null,
    replyToId: null, replyTo: null, pinned: false, kind: 'USER', attachments: [], reactions: [],
  };
}

function Rail({ home = false }: { home?: boolean }) {
  return <aside className="showcase-rail" aria-label="Servers">
    <button className={home ? 'is-selected' : ''}><img src="/logo.png" alt="OpenChat" /></button>
    <span />
    <button className={!home ? 'is-selected' : ''}>OC<i>3</i></button>
    <button>DEV<i>7</i></button>
    <button>LAB</button>
  </aside>;
}

function UserFooter() {
  return <footer className="showcase-user"><Avatar user={me} size={34} showStatus /><div><strong>alex</strong><small>Online</small></div><span>⚙</span></footer>;
}

function PublicServerScenario() {
  const [liveMessages, setLiveMessages] = useState(() => [
    message('m1', morgan, 'The 0.8.48 web build is live. Realtime delivery looks healthy from the public server.', 12),
    message('m2', sky, 'Confirmed from Firefox and the desktop client. Channel position restored correctly too.', 13),
    message('m3', me, 'Great. I am checking the OpenShare attachment and voice handoff next.', 14),
  ]);
  const [typing, setTyping] = useState('Morgan is typing…');
  const scrollCaptureRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLiveMessages((current) => current.some((item) => item.id === 'm4')
        ? current
        : [...current, message('m4', morgan, 'Upload received. The preview and shared link both render inline.', 15)]);
      setTyping('Sky is typing…');
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  return <ShowcaseShell
    rail={<Rail />}
    sidebar={<><header>OpenChat Community <span>⌄</span></header><div className="showcase-channel-list"><b>Text channels</b><button className="active"># general</button><button># development <i>3</i></button><button># media</button><b>Voice channels</b><button>◉ Lounge</button><button>◉ Dev room</button></div><UserFooter /></>}
    header={<><strong># general</strong><span className="showcase-live"><i /> Public server · realtime</span><div className="showcase-header-actions">⌕　⌖　●</div></>}
  >
    <div className="showcase-channel-banner"><span>#</span><h1>Welcome to #general</h1><p>This is the public conversation for OpenChat Community.</p></div>
    <MessageList
      messages={liveMessages} channelId="general" resumePosition={null} hasMore={false} hasNewer={false}
      loadingOlder={false} loadingNewer={false} onLoadOlder={() => {}} onLoadNewer={() => {}}
      onReadPosition={() => {}} onScrollPosition={() => {}} scrollCaptureRef={scrollCaptureRef as MutableRefObject<(() => void) | null>}
      meId={me.id} myUsername={me.username} shareBaseUrl="" mentionNames={new Set(['alex', 'morgan', 'sky'])}
      canDeleteAny={false} canPin editingId={null} onToggleReaction={() => {}} onReply={() => {}}
      onStartEdit={() => {}} onSaveEdit={() => {}} onCancelEdit={() => {}} onPin={() => {}} onDelete={() => {}}
      onPollVote={() => {}} onOpenReactionPicker={() => {}}
    />
    <div className="showcase-typing">{typing}</div>
    <div className="showcase-composer"><button>＋</button><span>Message #general</span><button>☺</button></div>
  </ShowcaseShell>;
}

function useSpeakingParticipants(seed = baseParticipants) {
  const [speaker, setSpeaker] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setSpeaker((value) => (value + 1) % 3), 1400);
    return () => window.clearInterval(timer);
  }, []);
  return seed.map((participant, index) => ({ ...participant, speaking: participant.micOn && index === speaker }));
}

function CallShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <ShowcaseShell
    rail={<Rail home={title === 'Morgan'} />}
    sidebar={<><header>{title === 'Morgan' ? 'Home' : 'OpenChat Community'}</header><div className="showcase-channel-list"><b>{title === 'Morgan' ? 'Direct messages' : 'Voice channels'}</b><button className="active">{title === 'Morgan' ? '● Morgan' : '◉ Lounge'}</button><button>{title === 'Morgan' ? '● Sky' : '◉ Dev room'}</button></div><UserFooter /></>}
    header={<><div className="showcase-call-title"><span>◉</span><div><strong>{title}</strong><small>{subtitle}</small></div></div><div className="showcase-header-actions">⌕　⚑　●</div></>}
  >{children}</ShowcaseShell>;
}

function PrivateCallScenario() {
  const participants = useSpeakingParticipants(baseParticipants.slice(0, 2));
  return <CallShell title="Morgan" subtitle="Private call · encrypted transport">
    <CallView channelName="Morgan" connected connecting={false} participants={participants} muted={false}
      onJoin={() => {}} onLeave={() => {}} onToggleMute={() => {}} party={null} meId={me.id}
      onStartWatch={() => {}} onWatchState={() => {}} onCloseWatch={() => {}} onLeaveWatch={() => {}} onOpenSoundboard={() => {}}
      screens={[]} sharing={false} audio={audio} onShareScreen={() => {}} onStopShare={() => {}} onStopScreen={() => {}} />
  </CallShell>;
}

function WatchPartyScenario() {
  const participants = useSpeakingParticipants();
  const [positionMs, setPositionMs] = useState(264000);
  useEffect(() => {
    const timer = window.setInterval(() => setPositionMs((value) => value + 1000), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const party: WatchPartyState = {
    id: 'party-1', channelId: 'lounge', hostId: me.id, hostName: 'alex', source: 'jellyfin', itemId: 'launch-film',
    youtubeId: null, itemName: 'OpenChat Release Night', positionMs, paused: false, streamUrl: null,
    posterUrl: '/showcase-watch-poster.svg',
  };
  return <CallShell title="Lounge" subtitle="Watch party · 4 viewers synchronized">
    <CallView channelName="Lounge" connected connecting={false} participants={participants} muted={false}
      onJoin={() => {}} onLeave={() => {}} onToggleMute={() => {}} party={party} meId={me.id}
      onStartWatch={() => {}} onWatchState={() => {}} onCloseWatch={() => {}} onLeaveWatch={() => {}} onOpenSoundboard={() => {}}
      screens={[]} sharing={false} audio={audio} onShareScreen={() => {}} onStopShare={() => {}} onStopScreen={() => {}} />
  </CallShell>;
}

function makeScreen(label: string, accent: string, identity: string, previewUrl: string): ScreenShare | null {
  const canvas = document.createElement('canvas');
  canvas.width = 1280; canvas.height = 720;
  const ctx = canvas.getContext('2d');
  const capture = canvas.captureStream?.bind(canvas);
  if (!ctx || !capture) return null;
  let frame = 0;
  const draw = () => {
    frame += 1;
    const gradient = ctx.createLinearGradient(0, 0, 1280, 720);
    gradient.addColorStop(0, '#111720'); gradient.addColorStop(1, '#202b39');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = accent; ctx.fillRect(0, 0, 1280, 8);
    ctx.fillStyle = '#e8eef7'; ctx.font = '700 42px system-ui'; ctx.fillText(label, 56, 78);
    ctx.fillStyle = '#6d7b8d'; ctx.font = '24px system-ui'; ctx.fillText('Live shared surface', 56, 118);
    for (let row = 0; row < 7; row += 1) {
      ctx.fillStyle = row === 2 ? accent : '#344253';
      ctx.fillRect(56, 170 + row * 62, 740 - row * 34 + Math.sin(frame / 16 + row) * 22, 18);
    }
    ctx.fillStyle = '#17202b'; ctx.fillRect(850, 155, 360, 430);
    ctx.fillStyle = accent; ctx.fillRect(880, 520 - ((frame * 2) % 240), 42, 40 + ((frame * 2) % 240));
    ctx.fillRect(946, 400, 42, 160); ctx.fillRect(1012, 330, 42, 230); ctx.fillRect(1078, 240, 42, 320);
    requestAnimationFrame(draw);
  };
  draw();
  const track = capture(30).getVideoTracks()[0];
  return { id: `screen-${identity}-${label}`, identity, name: label, isMe: identity === me.id, track, previewUrl };
}

function ScreenShareScenario() {
  const participants = useSpeakingParticipants(baseParticipants.slice(0, 3));
  const screens = useMemo(() => [
    makeScreen('Code editor', '#2fb7ff', me.id, '/showcase-code-editor.svg'),
    makeScreen('Metrics dashboard', '#14e3ba', me.id, '/showcase-metrics.svg'),
  ].filter((screen): screen is ScreenShare => !!screen), []);
  useEffect(() => () => screens.forEach((screen) => screen.track.stop()), [screens]);
  return <CallShell title="Lounge" subtitle="alex is sharing 2 windows">
    <CallView channelName="Lounge" connected connecting={false} participants={participants} muted={false}
      onJoin={() => {}} onLeave={() => {}} onToggleMute={() => {}} party={null} meId={me.id}
      onStartWatch={() => {}} onWatchState={() => {}} onCloseWatch={() => {}} onLeaveWatch={() => {}} onOpenSoundboard={() => {}}
      screens={screens} sharing audio={audio} onShareScreen={() => {}} onStopShare={() => {}} onStopScreen={() => {}} />
  </CallShell>;
}

function ShowcaseShell({ rail, sidebar, header, children }: { rail: React.ReactNode; sidebar: React.ReactNode; header: React.ReactNode; children: React.ReactNode }) {
  return <div className="showcase-app"><div className="showcase-shell"><div>{rail}</div><aside className="showcase-sidebar">{sidebar}</aside><main className="showcase-main"><header className="showcase-main-header">{header}</header><div className="showcase-main-content">{children}</div></main></div></div>;
}

function ScenarioNav({ scenario }: { scenario: Scenario }) {
  const options: Array<[Scenario, string]> = [['public-server', 'Public server'], ['private-call', 'Private call'], ['watch-party', 'Watch party'], ['screen-share', 'Screen sharing']];
  return <nav className="showcase-scenarios" aria-label="Feature scenarios">{options.map(([id, label]) => <a key={id} className={scenario === id ? 'active' : ''} href={`?scenario=${id}`}>{label}</a>)}</nav>;
}

export function FeatureShowcase() {
  const scenario = scenarioFromLocation();
  const capture = new URLSearchParams(window.location.search).has('capture');
  return <>{!capture && <ScenarioNav scenario={scenario} />}{scenario === 'public-server' ? <PublicServerScenario /> : scenario === 'private-call' ? <PrivateCallScenario /> : scenario === 'watch-party' ? <WatchPartyScenario /> : <ScreenShareScenario />}</>;
}

const root = document.getElementById('root');
if (root) {
  const showcaseRoot = window.__openChatShowcaseRoot ?? ReactDOM.createRoot(root);
  window.__openChatShowcaseRoot = showcaseRoot;
  showcaseRoot.render(<React.StrictMode><FeatureShowcase /></React.StrictMode>);
}
