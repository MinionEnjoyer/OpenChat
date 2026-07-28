/**
 * App push wiring test (FR-NOTIF-002).
 *
 * Verifies that App.tsx calls initializePush() when the session status
 * transitions to 'signedIn'. This is the critical wiring that connects
 * the push notification client to app startup.
 *
 * @satisfies FR-NOTIF-002
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';

// ── Mock native gesture handler (needed by GestureHandlerRootView) ──

jest.mock('react-native-gesture-handler', () => {
  const View = require('react-native').View;
  return {
    __esModule: true,
    default: {
      install: jest.fn(),
      Directions: {},
    },
    GestureHandlerRootView: View,
    GestureDetector: 'GestureDetector',
    Gesture: {},
    State: {},
  };
});

// ── Mock push module (the thing we're testing the wiring of) ──

const mockInitializePush = jest.fn().mockResolvedValue(undefined);
const mockInitLocalNotifications = jest.fn().mockResolvedValue(undefined);

jest.mock('../features/notifications', () => ({
  __esModule: true,
  initializePush: (...args: unknown[]) => mockInitializePush(...args),
  initLocalNotifications: (...args: unknown[]) => mockInitLocalNotifications(...args),
}));

// ── Mock session store — controls the auth state ──

const mockSessionState: Record<string, unknown> = {
  status: 'signedIn',
  restore: jest.fn(),
  logout: jest.fn(),
  user: null,
};

jest.mock('../stores/session', () => ({
  __esModule: true,
  api: { request: jest.fn() },
  useSession: (s: (state: Record<string, unknown>) => unknown) => s(mockSessionState),
}));

// ── Mock app dependencies ──

jest.mock('../sync/queryClient', () => ({
  __esModule: true,
  queryClient: { invalidateQueries: jest.fn() },
}));

jest.mock('../features/auth', () => ({
  __esModule: true,
  LoginScreen: () => null,
}));

jest.mock('../features/shell', () => ({
  __esModule: true,
  ShellScreen: () => null,
}));

jest.mock('../ui/Toast', () => ({
  __esModule: true,
  ToastHost: () => null,
}));

jest.mock('../ui/tokens', () => ({
  __esModule: true,
  palette: { bg: '#000', accent: '#fff' },
}));

// ── Import after mocks ──

import App from '../../App';

// ── Tests ──

describe('App push wiring (FR-NOTIF-002)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionState.status = 'signedIn';
    mockSessionState.restore = jest.fn();
  });

  // @satisfies FR-NOTIF-002
  it('calls initializePush when session is signedIn', async () => {
    await act(async () => {
      renderer.create(<App />);
      // Flush microtasks queued by useEffect
      await Promise.resolve();
      await Promise.resolve();
    });

    // The useEffect([status]) fires on mount when status === 'signedIn'
    expect(mockInitializePush).toHaveBeenCalledTimes(1);
  });

  // @satisfies FR-NOTIF-002
  it('does NOT call initializePush when session is signedOut', async () => {
    mockSessionState.status = 'signedOut';

    await act(async () => {
      renderer.create(<App />);
    });

    expect(mockInitializePush).not.toHaveBeenCalled();
  });

  // @satisfies FR-NOTIF-002
  it('does NOT call initializePush when session is restoring', async () => {
    mockSessionState.status = 'restoring';

    await act(async () => {
      renderer.create(<App />);
    });

    expect(mockInitializePush).not.toHaveBeenCalled();
  });
});
