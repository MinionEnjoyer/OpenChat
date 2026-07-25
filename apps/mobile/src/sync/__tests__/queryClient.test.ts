/**
 * Integration test: applyEvent → handleForegroundNotification (FR-NOTIF-004).
 *
 * Verifies that WS notification frames (notify, mention, call.ring) are
 * correctly routed through handleForegroundNotification to the toast system.
 *
 * @satisfies FR-NOTIF-004
 */

// ── Mock showToast before any imports ──
const toastCalls: { message: string; retry?: () => void }[] = [];

jest.mock('../../ui/Toast', () => ({
  showToast: (message: string, retry?: () => void) => {
    toastCalls.push({ message, retry });
  },
}));

import { applyEvent } from '../queryClient';
import {
  _setAppStateForTest,
  _resetAppStateForTest,
} from '../../features/notifications/foregroundHandler';
import type {
  MentionFrame,
  NotifyFrame,
  CallRingFrame,
} from '../../realtime/events.d';

beforeEach(() => {
  toastCalls.length = 0;
  _setAppStateForTest('active');
});

afterAll(() => {
  _resetAppStateForTest();
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
    _setAppStateForTest('background');
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
    _setAppStateForTest('background');
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
