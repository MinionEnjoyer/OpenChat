import { Fragment, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import type { User, Server, Channel, Message, Attachment as Att, DmChannel, ServerMemberInfo } from './lib/types';
import * as api from './lib/api';
import { listDms } from './lib/social';
import { getConfig } from './lib/share';
import { getTheme, applyTheme, type Theme } from './lib/theme';
import { saveView, loadView } from './lib/lastView';
import { AttachmentPicker } from './components/AttachmentPicker';
import { Attachment } from './components/Attachment';
import { Avatar } from './components/Avatar';
import { FriendsView } from './components/FriendsView';
import { ServerActions } from './components/ServerActions';
import { UserPanel } from './components/UserPanel';
import { SettingsModal } from './components/SettingsModal';
import { ServerSettingsModal } from './components/ServerSettingsModal';
import { NotificationHub } from './components/NotificationHub';
import { MemberListPanel } from './components/MemberListPanel';
import { CallView } from './components/CallView';
import { CreateChannelModal } from './components/CreateChannelModal';
import { WatchPartyPicker } from './components/WatchPartyPicker';
import { EmojiPicker } from './components/EmojiPicker';
import { MessageEmbeds, isSingleEmbedUrl, setShareHost } from './components/MessageEmbeds';
import { Icon } from './components/Icon';
import { GifPicker } from './components/GifPicker';
import { PollView } from './components/PollView';
import { PollModal } from './components/PollModal';
import { Soundboard } from './components/Soundboard';
import type { ServerLayout, ServerFolder } from './lib/types';
import type { WatchPartyState, LibraryItem } from './lib/types';
import { useVoice } from './lib/useVoice';
import { canManageServer, has, Permission } from './lib/permissions';

interface AppState {
  user: User | null;
  shareBaseUrl: string;
  servers: Server[];
  channelsByServer: Record<string, Channel[]>;
  messagesByChannel: Record<string, Message[]>;
  dms: DmChannel[];
  membersByServer: Record<string, ServerMemberInfo[]>;
  presenceById: Record<string, string>;
  unreadByChannel: Record<string, number>;
  notifyTick: number;
  activeServerId: string | null;
  activeChannelId: string | null;
  set: (p: Partial<AppState>) => void;
  setChannels: (serverId: string, channels: Channel[]) => void;
  setMessages: (channelId: string, messages: Message[]) => void;
  addMessage: (m: Message) => void;
  updateMessage: (m: Message) => void;
  deleteMessage: (channelId: string, id: string) => void;
  replacePending: (channelId: string, nonce: string, real: Message) => void;
  markFailed: (channelId: string, id: string) => void;
  setPresence: (userId: string, status: string) => void;
  bumpUnread: (channelId: string) => void;
  clearUnread: (channelId: string) => void;
}

const useStore = create<AppState>((set) => ({
  user: null,
  shareBaseUrl: '',
  servers: [],
  channelsByServer: {},
  messagesByChannel: {},
  dms: [],
  membersByServer: {},
  presenceById: {},
  unreadByChannel: {},
  notifyTick: 0,
  activeServerId: null,
  activeChannelId: null,
  set: (p) => set(p),
  setChannels: (serverId, channels) =>
    set((s) => ({ channelsByServer: { ...s.channelsByServer, [serverId]: channels } })),
  setMessages: (channelId, messages) =>
    set((s) => ({ messagesByChannel: { ...s.messagesByChannel, [channelId]: messages } })),
  addMessage: (m) =>
    set((s) => {
      const cur = s.messagesByChannel[m.channelId] || [];
      if (cur.some((x) => x.id === m.id)) return s;
      return { messagesByChannel: { ...s.messagesByChannel, [m.channelId]: [...cur, m] } };
    }),
  updateMessage: (m) =>
    set((s) => ({
      messagesByChannel: {
        ...s.messagesByChannel,
        [m.channelId]: (s.messagesByChannel[m.channelId] || []).map((x) => (x.id === m.id ? m : x)),
      },
    })),
  deleteMessage: (channelId, id) =>
    set((s) => ({
      messagesByChannel: {
        ...s.messagesByChannel,
        [channelId]: (s.messagesByChannel[channelId] || []).filter((x) => x.id !== id),
      },
    })),
  replacePending: (channelId, nonce, real) =>
    set((s) => {
      const cur = s.messagesByChannel[channelId] || [];
      // drop the optimistic temp for this nonce, and any dup of the real, then append the real
      const filtered = cur.filter((x) => x.nonce !== nonce && x.id !== real.id);
      return { messagesByChannel: { ...s.messagesByChannel, [channelId]: [...filtered, real] } };
    }),
  markFailed: (channelId, id) =>
    set((s) => ({
      messagesByChannel: {
        ...s.messagesByChannel,
        [channelId]: (s.messagesByChannel[channelId] || []).map((x) => (x.id === id ? { ...x, pending: false, failed: true } : x)),
      },
    })),
  setPresence: (userId, status) =>
    set((s) => ({ presenceById: { ...s.presenceById, [userId]: status } })),
  bumpUnread: (channelId) =>
    set((s) => ({ unreadByChannel: { ...s.unreadByChannel, [channelId]: (s.unreadByChannel[channelId] || 0) + 1 } })),
  clearUnread: (channelId) =>
    set((s) => {
      if (!s.unreadByChannel[channelId]) return s;
      const next = { ...s.unreadByChannel };
      delete next[channelId];
      return { unreadByChannel: next };
    }),
}));

export default function App() {
  const s = useStore();
  const wsRef = useRef<WebSocket | null>(null);
  const [homeView, setHomeView] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [dmTitle, setDmTitle] = useState('');
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const voice = useVoice();
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const ringTimer = useRef<number | undefined>(undefined);
  const [partyByChannel, setPartyByChannel] = useState<Record<string, WatchPartyState | null>>({});
  const [watchPickerOpen, setWatchPickerOpen] = useState(false);
  // participants per voice channel (server-tracked), for the nested sidebar lists
  const [voiceMembers, setVoiceMembers] = useState<Record<string, { id: string; username: string; displayName: string | null; avatarUrl: string | null }[]>>({});
  // channelId -> { userId -> expiresAt(ms) }
  const [typing, setTyping] = useState<Record<string, Record<string, number>>>({});
  const [replyingTo, setReplyingTo] = useState<{ id: string; authorName: string; content: string } | null>(null);
  // Only one header dropdown (pins / notifications) is open at a time.
  const [openPanel, setOpenPanel] = useState<'pins' | 'notify' | null>(null);
  const pinsOpen = openPanel === 'pins';
  const [pins, setPins] = useState<Message[]>([]);
  const [incomingCall, setIncomingCall] = useState<{ channelId: string; callerId: string; callerName: string; callerAvatar: string | null } | null>(null);
  const [soundboardOpen, setSoundboardOpen] = useState(false);
  const [reactPickerFor, setReactPickerFor] = useState<string | null>(null);
  const [reactPickerAnchor, setReactPickerAnchor] = useState<{ x: number; y: number } | null>(null);
  const [draggingChannelId, setDraggingChannelId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; serverId?: string; folderId?: string } | null>(null);
  // Server-rail drag/drop: dragKey is a serverId or "f:<folderId>"; dropHint highlights the active target.
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  function showToast(msg: string) { setToast(msg); window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2800); }

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    (async () => {
      try {
        const user = await api.getMe();
        useStore.getState().set({ user });
        const [cfg, servers, dms] = await Promise.all([
          getConfig().catch(() => ({ shareBaseUrl: '', jellyfinUrl: '' })),
          api.listServers().catch(() => [] as Server[]),
          listDms().catch(() => [] as DmChannel[]),
        ]);
        useStore.getState().set({ shareBaseUrl: cfg.shareBaseUrl, servers, dms });
        setShareHost(cfg.shareBaseUrl); // configure Share embed detection for this deployment

        // Restore the last-viewed location so a refresh doesn't dump the user back Home.
        const saved = loadView();
        if (saved?.type === 'channel' && servers.some((sv) => sv.id === saved.serverId)) {
          await selectServer(saved.serverId);
          const chans = useStore.getState().channelsByServer[saved.serverId] || [];
          if (chans.some((c) => c.id === saved.channelId)) selectChannel(saved.channelId);
        } else if (saved?.type === 'dm' && dms.some((d) => d.id === saved.channelId)) {
          const dm = dms.find((d) => d.id === saved.channelId)!;
          const title = dm.recipients.filter((u) => u.id !== user.id).map((u) => u.displayName || u.username).join(', ') || 'Direct Message';
          openDm(dm.id, title);
        }
      } catch (e: any) {
        if (e?.status === 401) window.location.href = '/api/auth/login';
        else console.error('init failed', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!s.user) return;
    let ws: WebSocket;
    (async () => {
      const { ticket } = await api.getWsTicket();
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${window.location.host}/ws?ticket=${ticket}`);
      wsRef.current = ws;
      ws.onopen = () => {
        const st = useStore.getState();
        const status = st.user?.status && st.user.status !== 'OFFLINE' ? st.user.status : 'ONLINE';
        ws.send(JSON.stringify({ op: 'presence.update', d: { status } }));
        // subscribe to DM channels so we get their messages (for unread + live delivery)
        for (const dm of st.dms) ws.send(JSON.stringify({ op: 'subscribe', d: { channelId: dm.id } }));
      };
      ws.onmessage = (ev) => {
        const { op, d } = JSON.parse(ev.data);
        const st = useStore.getState();
        if (op === 'message.created') {
          if (d.nonce) st.replacePending(d.message.channelId, d.nonce, d.message);
          else st.addMessage(d.message);
          if (d.message.channelId !== st.activeChannelId && d.message.authorId !== st.user?.id) {
            st.bumpUnread(d.message.channelId);
          }
          // Bubble the DM to the top of the list on new activity.
          if (st.dms.some((dm) => dm.id === d.message.channelId)) {
            st.set({ dms: st.dms.map((dm) => (dm.id === d.message.channelId ? { ...dm, lastMessageAt: d.message.createdAt } : dm)) });
          }
        } else if (op === 'message.updated') st.updateMessage(d.message);
        else if (op === 'message.deleted') st.deleteMessage(d.channelId, d.id);
        else if (op === 'watchparty.sync') setPartyByChannel((prev) => ({ ...prev, [d.channelId]: d.state }));
        else if (op === 'notify') useStore.getState().set({ notifyTick: useStore.getState().notifyTick + 1 });
        else if (op === 'mention') {
          if (d.channelId !== st.activeChannelId) st.bumpUnread(d.channelId);
          showToast(`💬 ${d.authorName} mentioned you in #${d.channelName}`);
        }
        else if (op === 'call.ring') {
          // Ignore if we're already in this call; otherwise ring for ~30s.
          if (voiceRef.current?.channelId !== d.channelId) {
            setIncomingCall({ channelId: d.channelId, callerId: d.callerId, callerName: d.callerName, callerAvatar: d.callerAvatar });
            if (ringTimer.current) window.clearTimeout(ringTimer.current);
            ringTimer.current = window.setTimeout(() => setIncomingCall(null), 30000);
          }
        }
        else if (op === 'presence') st.setPresence(d.userId, d.status);
        else if (op === 'typing' && d.userId !== st.user?.id) {
          setTyping((prev) => ({ ...prev, [d.channelId]: { ...(prev[d.channelId] || {}), [d.userId]: Date.now() + 5000 } }));
        }
      };
    })();
    return () => ws?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.user?.id]);

  // Keep DM subscriptions current as the conversation list loads/changes.
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    for (const dm of s.dms) ws.send(JSON.stringify({ op: 'subscribe', d: { channelId: dm.id } }));
  }, [s.dms]);

  // Keep the member panel fresh: on any notify + periodically while a server is open.
  useEffect(() => {
    if (!s.activeServerId) return;
    refreshActiveMembers();
    const t = setInterval(refreshActiveMembers, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.activeServerId, s.notifyTick]);

  // Expire stale typing indicators.
  useEffect(() => {
    const t = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        let changed = false;
        const next: Record<string, Record<string, number>> = {};
        for (const [ch, users] of Object.entries(prev)) {
          const keep: Record<string, number> = {};
          for (const [uid, exp] of Object.entries(users)) {
            if (exp > now) keep[uid] = exp; else changed = true;
          }
          if (Object.keys(keep).length) next[ch] = keep;
        }
        return changed ? next : prev;
      });
    }, 2000);
    return () => clearInterval(t);
  }, []);

  // Poll who's in each voice channel of the active server (for the nested sidebar lists).
  useEffect(() => {
    const serverId = s.activeServerId;
    if (!serverId) return;
    const voiceChs = (s.channelsByServer[serverId] || []).filter((c) => c.type === 'VOICE');
    if (voiceChs.length === 0) return;
    let cancelled = false;
    const poll = async () => {
      const entries = await Promise.all(
        voiceChs.map(async (c) => {
          try { return [c.id, await api.voiceParticipants(c.id)] as const; }
          catch { return [c.id, [] as any[]] as const; }
        }),
      );
      if (!cancelled) setVoiceMembers((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    };
    poll();
    const t = setInterval(poll, 8000);
    return () => { cancelled = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.activeServerId, s.channelsByServer, voice.participants.length, voice.channelId]);

  function changeTheme(t: Theme) {
    setThemeState(t);
  }

  async function refreshServers() {
    const servers = await api.listServers();
    useStore.getState().set({ servers });
  }

  function refreshActiveMembers() {
    const sid = useStore.getState().activeServerId;
    if (!sid) return;
    api.listMembers(sid)
      .then((ms) => useStore.getState().set({ membersByServer: { ...useStore.getState().membersByServer, [sid]: ms } }))
      .catch(() => {});
  }

  // ---- server folders (per-user layout) ----
  function getLayout(): ServerLayout {
    return (s.user?.serverLayout as ServerLayout) || { folders: [] };
  }
  function saveLayout(next: ServerLayout) {
    useStore.getState().set({ user: { ...s.user!, serverLayout: next } });
    api.updateServerLayout(next).catch(() => {});
  }
  function newFolder(serverId: string) {
    const name = window.prompt('Folder name:');
    if (!name) return;
    const l = getLayout();
    const cleaned = l.folders.map((f) => ({ ...f, serverIds: f.serverIds.filter((x) => x !== serverId) }));
    saveLayout({ folders: [...cleaned, { id: crypto.randomUUID(), name, color: 0, serverIds: [serverId], collapsed: false }] });
  }
  function moveToFolder(serverId: string, folderId: string) {
    const l = getLayout();
    saveLayout({ folders: l.folders.map((f) => f.id === folderId
      ? { ...f, serverIds: [...f.serverIds.filter((x) => x !== serverId), serverId] }
      : { ...f, serverIds: f.serverIds.filter((x) => x !== serverId) }) });
  }
  function removeFromFolders(serverId: string) {
    const l = getLayout();
    saveLayout({ folders: l.folders.map((f) => ({ ...f, serverIds: f.serverIds.filter((x) => x !== serverId) })).filter((f) => f.serverIds.length > 0) });
  }
  function toggleFolder(folderId: string) {
    saveLayout({ folders: getLayout().folders.map((f) => (f.id === folderId ? { ...f, collapsed: !f.collapsed } : f)) });
  }
  function renameFolder(folderId: string) {
    const f = getLayout().folders.find((x) => x.id === folderId);
    const name = window.prompt('Folder name:', f?.name || '');
    if (name === null) return;
    saveLayout({ folders: getLayout().folders.map((x) => (x.id === folderId ? { ...x, name } : x)) });
  }
  function deleteFolder(folderId: string) {
    saveLayout({ folders: getLayout().folders.filter((f) => f.id !== folderId) });
  }

  // ---- server rail ordering + drag/drop ----
  // Ordered top-level rail keys derived from layout.order, dropping stale/grouped
  // entries and appending anything new (a serverId, or "f:<folderId>").
  function topLevelKeys(l: ServerLayout): string[] {
    const inFolder: Record<string, boolean> = {};
    l.folders.forEach((f) => f.serverIds.forEach((sid) => { inFolder[sid] = true; }));
    const serverIds = new Set(s.servers.map((x) => x.id));
    const nonEmpty = (f: ServerFolder) => f.serverIds.some((id) => serverIds.has(id));
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const k of l.order || []) {
      if (k.startsWith('f:')) {
        const f = l.folders.find((x) => 'f:' + x.id === k);
        if (f && nonEmpty(f) && !seen.has(k)) { keys.push(k); seen.add(k); }
      } else if (serverIds.has(k) && !inFolder[k] && !seen.has(k)) {
        keys.push(k); seen.add(k);
      }
    }
    for (const f of l.folders) { const k = 'f:' + f.id; if (nonEmpty(f) && !seen.has(k)) { keys.push(k); seen.add(k); } }
    for (const sv of s.servers) { if (!inFolder[sv.id] && !seen.has(sv.id)) { keys.push(sv.id); seen.add(sv.id); } }
    return keys;
  }

  function stripServerFromFolders(l: ServerLayout, sid: string): ServerLayout {
    return { ...l, folders: l.folders.map((f) => ({ ...f, serverIds: f.serverIds.filter((x) => x !== sid) })).filter((f) => f.serverIds.length > 0) };
  }

  // Reorder a top-level item (server or folder) before `beforeKey` (null = end).
  // A server dropped here is also pulled out of any folder it was in.
  function dropOnRail(dragK: string, beforeKey: string | null) {
    if (dragK === beforeKey) { setDragKey(null); setDropHint(null); return; }
    let l = getLayout();
    if (!dragK.startsWith('f:')) l = stripServerFromFolders(l, dragK);
    const keys = topLevelKeys(l).filter((k) => k !== dragK);
    let idx = beforeKey ? keys.indexOf(beforeKey) : keys.length;
    if (idx < 0) idx = keys.length;
    keys.splice(idx, 0, dragK);
    saveLayout({ ...l, order: keys });
  }

  // Drop server `dragId` onto server `targetId` → wrap both in a new folder.
  function mergeServers(dragId: string, targetId: string) {
    if (dragId === targetId || dragId.startsWith('f:')) return;
    let l = getLayout();
    l = stripServerFromFolders(l, dragId);
    l = stripServerFromFolders(l, targetId);
    const fid = crypto.randomUUID();
    const folder: ServerFolder = { id: fid, name: 'New Folder', color: 0, serverIds: [targetId, dragId], collapsed: false };
    const keys = topLevelKeys(l).filter((k) => k !== dragId);
    const ti = keys.indexOf(targetId);
    if (ti >= 0) keys[ti] = 'f:' + fid; else keys.push('f:' + fid);
    saveLayout({ folders: [...l.folders, folder], order: keys });
  }

  // Drop server `dragId` into `folderId` before `beforeId` (null = append / reorder within).
  function dropInFolder(folderId: string, dragId: string, beforeId: string | null) {
    if (dragId.startsWith('f:')) return;
    const l = getLayout();
    const folders = l.folders.map((f) => {
      const ids = f.serverIds.filter((x) => x !== dragId);
      if (f.id === folderId) {
        let idx = beforeId ? ids.indexOf(beforeId) : ids.length;
        if (idx < 0) idx = ids.length;
        ids.splice(idx, 0, dragId);
      }
      return { ...f, serverIds: ids };
    }).filter((f) => f.serverIds.length > 0);
    saveLayout({ ...l, folders });
  }

  function goHome() {
    setHomeView(true);
    setDmTitle('');
    useStore.getState().set({ activeChannelId: null, activeServerId: null });
    setNavOpen(false);
    saveView({ type: 'friends' });
  }

  async function selectServer(serverId: string) {
    setHomeView(false);
    useStore.getState().set({ activeServerId: serverId });
    const channels = await api.listChannels(serverId);
    useStore.getState().setChannels(serverId, channels);
    // subscribe to every channel in this server so unread counts track background channels too
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      for (const c of channels) ws.send(JSON.stringify({ op: 'subscribe', d: { channelId: c.id } }));
    }
    const first = channels.find((c) => c.type === 'TEXT') || channels[0];
    if (first) selectChannel(first.id);
    // load the member list for the right-hand online panel
    api.listMembers(serverId)
      .then((members) => useStore.getState().set({ membersByServer: { ...useStore.getState().membersByServer, [serverId]: members } }))
      .catch(() => {});
  }

  async function refreshDms() {
    try {
      useStore.getState().set({ dms: await listDms() });
    } catch { /* ignore */ }
  }

  async function selectChannel(channelId: string, title?: string) {
    useStore.getState().set({ activeChannelId: channelId });
    useStore.getState().clearUnread(channelId);
    setOpenPanel(null);
    if (title !== undefined) setDmTitle(title);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Stay subscribed to previously-opened channels so their unread counts keep updating.
      ws.send(JSON.stringify({ op: 'subscribe', d: { channelId } }));
    }
    const msgs = await api.listMessages(channelId);
    useStore.getState().setMessages(channelId, msgs.reverse());
    setNavOpen(false);
    // remember where we are for refresh-persistence
    const serverId = useStore.getState().activeServerId;
    saveView(serverId ? { type: 'channel', serverId, channelId } : { type: 'dm', channelId });
    // load any active watch party for this channel
    api.watchpartyGet(channelId).then((p) => setPartyByChannel((prev) => ({ ...prev, [channelId]: p }))).catch(() => {});
  }

  async function startWatchParty(item: LibraryItem) {
    setWatchPickerOpen(false);
    if (!s.activeChannelId) return;
    try {
      const state = await api.watchpartyStart(s.activeChannelId, item.id);
      setPartyByChannel((prev) => ({ ...prev, [state.channelId]: state }));
    } catch { alert('Could not start the watch party.'); }
  }

  function pushWatchState(channelId: string, positionMs: number, paused: boolean) {
    api.watchpartyState(channelId, positionMs, paused).catch(() => {});
  }

  async function stopWatchParty(channelId: string) {
    try { await api.watchpartyStop(channelId); } catch { /* ignore */ }
    setPartyByChannel((prev) => ({ ...prev, [channelId]: null }));
  }

  function openDm(channelId: string, title: string) {
    setHomeView(true);
    useStore.getState().set({ activeServerId: null }); // ensures this is classified as a DM
    selectChannel(channelId, title);
    refreshDms(); // make sure a brand-new conversation shows in the left DM list
  }

  async function refreshVoiceMembers(channelId: string) {
    try {
      const ps = await api.voiceParticipants(channelId);
      setVoiceMembers((prev) => ({ ...prev, [channelId]: ps }));
    } catch { /* ignore */ }
  }

  // Start / join a call in the current DM (user↔user call).
  function startCall(channelId: string) {
    voice.join(channelId).then(() => refreshVoiceMembers(channelId)).catch((e) => showToast('Call failed: ' + (e?.message || 'could not connect')));
  }

  function acceptCall(call: { channelId: string; callerName: string }) {
    if (ringTimer.current) window.clearTimeout(ringTimer.current);
    setIncomingCall(null);
    openDm(call.channelId, call.callerName);
    voice.join(call.channelId).then(() => refreshVoiceMembers(call.channelId)).catch((e) => showToast('Call failed: ' + (e?.message || 'could not connect')));
  }

  // Clicking a voice channel joins it and shows the call view — but the
  // connection persists in the useVoice hook even after you navigate to a text channel.
  function openVoiceChannel(ch: Channel) {
    setHomeView(false);
    useStore.getState().set({ activeChannelId: ch.id });
    setNavOpen(false);
    const serverId = useStore.getState().activeServerId;
    if (serverId) saveView({ type: 'channel', serverId, channelId: ch.id });
    api.watchpartyGet(ch.id).then((p) => setPartyByChannel((prev) => ({ ...prev, [ch.id]: p }))).catch(() => {});
    voice.join(ch.id).then(() => refreshVoiceMembers(ch.id)).catch((e) => showToast('Voice failed: ' + (e?.message || 'could not connect')));
  }

  async function handleDeleteMessage(channelId: string, id: string) {
    // optimistic removal; the WS message.deleted event confirms/repeats it
    useStore.getState().deleteMessage(channelId, id);
    try {
      await api.deleteMessage(id);
    } catch (e) {
      console.error('delete failed', e);
    }
  }

  async function loadPins(channelId: string) {
    try { setPins(await api.listPins(channelId)); } catch { /* ignore */ }
  }

  async function handlePin(m: Message, pinned: boolean) {
    useStore.getState().updateMessage({ ...m, pinned }); // optimistic; WS message.updated confirms
    try {
      await api.pinMessage(m.id, pinned);
      if (pinsOpen) loadPins(m.channelId);
      showToast(pinned ? '📌 Message pinned' : 'Unpinned');
    } catch (e) {
      useStore.getState().updateMessage({ ...m, pinned: !pinned });
      showToast('Could not update pin — you may lack permission.');
    }
  }

  function jumpToMessage(id: string) {
    setOpenPanel(null);
    setTimeout(() => {
      const el = document.getElementById('msg-' + id);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('msg-flash');
      void el.offsetWidth; // restart animation
      el.classList.add('msg-flash');
      setTimeout(() => el.classList.remove('msg-flash'), 1500);
    }, 30);
  }

  async function refreshChannels(serverId: string) {
    const list = await api.listChannels(serverId);
    useStore.getState().setChannels(serverId, list);
  }

  async function createChannel(serverId: string, name: string, type: 'TEXT' | 'VOICE') {
    await api.createChannel(serverId, { name, type });
    await refreshChannels(serverId);
  }

  async function removeChannel(serverId: string, channelId: string, name: string) {
    if (!window.confirm(`Delete #${name}? This removes all its messages.`)) return;
    try {
      await api.deleteChannel(serverId, channelId);
      if (useStore.getState().activeChannelId === channelId) {
        useStore.getState().set({ activeChannelId: null });
      }
      await refreshChannels(serverId);
    } catch (e) {
      alert('Could not delete channel.');
    }
  }

  // Drag-reorder channels within their type group (text stays above voice); persist new positions.
  function moveChannel(serverId: string, draggedId: string, targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    const cur = useStore.getState().channelsByServer[serverId] || [];
    const dragged = cur.find((c) => c.id === draggedId);
    const target = cur.find((c) => c.id === targetId);
    if (!dragged || !target || dragged.type !== target.type) return;
    const arr = cur.filter((c) => c.id !== draggedId);
    const to = arr.findIndex((c) => c.id === targetId);
    arr.splice(to, 0, dragged);
    const reordered = arr.map((c, i) => ({ ...c, position: i }));
    useStore.getState().setChannels(serverId, reordered);
    api.reorderChannels(serverId, reordered.map((c) => c.id)).catch(() => {});
  }

  async function handleLeaveServer(serverId: string) {
    if (!window.confirm('Leave this server?')) return;
    try {
      await api.leaveServer(serverId);
      useStore.getState().set({ servers: useStore.getState().servers.filter((x) => x.id !== serverId) });
      goHome();
    } catch (e) {
      alert('Could not leave server.');
    }
  }

  async function handlePollVote(optionId: string) {
    try {
      const updated = await api.votePollOption(optionId);
      if (updated && (updated as Message).id) useStore.getState().updateMessage(updated as Message);
    } catch (e) {
      showToast('Could not record your vote.');
    }
  }

  async function toggleReaction(messageId: string, emoji: string, mine: boolean) {
    setReactPickerFor(null);
    try {
      // Apply the server's updated message immediately (instant feedback); the WS echo re-confirms.
      const updated = mine ? await api.removeReaction(messageId, emoji) : await api.addReaction(messageId, emoji);
      if (updated && (updated as Message).id) useStore.getState().updateMessage(updated as Message);
    } catch (e) {
      console.error('reaction failed', e);
    }
  }

  async function saveEdit(messageId: string, content: string) {
    const trimmed = content.trim();
    if (!trimmed) return;
    try {
      await api.updateMessage(messageId, { content: trimmed });
    } catch (e) {
      console.error('edit failed', e);
    }
  }

  if (!s.user) return <div style={{ padding: 20, color: 'var(--muted)' }}>Loading…</div>;

  const channels = s.activeServerId ? s.channelsByServer[s.activeServerId] || [] : [];
  const messages = s.activeChannelId ? s.messagesByChannel[s.activeChannelId] || [] : [];
  const activeServer = s.servers.find((x) => x.id === s.activeServerId) || null;
  const canDeleteAny = !homeView && !!activeServer && has(activeServer.myPermissions, Permission.MANAGE_MESSAGES);
  const canManageChannels = !homeView && !!activeServer && has(activeServer.myPermissions, Permission.MANAGE_CHANNELS);
  const activeParty = s.activeChannelId ? partyByChannel[s.activeChannelId] : null;
  const textChannels = channels.filter((c) => c.type !== 'VOICE');
  const voiceChannels = channels.filter((c) => c.type === 'VOICE');
  const catLabel: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', padding: '12px 8px 4px', fontWeight: 700 };

  const renderChannel = (c: Channel) => {
    const vmembers = c.type === 'VOICE' ? (voiceMembers[c.id] || []) : [];
    const connectedHere = voice.channelId === c.id;
    return (
      <div key={c.id}>
        <div className="msg-row"
          draggable={canManageChannels}
          onDragStart={() => setDraggingChannelId(c.id)}
          onDragEnd={() => setDraggingChannelId(null)}
          onDragOver={(e) => { if (canManageChannels && draggingChannelId && draggingChannelId !== c.id) e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); if (draggingChannelId) moveChannel(activeServer!.id, draggingChannelId, c.id); setDraggingChannelId(null); }}
          onClick={() => (c.type === 'VOICE' ? openVoiceChannel(c) : selectChannel(c.id))}
          style={{ padding: '6px 8px', borderRadius: 4, cursor: 'pointer', marginBottom: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            opacity: draggingChannelId === c.id ? 0.4 : 1,
            color: c.id === s.activeChannelId ? 'var(--text-strong)' : 'var(--muted)',
            background: c.id === s.activeChannelId ? 'var(--hover)' : 'transparent' }}>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontWeight: (s.unreadByChannel[c.id] && c.id !== s.activeChannelId) ? 700 : 400,
            color: (s.unreadByChannel[c.id] && c.id !== s.activeChannelId) ? 'var(--text-strong)' : undefined }}>
            {c.type === 'VOICE' ? '🔊' : '#'} {c.name}
            {connectedHere && <span title="Connected" style={{ color: 'var(--success)', marginLeft: 6, fontSize: 10 }}>●</span>}
          </span>
          {c.type === 'TEXT' && !!s.unreadByChannel[c.id] && c.id !== s.activeChannelId && <UnreadBadge n={s.unreadByChannel[c.id]} />}
          {canManageChannels && (
            <button className="msg-del" title="Delete channel"
              onClick={(e) => { e.stopPropagation(); removeChannel(activeServer!.id, c.id, c.name); }}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, flexShrink: 0, marginLeft: 4 }}>✕</button>
          )}
        </div>
        {vmembers.map((u) => (
          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px 2px 26px' }}>
            <Avatar user={u} size={20} />
            <span style={{ fontSize: 13, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.displayName || u.username}</span>
          </div>
        ))}
      </div>
    );
  };
  const isServerOwner = !!activeServer && activeServer.ownerId === s.user.id;

  // Right-hand member/online panel: server members when in a server, DM recipients when in a DM.
  const dmChannel = homeView && s.activeChannelId ? s.dms.find((d) => d.id === s.activeChannelId) : null;
  // Pinning: server channels need MANAGE_MESSAGES; DM participants may always pin.
  const canPin = canDeleteAny || !!dmChannel;
  const rightPanelUsers = !homeView && activeServer
    ? (s.membersByServer[activeServer.id] || []).map((m) => m.user)
    : dmChannel
      ? dmChannel.recipients.filter((u) => u.id !== s.user!.id)
      : [];
  const showRightPanel = (!homeView && !!activeServer) || !!dmChannel;
  const voiceChName = voice.channelId
    ? (Object.values(s.channelsByServer).flat().find((c) => c.id === voice.channelId)?.name
        || (() => {
          const dm = s.dms.find((d) => d.id === voice.channelId);
          if (dm) { const o = dm.recipients.filter((u) => u.id !== s.user?.id); return o.map((u) => u.displayName || u.username).join(', ') || 'Call'; }
          return 'Voice';
        })())
    : null;

  // @-mention candidates for the current conversation (server members or DM participants),
  // plus @everyone/@here when the user is allowed to ping them.
  const canMentionEveryone = !homeView && !!activeServer && has(activeServer.myPermissions, Permission.MENTION_EVERYONE);
  const specialMentions: MentionUser[] = canMentionEveryone
    ? [
        { id: '__everyone', username: 'everyone', displayName: 'everyone — notify all members', avatarUrl: null },
        { id: '__here', username: 'here', displayName: 'here — notify online members', avatarUrl: null },
      ]
    : [];
  const mentionCandidates: MentionUser[] = [
    ...specialMentions,
    ...(!homeView && activeServer
      ? (s.membersByServer[activeServer.id] || []).map((m) => m.user)
      : dmChannel ? [...dmChannel.recipients, s.user] : []),
  ];
  const mentionNames = new Set(mentionCandidates.map((c) => c.username.toLowerCase()));

  const renderContent = (text: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    // Match a URL or an @mention; render URLs as links, valid mentions as highlights.
    const re = /(https?:\/\/[^\s<]+)|@([\w.-]+)/g;
    let last = 0; let key = 0; let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[1]) {
        // URL — trim trailing punctuation back out of the link.
        let url = m[1];
        const trail = url.match(/[.,!?;:)\]}'"]+$/)?.[0] ?? '';
        if (trail) url = url.slice(0, url.length - trail.length);
        if (m.index > last) parts.push(text.slice(last, m.index));
        parts.push(
          <a key={key++} href={url} target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--accent)', textDecoration: 'underline', wordBreak: 'break-all' }}>
            {url}
          </a>,
        );
        if (trail) parts.push(trail);
        last = m.index + m[0].length;
      } else {
        const uname = m[2].toLowerCase();
        if (!(mentionNames.has(uname) || uname === 'everyone' || uname === 'here')) continue;
        if (m.index > last) parts.push(text.slice(last, m.index));
        const self = uname === (s.user?.username || '').toLowerCase() || uname === 'everyone' || uname === 'here';
        parts.push(
          <span key={key++} style={{ background: self ? 'var(--accent)' : 'var(--hover)', color: self ? 'var(--accent-text)' : 'var(--accent)', borderRadius: 4, padding: '0 3px', fontWeight: 600 }}>
            @{m[2]}
          </span>,
        );
        last = m.index + m[0].length;
      }
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts.length ? parts : text;
  };

  // apply live presence over stored status
  const withPresence = <T extends { id: string; status?: string }>(u: T): T =>
    ({ ...u, status: s.presenceById[u.id] ?? u.status });

  // resolve a display name for a userId (for typing indicators)
  const nameById: Record<string, string> = {};
  for (const m of (activeServer ? s.membersByServer[activeServer.id] || [] : [])) nameById[m.user.id] = m.user.displayName || m.user.username;
  for (const r of (dmChannel ? dmChannel.recipients : [])) nameById[r.id] = r.displayName || r.username;
  for (const msg of messages) if (msg.author) nameById[msg.author.id] = msg.author.displayName || msg.author.username;

  const nowMs = Date.now();
  const typingUsers = s.activeChannelId
    ? Object.entries(typing[s.activeChannelId] || {}).filter(([uid, exp]) => exp > nowMs && uid !== s.user!.id).map(([uid]) => nameById[uid] || 'Someone')
    : [];
  const typingText = typingUsers.length
    ? `${typingUsers.join(', ')} ${typingUsers.length > 1 ? 'are' : 'is'} typing…`
    : '';
  const activeChannel = channels.find((c) => c.id === s.activeChannelId);
  const headerTitle = homeView ? dmTitle || 'Friends' : activeChannel?.name || '—';
  const showFriends = homeView && !s.activeChannelId;

  const railBtn = (active: boolean): React.CSSProperties => ({
    width: 44, height: 44, borderRadius: active ? 14 : 22, border: 'none', cursor: 'pointer',
    background: active ? 'var(--accent)' : 'var(--bg)',
    color: active ? 'var(--accent-text)' : 'var(--text)', fontWeight: 'bold', flexShrink: 0,
  });

  const renderServerBtn = (sv: Server, ctxFolderId: string | null) => {
    const svUnread = (s.channelsByServer[sv.id] || []).reduce((n, c) => n + (c.id === s.activeChannelId ? 0 : (s.unreadByChannel[c.id] || 0)), 0);
    const dragging = dragKey === sv.id;
    const canMerge = !!dragKey && dragKey !== sv.id && !dragKey.startsWith('f:');
    const hot = dropHint === 'srv:' + sv.id;
    return (
      <div key={sv.id} draggable
        onDragStart={(e) => { setDragKey(sv.id); e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => { setDragKey(null); setDropHint(null); }}
        onDragOver={(e) => { if (canMerge) { e.preventDefault(); setDropHint('srv:' + sv.id); } }}
        onDragLeave={() => setDropHint((h) => (h === 'srv:' + sv.id ? null : h))}
        onDrop={(e) => {
          e.preventDefault();
          if (canMerge && dragKey) { if (ctxFolderId) dropInFolder(ctxFolderId, dragKey, sv.id); else mergeServers(dragKey, sv.id); }
          setDragKey(null); setDropHint(null);
        }}
        style={{ position: 'relative', flexShrink: 0, opacity: dragging ? 0.4 : 1 }}>
        <button onClick={() => selectServer(sv.id)}
          onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, serverId: sv.id }); }}
          title={sv.name}
          style={{ ...railBtn(!homeView && s.activeServerId === sv.id), overflow: 'hidden', padding: 0, boxShadow: hot ? '0 0 0 2px var(--accent)' : undefined }}>
          {sv.iconUrl
            ? <img src={sv.iconUrl} alt={sv.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : sv.name.slice(0, 2).toUpperCase()}
        </button>
        {svUnread > 0 && <span style={{ position: 'absolute', bottom: -2, right: -2 }}><UnreadBadge n={svUnread} /></span>}
      </div>
    );
  };

  // Slim drop-zone between top-level rail items (reorder / pull a server out of a folder).
  const railGap = (beforeKey: string | null) => {
    const id = 'gap:' + (beforeKey ?? '#end');
    const hot = dropHint === id;
    const active = !!dragKey;
    return (
      <div
        onDragOver={(e) => { if (active) { e.preventDefault(); setDropHint(id); } }}
        onDragLeave={() => setDropHint((h) => (h === id ? null : h))}
        onDrop={(e) => { e.preventDefault(); if (dragKey) dropOnRail(dragKey, beforeKey); setDragKey(null); setDropHint(null); }}
        style={{ height: hot ? 14 : (active ? 8 : 4), width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'height .1s' }}>
        {hot && <div style={{ height: 4, width: 36, background: 'var(--accent)', borderRadius: 2 }} />}
      </div>
    );
  };

  // Drop-zone between servers inside an expanded folder (reorder within / move into folder).
  const folderGap = (folderId: string, beforeId: string | null) => {
    const id = 'fgap:' + folderId + ':' + (beforeId ?? '#end');
    const hot = dropHint === id;
    const active = !!dragKey && !dragKey.startsWith('f:');
    return (
      <div
        onDragOver={(e) => { if (active) { e.preventDefault(); setDropHint(id); } }}
        onDragLeave={() => setDropHint((h) => (h === id ? null : h))}
        onDrop={(e) => { e.preventDefault(); if (dragKey && !dragKey.startsWith('f:')) dropInFolder(folderId, dragKey, beforeId); setDragKey(null); setDropHint(null); }}
        style={{ height: hot ? 12 : (active ? 6 : 2), width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {hot && <div style={{ height: 3, width: 30, background: 'var(--accent)', borderRadius: 2 }} />}
      </div>
    );
  };

  const renderFolder = (f: ServerFolder) => {
    const fservers = f.serverIds.map((id) => serverById.get(id)).filter(Boolean) as Server[];
    if (fservers.length === 0) return null;
    const fUnread = fservers.reduce((n, sv) => n + (s.channelsByServer[sv.id] || []).reduce((m, c) => m + (c.id === s.activeChannelId ? 0 : (s.unreadByChannel[c.id] || 0)), 0), 0);
    const dragging = dragKey === 'f:' + f.id;
    const canDropServer = !!dragKey && !dragKey.startsWith('f:');
    const hot = dropHint === 'folder:' + f.id;
    return (
      <div key={f.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', opacity: dragging ? 0.4 : 1 }}>
        <div style={{ position: 'relative' }} draggable
          onDragStart={(e) => { setDragKey('f:' + f.id); e.dataTransfer.effectAllowed = 'move'; }}
          onDragEnd={() => { setDragKey(null); setDropHint(null); }}
          onDragOver={(e) => { if (canDropServer) { e.preventDefault(); setDropHint('folder:' + f.id); } }}
          onDragLeave={() => setDropHint((h) => (h === 'folder:' + f.id ? null : h))}
          onDrop={(e) => { e.preventDefault(); if (canDropServer && dragKey) dropInFolder(f.id, dragKey, null); setDragKey(null); setDropHint(null); }}>
          <button title={f.name}
            onClick={() => toggleFolder(f.id)}
            onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, folderId: f.id }); }}
            style={{ width: 44, height: 44, borderRadius: 14, border: 'none', cursor: 'pointer', background: 'var(--bg)', display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 2, padding: 4, overflow: 'hidden', boxShadow: hot ? '0 0 0 2px var(--accent)' : undefined }}>
            {fservers.slice(0, 4).map((sv) => sv.iconUrl
              ? <img key={sv.id} src={sv.iconUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 3 }} />
              : <span key={sv.id} style={{ fontSize: 8, background: 'var(--accent)', color: '#fff', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{sv.name.slice(0, 2).toUpperCase()}</span>)}
          </button>
          {f.collapsed && fUnread > 0 && <span style={{ position: 'absolute', bottom: -2, right: -2 }}><UnreadBadge n={fUnread} /></span>}
        </div>
        {!f.collapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 52, background: 'var(--panel)', borderRadius: 16, padding: '2px 0', marginTop: 4 }}>
            {fservers.map((sv) => (
              <Fragment key={sv.id}>
                {folderGap(f.id, sv.id)}
                {renderServerBtn(sv, f.id)}
              </Fragment>
            ))}
            {folderGap(f.id, null)}
          </div>
        )}
      </div>
    );
  };

  const layout = getLayout();
  const folderOf: Record<string, string> = {};
  layout.folders.forEach((f) => f.serverIds.forEach((sid) => { folderOf[sid] = f.id; }));
  const serverById = new Map(s.servers.map((sv) => [sv.id, sv] as const));
  const railKeys = topLevelKeys(layout);

  return (
    <div className={'app-shell' + (navOpen ? ' nav-open' : '')} onClick={() => navOpen && setNavOpen(false)}>
      <div className="sidebars" onClick={(e) => e.stopPropagation()}>
        {/* server rail */}
        <div style={{ width: 64, background: 'var(--panel-dark)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 12, paddingBottom: 12, overflowY: 'auto' }}>
          <button onClick={goHome} title="Home / Friends" style={{ ...railBtn(homeView), overflow: 'hidden', padding: 0 }}>
            <img src="/logo.png" alt="Home" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6, boxSizing: 'border-box', display: 'block' }} />
          </button>
          <div style={{ width: 32, height: 2, background: 'var(--bg)', borderRadius: 1, margin: '8px 0' }} />
          {railKeys.map((k) => {
            if (k.startsWith('f:')) {
              const f = layout.folders.find((x) => 'f:' + x.id === k);
              return f ? <Fragment key={k}>{railGap(k)}{renderFolder(f)}</Fragment> : null;
            }
            const sv = serverById.get(k);
            return sv ? <Fragment key={k}>{railGap(k)}{renderServerBtn(sv, null)}</Fragment> : null;
          })}
          {railGap(null)}
        </div>

        {/* channel / DM list */}
        <div style={{ width: 240, background: 'var(--panel)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 48, padding: '0 12px', fontWeight: 'bold', borderBottom: '1px solid var(--border)', color: 'var(--text-strong)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {homeView ? 'Home' : activeServer?.name ?? 'No server'}
            </span>
            {!homeView && activeServer && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {canManageChannels && (
                  <button onClick={() => setCreateChannelOpen(true)} title="Create Channel"
                    style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>＋</button>
                )}
                {canManageServer(activeServer.myPermissions) && (
                  <button onClick={() => setServerSettingsOpen(true)} title="Server Settings"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Icon name="settings" size={17} alt="Server settings" /></button>
                )}
                {!isServerOwner && (
                  <button onClick={() => handleLeaveServer(activeServer.id)} title="Leave Server"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Icon name="leaveserver" size={16} alt="Leave server" /></button>
                )}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 8 }}>
            {homeView ? (
              <>
                <div onClick={() => { setDmTitle(''); useStore.getState().set({ activeChannelId: null }); }}
                  style={{ padding: '8px', borderRadius: 4, cursor: 'pointer', fontWeight: 600, color: showFriends ? 'var(--text-strong)' : 'var(--muted)', background: showFriends ? 'var(--hover)' : 'transparent', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="friends" size={18} /> Friends
                </div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', padding: '14px 8px 6px' }}>
                  Direct Messages
                </div>
                {s.dms.length === 0 && <div style={{ padding: '4px 8px', fontSize: 13, color: 'var(--muted-2)' }}>No conversations yet.</div>}
                {[...s.dms].sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')).map((dm) => {
                  const others = dm.recipients.filter((u) => u.id !== s.user!.id);
                  const title = others.map((u) => u.displayName || u.username).join(', ') || 'Direct Message';
                  const active = dm.id === s.activeChannelId;
                  const unread = s.unreadByChannel[dm.id] || 0;
                  return (
                    <div key={dm.id} onClick={() => openDm(dm.id, title)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 4, cursor: 'pointer', marginBottom: 2,
                        background: active ? 'var(--hover)' : 'transparent' }}>
                      <Avatar user={others[0] ? withPresence(others[0]) : undefined} size={28} showStatus />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: active || unread ? 'var(--text-strong)' : 'var(--muted)', fontWeight: unread ? 700 : 400 }}>{title}</span>
                      {unread > 0 && !active && <UnreadBadge n={unread} />}
                    </div>
                  );
                })}
              </>
            ) : (
              <>
                {textChannels.length > 0 && <div style={catLabel}>Text Channels</div>}
                {textChannels.map(renderChannel)}
                {voiceChannels.length > 0 && <div style={catLabel}>Voice Channels</div>}
                {voiceChannels.map(renderChannel)}
              </>
            )}
          </div>
          <ServerActions activeServerId={homeView ? null : s.activeServerId} onChanged={refreshServers} />
          {voice.channelId && (
            <div style={{ background: 'var(--panel-dark)', borderTop: '1px solid var(--border)', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--success)', fontWeight: 600, fontSize: 13 }}>🔊 Voice Connected</div>
                <div style={{ color: 'var(--muted)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{voiceChName}</div>
              </div>
              <button onClick={voice.toggleMute} title={voice.muted ? 'Unmute' : 'Mute'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <Icon name={voice.muted ? 'mute' : 'unmute'} size={18} alt={voice.muted ? 'Unmute' : 'Mute'} />
              </button>
              <button onClick={() => { const id = voice.channelId; voice.leave(); if (id) refreshVoiceMembers(id); }} title="Disconnect"
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Icon name="disconnect" size={18} alt="Disconnect" /></button>
            </div>
          )}
          <UserPanel user={withPresence(s.user)} onOpenSettings={() => setSettingsOpen(true)} />
        </div>
      </div>

      {/* main view */}
      <div className="main-view">
        <div style={{ height: 48, padding: '0 16px', borderBottom: '1px solid var(--border)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-strong)' }}>
          <button className="mobile-only" onClick={() => setNavOpen((v) => !v)}
            style={{ background: 'none', border: 'none', color: 'var(--text)', fontSize: 20, cursor: 'pointer' }}>☰</button>
          {!showFriends && <span>{homeView ? '@' : '#'} {headerTitle}</span>}
          {showFriends && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icon name="friends" size={20} /> Friends</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            {dmChannel && voice.channelId !== dmChannel.id && (
              <button title="Start voice call" onClick={() => startCall(dmChannel.id)}
                style={{ background: 'none', border: 'none', color: 'var(--success)', cursor: 'pointer', fontSize: 17 }}>📞</button>
            )}
            {!showFriends && s.activeChannelId && (
              <button title="Pinned messages"
                onClick={() => { const willOpen = !pinsOpen; setOpenPanel(willOpen ? 'pins' : null); if (willOpen) loadPins(s.activeChannelId!); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: pinsOpen ? 1 : 0.7 }}><Icon name="pin" size={17} alt="Pinned messages" /></button>
            )}
            <NotificationHub reloadKey={s.notifyTick}
              open={openPanel === 'notify'}
              onOpenChange={(o) => setOpenPanel(o ? 'notify' : null)}
              onServerJoined={(sv) => {
                const cur = useStore.getState().servers;
                if (!cur.some((x) => x.id === sv.id)) useStore.getState().set({ servers: [...cur, sv] });
              }}
              onToast={showToast}
              onChanged={() => {
                useStore.getState().set({ notifyTick: useStore.getState().notifyTick + 1 });
                refreshServers().catch(() => {});
                refreshActiveMembers();
              }} />
          </div>
        </div>

        {pinsOpen && !showFriends && (
          <div style={{ position: 'fixed', top: 52, right: 16, width: 340, maxHeight: 440, overflowY: 'auto', zIndex: 60,
            background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)' }}>
            <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-strong)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--panel)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="pin" size={16} /> Pinned Messages</span>
              <button onClick={() => setOpenPanel(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
            {pins.length === 0 ? (
              <div style={{ padding: 20, color: 'var(--muted-2)', fontStyle: 'italic', fontSize: 13 }}>No pinned messages yet.</div>
            ) : pins.map((p) => (
              <div key={p.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10 }}>
                <Avatar user={p.author} size={32} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-strong)', fontSize: 13 }}>{p.author?.displayName || p.author?.username || 'user'}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>{new Date(p.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)', wordBreak: 'break-word', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                    {p.content && p.content !== '​' ? p.content : '(attachment)'}
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                    <button onClick={() => jumpToMessage(p.id)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, padding: 0 }}>Jump</button>
                    {canPin && <button onClick={() => { handlePin(p, false); setPins((ps) => ps.filter((x) => x.id !== p.id)); }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12, padding: 0 }}>Unpin</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {showFriends ? (
          <FriendsView me={s.user} onOpenDm={openDm} reloadKey={s.notifyTick} />
        ) : activeChannel?.type === 'VOICE' && s.activeChannelId ? (
          <CallView
            channelName={activeChannel.name}
            connected={voice.channelId === activeChannel.id}
            connecting={voice.connecting}
            status={voice.status}
            participants={voice.channelId === activeChannel.id ? voice.participants : []}
            muted={voice.muted}
            onJoin={() => voice.join(activeChannel.id).then(() => refreshVoiceMembers(activeChannel.id)).catch((e) => showToast('Voice failed: ' + (e?.message || 'could not connect')))}
            onLeave={() => { const id = voice.channelId; voice.leave(); if (id) refreshVoiceMembers(id); }}
            onToggleMute={voice.toggleMute}
            party={activeParty}
            meId={s.user.id}
            onStartWatch={() => setWatchPickerOpen(true)}
            onWatchState={(pos, paused) => pushWatchState(activeChannel.id, pos, paused)}
            onStopWatch={() => stopWatchParty(activeChannel.id)}
            onOpenSoundboard={() => setSoundboardOpen(true)}
          />
        ) : s.activeChannelId ? (
          <>
            {dmChannel && voice.channelId === dmChannel.id && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--panel-dark)', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>📞 In call</span>
                <div style={{ display: 'flex', gap: 8, flex: 1, minWidth: 0, overflowX: 'auto' }}>
                  {voice.participants.map((sp) => {
                    const speaking = sp.speaking && sp.micOn;
                    const u = sp.identity === s.user?.id ? s.user : (dmChannel.recipients.find((r) => r.id === sp.identity) || { username: sp.name, displayName: sp.name, avatarUrl: null });
                    return (
                      <div key={sp.identity} title={sp.isMe ? 'You' : sp.name} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <div style={{ borderRadius: '50%', padding: 2, border: `2px solid ${speaking ? 'var(--success)' : 'transparent'}`, transition: 'border-color .12s' }}>
                          <Avatar user={u} size={28} />
                        </div>
                        {!sp.micOn && <Icon name="mute" size={13} alt="Muted" />}
                      </div>
                    );
                  })}
                </div>
                <button onClick={voice.toggleMute} title={voice.muted ? 'Unmute' : 'Mute'}
                  style={{ padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, background: voice.muted ? 'var(--danger)' : 'var(--input-bg)', color: voice.muted ? '#fff' : 'var(--text)' }}>
                  <Icon name={voice.muted ? 'mute' : 'unmute'} size={15} /> {voice.muted ? 'Unmute' : 'Mute'}
                </button>
                <button onClick={() => { const id = voice.channelId; voice.leave(); if (id) refreshVoiceMembers(id); }} title="Leave call"
                  style={{ padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--danger)', color: '#fff' }}>
                  <Icon name="disconnect" size={15} /> Leave
                </button>
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.length === 0 && <div style={{ color: 'var(--muted-2)', fontStyle: 'italic' }}>No messages yet.</div>}
              {messages.map((m) => {
                const canDelete = m.authorId === s.user!.id || canDeleteAny;
                return (
                  <div key={m.id} id={'msg-' + m.id} className="msg-row" style={{ display: 'flex', gap: 12, position: 'relative', opacity: m.pending ? 0.55 : 1 }}>
                    <Avatar user={m.author} size={40} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      {m.replyTo && (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2, display: 'flex', gap: 4, alignItems: 'center' }}>
                          <span style={{ opacity: 0.7 }}>↩</span>
                          <span style={{ fontWeight: 600 }}>{m.replyTo.authorName}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>{m.replyTo.content}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontWeight: 'bold', color: 'var(--text-strong)' }}>{m.author?.displayName || m.author?.username || 'user'}</span>
                        <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>{new Date(m.createdAt).toLocaleTimeString()}</span>
                        {m.pending && <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>· sending…</span>}
                        {m.failed && <span style={{ fontSize: 11, color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="error" size={12} /> failed to send</span>}
                        {m.pinned && <span title="Pinned" style={{ fontSize: 11, color: 'var(--muted-2)' }}>· 📌 pinned</span>}
                      </div>
                      {editingId === m.id ? (
                        <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); saveEdit(m.id, editText); setEditingId(null); }
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          onBlur={() => setEditingId(null)}
                          style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4, padding: '6px 8px', outline: 'none', marginTop: 2 }} />
                      ) : (
                        m.content && m.content !== '​' && !m.poll && !isSingleEmbedUrl(m.content) && (
                          <p style={{ margin: '2px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {renderContent(m.content)}
                            {m.editedAt && <span style={{ fontSize: 10, color: 'var(--muted-2)', marginLeft: 6 }}>(edited)</span>}
                          </p>
                        )
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                        {(m.attachments || []).map((a) => (
                          <Attachment key={a.id || a.shareAssetId} attachment={a} shareBaseUrl={s.shareBaseUrl} />
                        ))}
                      </div>
                      {m.poll && <PollView poll={m.poll} meId={s.user!.id} onVote={handlePollVote} />}
                      {m.content && m.content !== '​' && !m.poll && <MessageEmbeds content={m.content} />}
                      {m.reactions.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
                          {m.reactions.map((r) => {
                            const mine = r.userIds.includes(s.user!.id);
                            return (
                              <button key={r.emoji} onClick={() => toggleReaction(m.id, r.emoji, mine)}
                                style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '1px 8px', borderRadius: 12, fontSize: 13, cursor: 'pointer',
                                  border: '1px solid ' + (mine ? 'var(--accent)' : 'var(--border)'), background: mine ? 'var(--hover)' : 'var(--panel)', color: 'var(--text)' }}>
                                <span>{r.emoji}</span><span style={{ fontSize: 11, color: 'var(--muted)' }}>{r.count}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {editingId !== m.id && !m.pending && !m.failed && (
                      <div className="msg-del" style={{ position: 'absolute', top: 0, right: 0, display: 'flex', gap: 4 }}>
                        <button title="Add reaction"
                          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setReactPickerAnchor({ x: r.right, y: r.top }); setReactPickerFor(m.id); }}
                          style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', fontSize: 12 }}>
                          😊
                        </button>
                        <button title="Reply"
                          onClick={() => setReplyingTo({ id: m.id, authorName: m.author?.displayName || m.author?.username || 'user', content: (m.content === '​' ? '(attachment)' : m.content).slice(0, 120) })}
                          style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', fontSize: 12 }}>
                          ↩
                        </button>
                        {m.authorId === s.user!.id && (
                          <button title="Edit message"
                            onClick={() => { setEditingId(m.id); setEditText(m.content === '​' ? '' : m.content); }}
                            style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', fontSize: 12 }}>
                            ✏️
                          </button>
                        )}
                        {canPin && (
                          <button title={m.pinned ? 'Unpin message' : 'Pin message'}
                            onClick={() => handlePin(m, !m.pinned)}
                            style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', padding: '2px 5px', display: 'flex', alignItems: 'center', opacity: m.pinned ? 1 : 0.75 }}>
                            <Icon name="pin" size={13} />
                          </button>
                        )}
                        {canDelete && (
                          <button title="Delete message"
                            onClick={() => handleDeleteMessage(m.channelId, m.id)}
                            style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--danger)', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', fontSize: 12 }}>
                            🗑
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {typingText && <div style={{ padding: '0 16px 2px', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', height: 16 }}>{typingText}</div>}
            <Composer channelId={s.activeChannelId} shareBaseUrl={s.shareBaseUrl} wsRef={wsRef} title={headerTitle}
              me={s.user} replyingTo={replyingTo} onClearReply={() => setReplyingTo(null)} mentionCandidates={mentionCandidates} />
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-2)' }}>
            Select a channel or a conversation.
          </div>
        )}
      </div>

      {showRightPanel && (
        <MemberListPanel heading={homeView ? 'Conversation' : 'Members'} users={rightPanelUsers.map(withPresence)} />
      )}

      {settingsOpen && (
        <SettingsModal
          user={s.user}
          theme={theme}
          shareBaseUrl={s.shareBaseUrl}
          audio={voice.audio}
          onThemeChange={changeTheme}
          onSaved={(u) => useStore.getState().set({ user: u })}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {incomingCall && (
        <div className="call-pop" style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 320, width: 300,
          background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <Avatar user={{ username: incomingCall.callerName, displayName: incomingCall.callerName, avatarUrl: incomingCall.callerAvatar }} size={44} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{incomingCall.callerName}</div>
              <div style={{ fontSize: 13, color: 'var(--success)' }}>📞 Incoming call…</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => acceptCall(incomingCall)}
              style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, background: 'var(--success)', color: '#fff' }}>Accept</button>
            <button onClick={() => { if (ringTimer.current) window.clearTimeout(ringTimer.current); setIncomingCall(null); }}
              style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, background: 'var(--danger)', color: '#fff' }}>Decline</button>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 300,
          background: 'var(--panel-dark)', color: 'var(--text-strong)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '10px 18px', boxShadow: '0 6px 24px rgba(0,0,0,0.4)', fontSize: 14, maxWidth: '90vw' }}>
          {toast}
        </div>
      )}

      {ctxMenu && (
        <div onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }}
          style={{ position: 'fixed', inset: 0, zIndex: 150 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ position: 'fixed', left: Math.min(ctxMenu.x, window.innerWidth - 210), top: Math.min(ctxMenu.y, window.innerHeight - 240),
              background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.4)', padding: 6, minWidth: 190, maxHeight: 300, overflowY: 'auto' }}>
            {(() => {
              const item = (label: string, onClick: () => void, danger = false): React.ReactNode => (
                <button onClick={() => { onClick(); setCtxMenu(null); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none',
                    color: danger ? 'var(--danger)' : 'var(--text)', cursor: 'pointer', fontSize: 14, borderRadius: 4 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                  {label}
                </button>
              );
              if (ctxMenu.serverId) {
                const sid = ctxMenu.serverId;
                return (
                  <>
                    {item('📁 New Folder…', () => newFolder(sid))}
                    {layout.folders.filter((f) => !f.serverIds.includes(sid)).map((f) => (
                      <div key={f.id}>{item(`→ Move to ${f.name}`, () => moveToFolder(sid, f.id))}</div>
                    ))}
                    {folderOf[sid] && item('Remove from Folder', () => removeFromFolders(sid))}
                  </>
                );
              }
              if (ctxMenu.folderId) {
                const fid = ctxMenu.folderId;
                return (
                  <>
                    {item('✏️ Rename Folder', () => renameFolder(fid))}
                    {item('🗑 Delete Folder', () => deleteFolder(fid), true)}
                  </>
                );
              }
              return null;
            })()}
          </div>
        </div>
      )}

      {watchPickerOpen && s.activeChannelId && (
        <WatchPartyPicker onPick={startWatchParty} onClose={() => setWatchPickerOpen(false)} />
      )}

      {soundboardOpen && activeServer && (
        <Soundboard
          serverId={activeServer.id}
          canManage={has(activeServer.myPermissions, Permission.MANAGE_CHANNELS)}
          shareBaseUrl={s.shareBaseUrl}
          audio={voice.audio}
          onPlay={(url) => voice.playSound(url)}
          onClose={() => setSoundboardOpen(false)}
        />
      )}

      {reactPickerFor && reactPickerAnchor && (
        <EmojiPicker
          anchor={reactPickerAnchor}
          onSelect={(emoji) => {
            const mid = reactPickerFor;
            setReactPickerFor(null);
            const msg = messages.find((mm) => mm.id === mid);
            const mine = (msg?.reactions.find((r) => r.emoji === emoji)?.userIds || []).includes(s.user!.id);
            toggleReaction(mid, emoji, mine);
          }}
          onClose={() => setReactPickerFor(null)}
        />
      )}

      {createChannelOpen && activeServer && (
        <CreateChannelModal
          onCreate={(name, type) => createChannel(activeServer.id, name, type)}
          onClose={() => setCreateChannelOpen(false)}
        />
      )}

      {serverSettingsOpen && activeServer && (
        <ServerSettingsModal
          server={activeServer}
          me={s.user}
          shareBaseUrl={s.shareBaseUrl}
          onClose={() => setServerSettingsOpen(false)}
          onUpdated={(updated) =>
            useStore.getState().set({
              servers: useStore.getState().servers.map((x) => (x.id === updated.id ? updated : x)),
            })
          }
          onDeleted={(id) => {
            useStore.getState().set({ servers: useStore.getState().servers.filter((x) => x.id !== id) });
            setServerSettingsOpen(false);
            goHome();
          }}
        />
      )}
    </div>
  );
}

function UnreadBadge({ n }: { n: number }) {
  return (
    <span style={{
      background: 'var(--danger)', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700,
      padding: '1px 6px', minWidth: 18, textAlign: 'center', flexShrink: 0, lineHeight: '16px',
      border: '2px solid var(--panel-dark)',
    }}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

type MentionUser = { id: string; username: string; displayName: string | null; avatarUrl: string | null };

function Composer({
  channelId, shareBaseUrl, wsRef, title, me, replyingTo, onClearReply, mentionCandidates,
}: {
  channelId: string; shareBaseUrl: string;
  wsRef: React.MutableRefObject<WebSocket | null>; title?: string;
  me: User;
  replyingTo: { id: string; authorName: string; content: string } | null;
  onClearReply: () => void;
  mentionCandidates: MentionUser[];
}) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState<Att[]>([]);
  const [emojiAnchor, setEmojiAnchor] = useState<{ x: number; y: number } | null>(null);
  const [gifAnchor, setGifAnchor] = useState<{ x: number; y: number } | null>(null);
  const [pollOpen, setPollOpen] = useState(false);
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTypingSent = useRef(0);

  const mentionMatches: MentionUser[] = mention
    ? mentionCandidates
        .filter((c) => {
          const q = mention.query.toLowerCase();
          return c.username.toLowerCase().includes(q) || (c.displayName || '').toLowerCase().includes(q);
        })
        .slice(0, 8)
    : [];

  function notifyTyping() {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (now - lastTypingSent.current < 2500) return;
    lastTypingSent.current = now;
    ws.send(JSON.stringify({ op: 'typing.start', d: { channelId } }));
  }

  function updateMention(value: string, cursor: number) {
    const pre = value.slice(0, cursor);
    const m = pre.match(/(?:^|\s)@([\w.-]*)$/);
    if (m && mentionCandidates.length) { setMention({ query: m[1], start: cursor - m[1].length - 1 }); setMentionIndex(0); }
    else setMention(null);
  }

  function insertMention(c: MentionUser) {
    if (!mention) return;
    const before = text.slice(0, mention.start);
    const after = text.slice(mention.start + 1 + mention.query.length);
    setText(`${before}@${c.username} ${after}`);
    setMention(null);
    inputRef.current?.focus();
  }

  function doSend(content: string, attachments: Att[]) {
    if (!channelId || (!content.trim() && attachments.length === 0)) return;
    const ws = wsRef.current;
    const body = content.trim() || '​';
    const nonce = crypto.randomUUID();
    const replyToId = replyingTo?.id;
    const temp: Message = {
      id: `temp:${nonce}`, channelId, authorId: me.id, content: body,
      createdAt: new Date().toISOString(), editedAt: null, deletedAt: null,
      replyToId: replyToId ?? null, pinned: false,
      author: { id: me.id, username: me.username, displayName: me.displayName, avatarUrl: me.avatarUrl, status: me.status },
      attachments, reactions: [],
      replyTo: replyingTo ? { id: replyingTo.id, authorName: replyingTo.authorName, content: replyingTo.content } : null,
      nonce, pending: true,
    };
    useStore.getState().addMessage(temp);
    onClearReply();
    if (!ws || ws.readyState !== WebSocket.OPEN) { useStore.getState().markFailed(channelId, temp.id); return; }
    ws.send(JSON.stringify({ op: 'message.send', d: { channelId, content: body, nonce, attachments, replyToId } }));
    setTimeout(() => {
      const msgs = useStore.getState().messagesByChannel[channelId] || [];
      if (msgs.some((m) => m.id === temp.id && m.pending)) useStore.getState().markFailed(channelId, temp.id);
    }, 10000);
  }

  function send() {
    if (!text.trim() && pending.length === 0) return;
    const content = text; const attachments = pending;
    setText(''); setPending([]); setMention(null);
    doSend(content, attachments);
  }

  return (
    <div style={{ padding: 16, position: 'relative' }}>
      {replyingTo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12, color: 'var(--muted)' }}>
          <span>Replying to <b style={{ color: 'var(--text)' }}>{replyingTo.authorName}</b></span>
          <button onClick={onClearReply} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕ cancel</button>
        </div>
      )}
      {pending.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          {pending.map((a) => (
            <span key={a.shareAssetId} style={{ background: 'var(--panel)', padding: '4px 8px', borderRadius: 4, fontSize: 12 }}>
              📎 {a.filename}{' '}
              <button onClick={() => setPending((p) => p.filter((x) => x.shareAssetId !== a.shareAssetId))}
                style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>✕</button>
            </span>
          ))}
        </div>
      )}

      {mention && mentionMatches.length > 0 && (
        <div style={{ position: 'absolute', bottom: 'calc(100% - 8px)', left: 16, right: 16, maxWidth: 320, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 -4px 16px rgba(0,0,0,0.3)', overflow: 'hidden', zIndex: 40 }}>
          {mentionMatches.map((c, i) => (
            <div key={c.id} onMouseDown={(e) => { e.preventDefault(); insertMention(c); }}
              onMouseEnter={() => setMentionIndex(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer', background: i === mentionIndex ? 'var(--hover)' : 'transparent' }}>
              <Avatar user={c} size={22} />
              <span style={{ color: 'var(--text-strong)', fontSize: 14 }}>{c.displayName || c.username}</span>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>@{c.username}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: 'var(--input-bg)', borderRadius: 8, padding: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        {shareBaseUrl && <AttachmentPicker shareBaseUrl={shareBaseUrl} onUploaded={(a) => setPending((p) => [...p, ...a])} />}
        <input ref={inputRef} value={text}
          onChange={(e) => { setText(e.target.value); notifyTyping(); updateMention(e.target.value, e.target.selectionStart ?? e.target.value.length); }}
          onClick={(e) => updateMention(text, (e.target as HTMLInputElement).selectionStart ?? text.length)}
          onKeyUp={(e) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) updateMention(text, (e.target as HTMLInputElement).selectionStart ?? text.length); }}
          onKeyDown={(e) => {
            if (mention && mentionMatches.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionMatches.length); return; }
              if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length); return; }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionMatches[mentionIndex]); return; }
              if (e.key === 'Escape') { setMention(null); return; }
            }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder={`Message ${title ?? ''}`}
          enterKeyHint="send"
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: 'var(--text)', outline: 'none', fontSize: 15 }} />
        <button title="Create poll" onClick={() => setPollOpen(true)}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--muted)', flexShrink: 0, padding: '3px 6px' }}>
          POLL
        </button>
        <button title="GIF"
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setGifAnchor({ x: r.right, y: r.top }); }}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--muted)', flexShrink: 0, padding: '3px 6px' }}>
          GIF
        </button>
        <button title="Emoji"
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setEmojiAnchor({ x: r.right, y: r.top }); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--muted)', flexShrink: 0 }}>
          😊
        </button>
        <button title="Send" onClick={send} disabled={!text.trim() && pending.length === 0}
          style={{ background: (text.trim() || pending.length) ? 'var(--accent)' : 'var(--panel)', border: 'none', borderRadius: 6, cursor: (text.trim() || pending.length) ? 'pointer' : 'default',
            color: (text.trim() || pending.length) ? 'var(--accent-text)' : 'var(--muted-2)', flexShrink: 0, padding: '6px 10px', fontSize: 15, lineHeight: 1 }}>
          ➤
        </button>
      </div>
      {emojiAnchor && (
        <EmojiPicker anchor={emojiAnchor}
          onSelect={(em) => { setText((t) => t + em); setEmojiAnchor(null); }}
          onClose={() => setEmojiAnchor(null)} />
      )}
      {gifAnchor && (
        <GifPicker anchor={gifAnchor}
          onSelect={(gif) => { setGifAnchor(null); doSend(gif.url, []); }}
          onClose={() => setGifAnchor(null)} />
      )}
      {pollOpen && (
        <PollModal
          onClose={() => setPollOpen(false)}
          onCreate={(data) => { setPollOpen(false); if (channelId) api.createPoll(channelId, data).catch(() => {}); }}
        />
      )}
    </div>
  );
}
