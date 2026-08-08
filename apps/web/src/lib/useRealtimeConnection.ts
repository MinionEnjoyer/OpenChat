import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from './api';
import type { AppState } from './appStore';
import { useAppStore } from './appStore';
import { serverIdForChannel } from './channelOwnership';
import { messageSummary } from './messageContent';
import { notifyNative } from './notify';
import { notifyAllowed } from './notifyPrefs';
import { wsUrl } from './serverConfig';
import type { DmChannel, WatchPartyState } from './types';

export interface IncomingCall {
  channelId: string;
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
}

export interface RealtimeEvent {
  op: string;
  d: any;
}

interface RealtimeEventCallbacks {
  activeVoiceChannelId: string | null;
  onIncomingCall: (call: IncomingCall) => void;
  onToast: (message: string) => void;
  onTyping: (channelId: string, userId: string, expiresAt: number) => void;
  onWatchPartySync: (channelId: string, state: WatchPartyState | null) => void;
}

interface RealtimeEventServices {
  now: () => number;
  notifyAllowed: typeof notifyAllowed;
  notifyNative: typeof notifyNative;
  summarize: typeof messageSummary;
}

const defaultEventServices: RealtimeEventServices = {
  now: Date.now,
  notifyAllowed,
  notifyNative,
  summarize: messageSummary,
};

export function dispatchRealtimeEvent(
  event: RealtimeEvent,
  callbacks: RealtimeEventCallbacks,
  services: RealtimeEventServices = defaultEventServices,
) {
  const { op, d } = event;
  const state: AppState = useAppStore.getState();

  if (op === 'message.created') {
    if (d.nonce) state.replacePending(d.message.channelId, d.nonce, d.message);
    else state.addMessage(d.message);
    if (d.message.channelId !== state.activeChannelId && d.message.authorId !== state.user?.id) {
      state.bumpUnread(d.message.channelId);
    }
    const isDm = state.dms.some((dm) => dm.id === d.message.channelId);
    if (isDm) {
      state.set({
        dms: state.dms.map((dm) => (
          dm.id === d.message.channelId ? { ...dm, lastMessageAt: d.message.createdAt } : dm
        )),
      });
      if (
        d.message.authorId !== state.user?.id
        && state.user?.status !== 'DND'
        && services.notifyAllowed({ channelId: d.message.channelId, serverId: null, isMention: false })
      ) {
        const name = d.message.author?.displayName || d.message.author?.username || 'New message';
        services.notifyNative(name, services.summarize(d.message.content || ''), {
          channelId: d.message.channelId,
          kind: 'dm',
        });
      }
    }
    return;
  }
  if (op === 'message.updated') {
    state.updateMessage(d.message);
    return;
  }
  if (op === 'message.deleted') {
    state.deleteMessage(d.channelId, d.id);
    return;
  }
  if (op === 'watchparty.sync') {
    callbacks.onWatchPartySync(d.channelId, d.state);
    return;
  }
  if (op === 'notify') {
    state.set({ notifyTick: state.notifyTick + 1 });
    return;
  }
  if (op === 'mention') {
    if (d.channelId !== state.activeChannelId) state.bumpUnread(d.channelId);
    callbacks.onToast(`💬 ${d.authorName} mentioned you in #${d.channelName}`);
    const serverId: string | null = d.serverId
      ?? serverIdForChannel(state.serverIdByChannel, d.channelId);
    if (
      state.user?.status !== 'DND'
      && services.notifyAllowed({ channelId: d.channelId, serverId, isMention: true })
    ) {
      services.notifyNative(
        `Mention in #${d.channelName}`,
        `${d.authorName} mentioned you`,
        { channelId: d.channelId, serverId: serverId ?? undefined, kind: 'mention' },
      );
    }
    return;
  }
  if (op === 'call.ring') {
    if (callbacks.activeVoiceChannelId !== d.channelId) {
      callbacks.onIncomingCall({
        channelId: d.channelId,
        callerId: d.callerId,
        callerName: d.callerName,
        callerAvatar: d.callerAvatar,
      });
      if (state.user?.status !== 'DND') {
        services.notifyNative('Incoming call', `${d.callerName} is calling`, {
          channelId: d.channelId,
          kind: 'call',
        });
      }
    }
    return;
  }
  if (op === 'presence.snapshot') {
    const presenceById: Record<string, string> = {};
    const platformsById: Record<string, string[]> = {};
    for (const user of d.users || []) {
      presenceById[user.userId] = user.status;
      platformsById[user.userId] = user.platforms || [];
    }
    state.set({ presenceById, platformsById });
    return;
  }
  if (op === 'presence') {
    if (d.userId !== state.user?.id) {
      state.setPresence(d.userId, d.status);
      state.set({
        platformsById: {
          ...useAppStore.getState().platformsById,
          [d.userId]: d.status === 'OFFLINE' ? [] : (d.platforms || []),
        },
      });
    }
    return;
  }
  if (op === 'typing' && d.userId !== state.user?.id) {
    callbacks.onTyping(d.channelId, d.userId, services.now() + 5000);
  }
}

interface UseRealtimeConnectionOptions {
  activeVoiceChannelId: string | null;
  dms: DmChannel[];
  onToast: (message: string) => void;
  onWatchPartySync: (channelId: string, state: WatchPartyState | null) => void;
  platform: 'desktop' | 'web';
  userId: string | null;
  userStatus: string | null;
}

export function useRealtimeConnection({
  activeVoiceChannelId,
  dms,
  onToast,
  onWatchPartySync,
  platform,
  userId,
  userStatus,
}: UseRealtimeConnectionOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const subscribedRef = useRef<Set<string>>(new Set());
  const manualStatusRef = useRef('ONLINE');
  const autoAwayRef = useRef(false);
  const ringTimer = useRef<number | undefined>(undefined);
  const eventCallbacksRef = useRef<RealtimeEventCallbacks>(null!);
  const [wsDown, setWsDown] = useState(false);
  const [typing, setTyping] = useState<Record<string, Record<string, number>>>({});
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);

  const clearIncomingCall = useCallback(() => {
    if (ringTimer.current !== undefined) window.clearTimeout(ringTimer.current);
    ringTimer.current = undefined;
    setIncomingCall(null);
  }, []);

  const receiveIncomingCall = useCallback((call: IncomingCall) => {
    if (ringTimer.current !== undefined) window.clearTimeout(ringTimer.current);
    setIncomingCall(call);
    ringTimer.current = window.setTimeout(() => {
      ringTimer.current = undefined;
      setIncomingCall(null);
    }, 30000);
  }, []);

  eventCallbacksRef.current = {
    activeVoiceChannelId,
    onIncomingCall: receiveIncomingCall,
    onToast,
    onTyping: (channelId, typingUserId, expiresAt) => {
      setTyping((current) => ({
        ...current,
        [channelId]: { ...(current[channelId] || {}), [typingUserId]: expiresAt },
      }));
    },
    onWatchPartySync,
  };

  const sendPresence = useCallback((status: string, transient: boolean) => {
    if (!transient) autoAwayRef.current = false;
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ op: 'presence.update', d: { status, transient } }));
    }
  }, []);

  const subscribe = useCallback((channelId: string) => {
    subscribedRef.current.add(channelId);
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ op: 'subscribe', d: { channelId } }));
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    let closedByUs = false;
    let attempt = 0;
    let reconnectTimer: number | undefined;

    function scheduleReconnect() {
      if (closedByUs) return;
      setWsDown(true);
      attempt += 1;
      const delay = Math.min(30000, 1000 * 2 ** Math.min(attempt, 5))
        + Math.floor(Math.random() * 500);
      reconnectTimer = window.setTimeout(connect, delay);
    }

    async function connect() {
      if (closedByUs) return;
      let ticket: string;
      try {
        ({ ticket } = await api.getWsTicket());
      } catch {
        scheduleReconnect();
        return;
      }
      if (closedByUs) return;
      const socket = new WebSocket(wsUrl(`/ws?ticket=${ticket}&platform=${platform}`));
      wsRef.current = socket;
      socket.onopen = () => {
        attempt = 0;
        setWsDown(false);
        autoAwayRef.current = false;
        const state = useAppStore.getState();
        const status = state.user?.status && state.user.status !== 'OFFLINE'
          ? state.user.status
          : 'ONLINE';
        socket.send(JSON.stringify({ op: 'presence.update', d: { status } }));
        for (const dm of state.dms) subscribedRef.current.add(dm.id);
        for (const channelId of subscribedRef.current) {
          socket.send(JSON.stringify({ op: 'subscribe', d: { channelId } }));
        }
        const activeChannelId = state.activeChannelId;
        if (activeChannelId) {
          api.listMessages(activeChannelId).then((page) => {
            for (const message of page.reverse()) useAppStore.getState().addMessage(message);
          }).catch(() => {});
        }
      };
      socket.onclose = () => {
        if (wsRef.current === socket) wsRef.current = null;
        scheduleReconnect();
      };
      socket.onerror = () => {
        try { socket.close(); } catch { /* onclose handles reconnect */ }
      };
      socket.onmessage = (event) => {
        try {
          dispatchRealtimeEvent(JSON.parse(event.data), eventCallbacksRef.current);
        } catch { /* ignore malformed or unsupported events */ }
      };
    }

    connect();
    return () => {
      closedByUs = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [platform, userId]);

  useEffect(() => {
    manualStatusRef.current = userStatus || 'ONLINE';
  }, [userStatus]);

  useEffect(() => {
    if (!userId) return;
    const idleMs = 5 * 60 * 1000;
    let lastActivity = Date.now();
    const markActive = () => {
      lastActivity = Date.now();
      if (autoAwayRef.current) {
        autoAwayRef.current = false;
        sendPresence(manualStatusRef.current, true);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') markActive();
    };
    const events: (keyof WindowEventMap)[] = [
      'mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'focus',
    ];
    events.forEach((event) => window.addEventListener(event, markActive, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    const interval = window.setInterval(() => {
      if (autoAwayRef.current || manualStatusRef.current !== 'ONLINE') return;
      if (Date.now() - lastActivity >= idleMs) {
        autoAwayRef.current = true;
        sendPresence('AWAY', true);
      }
    }, 30000);
    return () => {
      events.forEach((event) => window.removeEventListener(event, markActive));
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(interval);
    };
  }, [sendPresence, userId]);

  useEffect(() => {
    for (const dm of dms) subscribe(dm.id);
  }, [dms, subscribe]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTyping((current) => {
        const now = Date.now();
        let changed = false;
        const next: Record<string, Record<string, number>> = {};
        for (const [channelId, users] of Object.entries(current)) {
          const active: Record<string, number> = {};
          for (const [typingUserId, expiresAt] of Object.entries(users)) {
            if (expiresAt > now) active[typingUserId] = expiresAt;
            else changed = true;
          }
          if (Object.keys(active).length) next[channelId] = active;
        }
        return changed ? next : current;
      });
    }, 2000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => () => {
    if (ringTimer.current !== undefined) window.clearTimeout(ringTimer.current);
    ringTimer.current = undefined;
  }, []);

  return {
    clearIncomingCall,
    incomingCall,
    sendPresence,
    subscribe,
    typing,
    wsDown,
    wsRef,
  };
}
