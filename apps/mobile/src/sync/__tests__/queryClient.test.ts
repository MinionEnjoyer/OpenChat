/**
 * Integration test: applyEvent → handleForegroundNotification (FR-NOTIF-004).
 *
 * Verifies that WS notification frames (notify, mention, call.ring) are
 * correctly routed through handleForegroundNotification to the toast system
 * and that call.ring also populates the CallStore (FR-VOX-005).
 *
 * @satisfies FR-NOTIF-004, FR-VOX-005
 */

import { applyEvent, queryClient } from '../queryClient';
import {
  _setAppStateForTest as _setFgState,
  _resetAppStateForTest as _resetFgState,
} from '../../features/notifications/foregroundHandler';
import {
  _setAppStateForTest as _setLocalState,
  _resetAppStateForTest as _resetLocalState,
} from '../../features/notifications/localNotify';
import * as localNotify from '../../features/notifications/localNotify';
import { useSession } from '../../stores/session';
import { useCallStore } from '../../features/voice/CallStore';
import type {
  MentionFrame,
  NotifyFrame,
  CallRingFrame,
  MessageCreatedFrame,
} from '../../realtime/events.d';

// ── Mock showToast after all imports (Jest hoists jest.mock above imports) ──
const toastCalls: { message: string; retry?: () => void }[] = [];

jest.mock('../../ui/Toast', () => ({
  showToast: (message: string, retry?: () => void) => {
    toastCalls.push({ message, retry });
  },
}));

beforeEach(() => {
  toastCalls.length = 0;
  _setFgState('active');
  _setLocalState('active');
  useCallStore.setState({ incomingCall: null });
  queryClient.clear();
  useSession.setState({
    status: 'signedIn',
    user: {
      id: 'user-me',
      username: 'me',
      displayName: 'Me',
      avatarUrl: null,
      status: 'online',
      friendCode: null,
    },
    tokens: null as any,
  });
});

afterAll(() => {
  _resetFgState();
  _resetLocalState();
  useSession.setState({ status: 'signedOut', user: null, tokens: null });
});

// ── Integration tests ──

describe('applyEvent — notification routing (FR-NOTIF-004)', () => {
  // @satisfies FR-NOTIF-004
  it('routes mention frame to foreground handler → toast', () => {
    const frame: MentionFrame = {
      op: 'mention',
      d: {
        channelId: 'c1',
        messageId: 'm1',
        channelName: 'general',
        authorName: 'alice',
        preview: 'hey there',
      },
    };
    applyEvent(frame);
    expect(toastCalls).toHaveLength(1);
    expect(toastCalls[0]!.message).toContain('alice');
    expect(toastCalls[0]!.message).toContain('#general');
    expect(toastCalls[0]!.message).toContain('hey there');
    expect(toastCalls[0]!.retry).toBeUndefined();
  });

  // @satisfies FR-NOTIF-004
  it('routes call.ring frame to foreground handler → toast', () => {
    const frame: CallRingFrame = {
      op: 'call.ring',
      d: {
        channelId: 'c1',
        callerId: 'u1',
        callerName: 'bob',
        callerAvatar: null,
      },
    };
    applyEvent(frame);
    expect(toastCalls).toHaveLength(1);
    expect(toastCalls[0]!.message).toContain('bob');
    expect(toastCalls[0]!.retry).toBeUndefined();
  });

  // @satisfies FR-VOX-005
  it('call.ring frame populates the incoming call store', () => {
    const frame: CallRingFrame = {
      op: 'call.ring',
      d: {
        channelId: 'dm-42',
        callerId: 'user-alice',
        callerName: 'Alice',
        callerAvatar: 'https://cdn.test/alice.png',
      },
    };
    applyEvent(frame);
    expect(useCallStore.getState().incomingCall).toEqual({
      channelId: 'dm-42',
      callerId: 'user-alice',
      callerName: 'Alice',
      callerAvatar: 'https://cdn.test/alice.png',
    });
  });

  // @satisfies FR-NOTIF-004
  it('routes notify frame to foreground handler → toast', () => {
    const frame: NotifyFrame = {
      op: 'notify',
      d: {},
    };
    applyEvent(frame);
    expect(toastCalls).toHaveLength(1);
    expect(toastCalls[0]!.message).toBeTruthy();
    expect(toastCalls[0]!.retry).toBeUndefined();
  });

  // @satisfies FR-NOTIF-004
  it('suppresses toast when app is in background', () => {
    _setFgState('background');
    _setLocalState('background');
    const frame: MentionFrame = {
      op: 'mention',
      d: {
        channelId: 'c1',
        messageId: 'm1',
        channelName: 'general',
        authorName: 'alice',
        preview: 'hey',
      },
    };
    applyEvent(frame);
    expect(toastCalls).toHaveLength(0);
  });

  // @satisfies FR-NOTIF-004 — naive-implementation trap:
  // A naive implementer might always call showToast regardless of app state.
  // This test proves the foreground check gates the toast end-to-end.
  it('background mention MUST NOT show toast (naive would always toast)', () => {
    _setFgState('background');
    _setLocalState('background');
    const frame: MentionFrame = {
      op: 'mention',
      d: {
        channelId: 'c1',
        messageId: 'm1',
        channelName: 'off-topic',
        authorName: 'charlie',
        preview: 'secret',
      },
    };
    applyEvent(frame);
    // Integration-level check: if applyEvent bypassed handleForegroundNotification,
    // this would show a toast.
    expect(toastCalls).toHaveLength(0);
  });
});

// ── Integration bridge: applyEvent → notifyIncoming (WO-NOTIF-LOCAL) ──
//
// These tests assert the wiring itself: removing notifyIncoming(frame) from
// queryClient.ts MUST cause these tests to fail.
describe('applyEvent — notifyIncoming bridge (WO-NOTIF-LOCAL integration)', () => {
  let spy: jest.SpyInstance;

  beforeEach(() => {
    spy = jest
      .spyOn(localNotify, 'notifyIncoming')
      .mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    spy.mockRestore();
  });

  // @satisfies WO-NOTIF-LOCAL
  it('calls notifyIncoming with message.created frame', () => {
    const frame: MessageCreatedFrame = {
      op: 'message.created',
      d: {
        message: {
          id: 'msg-1',
          channelId: 'ch-1',
          authorId: 'user-alice',
          author: {
            id: 'user-alice',
            username: 'alice',
            displayName: 'Alice',
            avatarUrl: null,
            status: null,
          },
          content: 'Hello!',
          nonce: null,
          editedAt: null,
          deletedAt: null,
          replyToId: null,
          replyTo: null,
          attachments: [],
          reactions: [],
          pinned: false,
          poll: null,
          createdAt: '2026-07-27T00:00:00.000Z',
        },
      },
    };
    applyEvent(frame);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(frame);
  });

  // @satisfies WO-NOTIF-LOCAL
  it('calls notifyIncoming with mention frame', () => {
    const frame: MentionFrame = {
      op: 'mention',
      d: {
        channelId: 'ch-1',
        messageId: 'msg-mention-1',
        channelName: 'general',
        authorName: 'Alice',
        preview: 'hey @me check this',
      },
    };
    applyEvent(frame);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(frame);
  });

  // @satisfies WO-NOTIF-LOCAL
  it('calls notifyIncoming exactly once per frame', () => {
    const frame: MessageCreatedFrame = {
      op: 'message.created',
      d: {
        message: {
          id: 'msg-1',
          channelId: 'ch-1',
          authorId: 'user-alice',
          author: {
            id: 'user-alice',
            username: 'alice',
            displayName: 'Alice',
            avatarUrl: null,
            status: null,
          },
          content: 'Hello!',
          nonce: null,
          editedAt: null,
          deletedAt: null,
          replyToId: null,
          replyTo: null,
          attachments: [],
          reactions: [],
          pinned: false,
          poll: null,
          createdAt: '2026-07-27T00:00:00.000Z',
        },
      },
    };
    applyEvent(frame);
    applyEvent(frame);
    applyEvent(frame);
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
