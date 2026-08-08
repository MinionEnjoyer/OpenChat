import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';
import { useAppStore } from './appStore';
import type { Message, User, WatchPartyState } from './types';
import {
  dispatchRealtimeEvent,
  useRealtimeConnection,
  type IncomingCall,
} from './useRealtimeConnection';

vi.mock('./api', () => ({
  getWsTicket: vi.fn(),
  listMessages: vi.fn(),
}));

const me: User = {
  id: 'me',
  username: 'me',
  displayName: null,
  avatarUrl: null,
  status: 'ONLINE',
};

function message(id: string, channelId = 'dm-1'): Message {
  return {
    id,
    channelId,
    authorId: 'other',
    content: `message ${id}`,
    createdAt: '2026-08-08T12:00:00Z',
    editedAt: null,
    deletedAt: null,
    replyToId: null,
    pinned: false,
    kind: 'USER',
    author: {
      id: 'other',
      username: 'other',
      displayName: 'Other User',
      avatarUrl: null,
      status: 'ONLINE',
      isBot: false,
    },
    attachments: [],
    reactions: [],
    replyTo: null,
  };
}

function callbacks(): {
  activeVoiceChannelId: string | null;
  onIncomingCall: (call: IncomingCall) => void;
  onToast: (message: string) => void;
  onTyping: (channelId: string, userId: string, expiresAt: number) => void;
  onWatchPartySync: (channelId: string, state: WatchPartyState | null) => void;
} {
  return {
    activeVoiceChannelId: null,
    onIncomingCall: vi.fn<(call: IncomingCall) => void>(),
    onToast: vi.fn<(message: string) => void>(),
    onTyping: vi.fn<(channelId: string, userId: string, expiresAt: number) => void>(),
    onWatchPartySync: vi.fn<(channelId: string, state: WatchPartyState | null) => void>(),
  };
}

function services() {
  return {
    now: () => 1000,
    notifyAllowed: vi.fn(() => true),
    notifyNative: vi.fn(),
    summarize: vi.fn((content: string) => `summary:${content}`),
  };
}

beforeEach(() => {
  useAppStore.setState({
    user: me,
    dms: [{ id: 'dm-1', type: 'DM', recipients: [me] }],
    activeChannelId: 'general',
    messagesByChannel: {},
    unreadByChannel: {},
    serverIdByChannel: { general: 'server-1' },
    presenceById: {},
    platformsById: {},
    notifyTick: 0,
  });
  vi.mocked(api.getWsTicket).mockReset();
  vi.mocked(api.listMessages).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dispatchRealtimeEvent', () => {
  it('stores incoming DMs, updates unread state, and requests a native notification', () => {
    const eventCallbacks = callbacks();
    const eventServices = services();
    const incoming = message('new-dm');

    dispatchRealtimeEvent(
      { op: 'message.created', d: { message: incoming } },
      eventCallbacks,
      eventServices,
    );

    expect(useAppStore.getState().messagesByChannel['dm-1']).toEqual([incoming]);
    expect(useAppStore.getState().unreadByChannel['dm-1']).toBe(1);
    expect(useAppStore.getState().dms[0].lastMessageAt).toBe(incoming.createdAt);
    expect(eventServices.notifyNative).toHaveBeenCalledWith(
      'Other User',
      'summary:message new-dm',
      { channelId: 'dm-1', kind: 'dm' },
    );
  });

  it('routes mentions through the channel ownership index', () => {
    const eventCallbacks = callbacks();
    const eventServices = services();

    dispatchRealtimeEvent({
      op: 'mention',
      d: { channelId: 'general', authorName: 'Other User', channelName: 'general' },
    }, eventCallbacks, eventServices);

    expect(eventCallbacks.onToast).toHaveBeenCalledWith('💬 Other User mentioned you in #general');
    expect(eventServices.notifyAllowed).toHaveBeenCalledWith({
      channelId: 'general',
      serverId: 'server-1',
      isMention: true,
    });
    expect(eventServices.notifyNative).toHaveBeenCalledWith(
      'Mention in #general',
      'Other User mentioned you',
      { channelId: 'general', serverId: 'server-1', kind: 'mention' },
    );
  });

  it('replaces presence snapshots and ignores presence echoes for the current user', () => {
    const eventCallbacks = callbacks();
    const eventServices = services();
    dispatchRealtimeEvent({
      op: 'presence.snapshot',
      d: { users: [{ userId: 'other', status: 'AWAY', platforms: ['desktop'] }] },
    }, eventCallbacks, eventServices);
    dispatchRealtimeEvent({
      op: 'presence',
      d: { userId: 'me', status: 'DND', platforms: ['web'] },
    }, eventCallbacks, eventServices);

    expect(useAppStore.getState().presenceById).toEqual({ other: 'AWAY' });
    expect(useAppStore.getState().platformsById).toEqual({ other: ['desktop'] });
  });

  it('dispatches call, typing, and watch-party events to their owners', () => {
    const eventCallbacks = callbacks();
    const eventServices = services();
    const party = { channelId: 'voice-1' } as WatchPartyState;

    eventCallbacks.activeVoiceChannelId = 'voice-1';
    dispatchRealtimeEvent({
      op: 'call.ring',
      d: { channelId: 'voice-1', callerId: 'other', callerName: 'Other', callerAvatar: null },
    }, eventCallbacks, eventServices);
    expect(eventCallbacks.onIncomingCall).not.toHaveBeenCalled();

    eventCallbacks.activeVoiceChannelId = null;
    dispatchRealtimeEvent({
      op: 'call.ring',
      d: { channelId: 'voice-1', callerId: 'other', callerName: 'Other', callerAvatar: null },
    }, eventCallbacks, eventServices);
    dispatchRealtimeEvent({
      op: 'typing',
      d: { channelId: 'general', userId: 'other' },
    }, eventCallbacks, eventServices);
    dispatchRealtimeEvent({
      op: 'watchparty.sync',
      d: { channelId: 'voice-1', state: party },
    }, eventCallbacks, eventServices);

    expect(eventCallbacks.onIncomingCall).toHaveBeenCalledWith({
      channelId: 'voice-1',
      callerId: 'other',
      callerName: 'Other',
      callerAvatar: null,
    });
    expect(eventCallbacks.onTyping).toHaveBeenCalledWith('general', 'other', 6000);
    expect(eventCallbacks.onWatchPartySync).toHaveBeenCalledWith('voice-1', party);
  });
});

describe('useRealtimeConnection', () => {
  it('opens the socket, restores subscriptions, and transports presence updates', async () => {
    class FakeWebSocket {
      static OPEN = 1;
      static instances: FakeWebSocket[] = [];
      readyState = 0;
      sent: string[] = [];
      onopen: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;

      constructor(readonly url: string) {
        FakeWebSocket.instances.push(this);
      }

      send(payload: string) {
        this.sent.push(payload);
      }

      close() {
        this.readyState = 3;
        this.onclose?.();
      }

      open() {
        this.readyState = FakeWebSocket.OPEN;
        this.onopen?.();
      }
    }

    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.mocked(api.getWsTicket).mockResolvedValue({ ticket: 'ticket-1', expiresAt: 'later' });
    vi.mocked(api.listMessages).mockResolvedValue([]);
    const onToast = vi.fn();
    const onWatchPartySync = vi.fn();
    const { result, unmount } = renderHook(() => useRealtimeConnection({
      activeVoiceChannelId: null,
      dms: useAppStore.getState().dms,
      onToast,
      onWatchPartySync,
      platform: 'web',
      userId: 'me',
      userStatus: 'ONLINE',
    }));

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const socket = FakeWebSocket.instances[0];
    act(() => socket.open());
    act(() => {
      result.current.subscribe('general');
      result.current.sendPresence('DND', false);
    });

    expect(socket.url).toContain('/ws?ticket=ticket-1&platform=web');
    expect(socket.sent.map((payload) => JSON.parse(payload))).toEqual([
      { op: 'presence.update', d: { status: 'ONLINE' } },
      { op: 'subscribe', d: { channelId: 'dm-1' } },
      { op: 'subscribe', d: { channelId: 'general' } },
      { op: 'presence.update', d: { status: 'DND', transient: false } },
    ]);
    unmount();
  });
});
