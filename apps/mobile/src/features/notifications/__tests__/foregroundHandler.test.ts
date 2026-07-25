/**
 * FR-NOTIF-004 — In-app foreground notification handling unit tests.
 *
 * These tests verify that when the app is in the foreground:
 *   - push notifications are suppressed (return true)
 *   - an in-app toast is shown with the correct message
 *
 * When the app is in the background:
 *   - the handler returns false (let the OS show the native notification)
 *   - no toast is shown
 *
 * @satisfies FR-NOTIF-004
 */
import {
  handleForegroundNotification,
  _setAppStateForTest,
  _resetAppStateForTest,
} from '../foregroundHandler';
import type { MentionPayload, CallRingPayload, NotifyPayload } from '../foregroundHandler';

// ── Mock showToast ──

const toastCalls: { message: string; retry?: () => void }[] = [];

jest.mock('../../../ui/Toast', () => ({
  showToast: (message: string, retry?: () => void) => {
    toastCalls.push({ message, retry });
  },
}));

beforeEach(() => {
  toastCalls.length = 0;
  _setAppStateForTest('active');
});

afterAll(() => {
  _resetAppStateForTest();
});

// ── Helpers ──

function makeMention(overrides: Partial<MentionPayload> = {}): MentionPayload {
  return {
    kind: 'mention',
    channelName: 'general',
    authorName: 'alice',
    preview: 'hey check this out',
    ...overrides,
  };
}

function makeCallRing(overrides: Partial<CallRingPayload> = {}): CallRingPayload {
  return {
    kind: 'call.ring',
    callerName: 'bob',
    ...overrides,
  };
}

function makeNotify(): NotifyPayload {
  return { kind: 'notify' };
}

// ── Foreground tests ──

describe('handleForegroundNotification — foreground (FR-NOTIF-004)', () => {
  // @satisfies FR-NOTIF-004
  it('returns true for mention (suppress native push)', () => {
    const result = handleForegroundNotification(makeMention());
    expect(result).toBe(true);
  });

  // @satisfies FR-NOTIF-004
  it('shows a mention toast with author, channel, and preview', () => {
    handleForegroundNotification(makeMention({
      authorName: 'alice',
      channelName: 'general',
      preview: 'hello world',
    }));
    expect(toastCalls).toHaveLength(1);
    expect(toastCalls[0]!.message).toContain('alice');
    expect(toastCalls[0]!.message).toContain('#general');
    expect(toastCalls[0]!.message).toContain('hello world');
  });

  // @satisfies FR-NOTIF-004 — A naive implementation that hardcodes the author name
  // would pass for one test case but fail for another. This test catches that bug.
  it('shows correct author name — not a hardcoded value', () => {
    handleForegroundNotification(makeMention({ authorName: 'charlie' }));
    expect(toastCalls[0]!.message).toContain('charlie');
    expect(toastCalls[0]!.message).not.toContain('alice');
  });

  // @satisfies FR-NOTIF-004
  it('returns true for call.ring (suppress native push)', () => {
    const result = handleForegroundNotification(makeCallRing());
    expect(result).toBe(true);
  });

  // @satisfies FR-NOTIF-004
  it('shows a call-ring toast with caller name', () => {
    handleForegroundNotification(makeCallRing({ callerName: 'bob' }));
    expect(toastCalls).toHaveLength(1);
    expect(toastCalls[0]!.message).toContain('bob');
  });

  // @satisfies FR-NOTIF-004 — catch naive hardcode
  it('call.ring toast shows the actual caller, not a hardcoded name', () => {
    handleForegroundNotification(makeCallRing({ callerName: 'dave' }));
    expect(toastCalls[0]!.message).toContain('dave');
    expect(toastCalls[0]!.message).not.toContain('bob');
  });

  // @satisfies FR-NOTIF-004
  it('returns true for notify (suppress native push)', () => {
    const result = handleForegroundNotification(makeNotify());
    expect(result).toBe(true);
  });

  // @satisfies FR-NOTIF-004
  it('shows a generic notification toast for notify events', () => {
    handleForegroundNotification(makeNotify());
    expect(toastCalls).toHaveLength(1);
    expect(toastCalls[0]!.message).toBeTruthy();
  });

  // @satisfies FR-NOTIF-004 — toast is NOT a retry toast (no retry callback)
  it('foreground notification toasts have no retry callback', () => {
    handleForegroundNotification(makeMention());
    expect(toastCalls[0]!.retry).toBeUndefined();
  });

  // @satisfies FR-NOTIF-004 — Each distinct notification is a separate toast
  it('each notification produces exactly one toast (no batching)', () => {
    handleForegroundNotification(makeMention({ authorName: 'alice' }));
    handleForegroundNotification(makeCallRing({ callerName: 'bob' }));
    expect(toastCalls).toHaveLength(2);
    expect(toastCalls[0]!.message).toContain('alice');
    expect(toastCalls[1]!.message).toContain('bob');
  });
});

// ── Background / inactive tests ──

describe('handleForegroundNotification — background/inactive', () => {
  beforeEach(() => {
    toastCalls.length = 0;
  });

  // @satisfies FR-NOTIF-004
  it('returns false when app is in background (let OS show native)', () => {
    _setAppStateForTest('background');
    const result = handleForegroundNotification(makeMention());
    expect(result).toBe(false);
  });

  // @satisfies FR-NOTIF-004
  it('shows NO toast when app is in background', () => {
    _setAppStateForTest('background');
    handleForegroundNotification(makeMention());
    expect(toastCalls).toHaveLength(0);
  });

  // @satisfies FR-NOTIF-004
  it('returns false when app is inactive (transitioning)', () => {
    _setAppStateForTest('inactive');
    const result = handleForegroundNotification(makeMention());
    expect(result).toBe(false);
  });

  // @satisfies FR-NOTIF-004
  it('shows NO toast when app is inactive', () => {
    _setAppStateForTest('inactive');
    handleForegroundNotification(makeCallRing());
    expect(toastCalls).toHaveLength(0);
  });
});

// ── Naive-implementation bug catchers ──

describe('handleForegroundNotification — naive-implementation traps', () => {
  beforeEach(() => {
    toastCalls.length = 0;
    _setAppStateForTest('active');
  });

  // A naive implementation might return true even in background. This proves
  // the foreground check is real.
  // @satisfies FR-NOTIF-004
  it('mention in background MUST NOT return true (naive would always return true)', () => {
    _setAppStateForTest('background');
    const result = handleForegroundNotification(makeMention());
    // If a naive implementation just always returns true, this fails.
    expect(result).toBe(false);
  });

  // A naive implementation might always show the same message regardless of payload.
  // @satisfies FR-NOTIF-004
  it('mention and call.ring produce DIFFERENT toast messages', () => {
    handleForegroundNotification(makeMention({ authorName: 'alice' }));
    const mentionMsg = toastCalls[0]!.message;
    toastCalls.length = 0;
    handleForegroundNotification(makeCallRing({ callerName: 'bob' }));
    const ringMsg = toastCalls[0]!.message;
    expect(mentionMsg).not.toBe(ringMsg);
  });

  // A naive implementation might show no toast at all (just return true).
  // @satisfies FR-NOTIF-004
  it('foreground mention MUST call showToast (naive might skip toast)', () => {
    handleForegroundNotification(makeMention());
    expect(toastCalls.length).toBeGreaterThan(0);
  });
});
