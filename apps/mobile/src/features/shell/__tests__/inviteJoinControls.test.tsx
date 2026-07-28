/**
 * inviteJoinControls.test.tsx
 *
 * Verifies that the JoinServerOverlay and InviteCreateOverlay triggers exist in the
 * rendered ShellScreen tree and that invite-create is permission-gated.
 *
 * Before wiring (commit 3ececb9): setJoinServerVisible(true) and setInviteCreateVisible(true)
 * were never called by any UI control — both overlays were built but unreachable.
 *
 * Test 1: rail-join-server button exists in the rail (always rendered)
 * Test 2: invite-create-button exists when active server grants CREATE_INVITE
 * Test 3: invite-create-button is absent when active server lacks CREATE_INVITE
 */
/* eslint-disable no-restricted-syntax */
import renderer from 'react-test-renderer';

// ── Mock native libraries ──

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'Animated.View', Text: 'Animated.Text', createAnimatedComponent: (C: unknown) => C },
  useSharedValue: () => ({ value: 0 }),
  useAnimatedStyle: () => ({}),
  withSpring: (v: number) => v,
  runOnJS: (fn: (...args: unknown[]) => void) => fn,
}));

jest.mock('react-native-gesture-handler', () => ({
  __esModule: true,
  Gesture: {
    Pan: () => ({
      activeOffsetX: () => ({
        failOffsetY: () => ({ onEnd: () => ({}) }),
        onEnd: () => ({}),
      }),
    }),
  },
  GestureDetector: 'GestureDetector',
}));

// ── Build a single server with configurable myPermissions ──

function makeServer(overrides: Partial<{ id: string; name: string; myPermissions: string }> = {}) {
  return {
    id: overrides.id ?? 's1',
    name: overrides.name ?? 'Test Server',
    ownerId: 'u1',
    iconUrl: null,
    myPermissions: overrides.myPermissions ?? '0',
  };
}

const SERVER_WITH_INVITE = [makeServer({ myPermissions: '32' })]; // CREATE_INVITE = 1n << 5n = 32
const SERVER_WITHOUT_INVITE = [makeServer({ myPermissions: '0' })];

// ── Mock app dependencies ──

const mockApiRequest = jest.fn();

jest.mock('../../../stores/session', () => ({
  __esModule: true,
  api: { request: mockApiRequest },
  useSession: (s: (state: Record<string, unknown>) => unknown) =>
    s({ user: { id: 'u1', username: 'alice', displayName: 'Alice', status: 'ONLINE', avatarUrl: null }, logout: jest.fn(), updateProfile: jest.fn() }),
}));

jest.mock('../../../stores/connection', () => ({
  __esModule: true,
  useConnection: () => ({ state: 'connected', everConnected: true }),
}));

jest.mock('../../../realtime', () => ({
  __esModule: true,
  gateway: { start: jest.fn(), stop: jest.fn() },
}));

// Use a real QueryClient so setQueryData works. The module is NOT mocked —
// ShellScreen and the test share the same QueryClient.
const { QueryClient: QC } = require('@tanstack/react-query');
const mockQueryClient = new QC({ defaultOptions: { queries: { retry: false } } });

jest.mock('../../../sync/queryClient', () => ({
  __esModule: true,
  queryClient: mockQueryClient,
}));

jest.mock('../../../lib/storageInstance', () => ({
  __esModule: true,
  storage: () => ({ getJson: jest.fn().mockReturnValue(null), setJson: jest.fn() }),
}));

jest.mock('../../../lib/config', () => ({
  __esModule: true,
  resolveConfig: () => ({ apiBaseUrl: 'http://localhost:3030/api' }),
}));

jest.mock('../../voice/useVoiceConnection', () => ({
  __esModule: true,
  useVoiceConnection: () => ({ join: jest.fn(), connectionState: 'idle' }),
}));

jest.mock('../../avatars', () => ({
  __esModule: true,
  useAvatarUpload: () => ({ busy: false, error: null, pickAndUpload: jest.fn() }),
  AvatarPicker: () => null,
}));

jest.mock('../../channels/hooks', () => ({
  __esModule: true,
  useCreateChannel: () => ({ mutate: jest.fn() }),
  useUpdateChannel: () => ({ mutate: jest.fn() }),
  useDeleteChannel: () => ({ mutate: jest.fn() }),
  useReorderChannels: () => ({ mutate: jest.fn() }),
}));

jest.mock('../../channels/ChannelReorderScreen', () => ({
  __esModule: true,
  ChannelReorderScreen: () => null,
}));

jest.mock('../../inbox', () => ({
  __esModule: true,
  InboxScreen: () => null,
}));

// ── Require app modules after mocks ──

/* eslint-disable @typescript-eslint/no-require-imports */
const { QueryClientProvider } = require('@tanstack/react-query');
const { SafeAreaProvider } = require('react-native-safe-area-context');

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 24, left: 0, right: 0, bottom: 34 },
};

function renderShell(React: typeof import('react'), ShellScreen: React.ComponentType) {
  return React.createElement(
    SafeAreaProvider,
    { initialMetrics: SAFE_AREA_METRICS },
    React.createElement(QueryClientProvider, { client: mockQueryClient }, React.createElement(ShellScreen)),
  );
}

describe('Invite / Join controls are reachable', () => {
  beforeEach(() => {
    mockApiRequest.mockClear();
    mockQueryClient.clear();
  });

  it('rail-join-server button exists in the rendered tree', () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url === '/servers') return Promise.resolve([]);
      return Promise.resolve([]);
    });
    const { ShellScreen } = require('../screens/ShellScreen');
    const React = require('react');
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(renderShell(React, ShellScreen));
    });
    expect(() => tree!.root.findByProps({ testID: 'rail-join-server' })).not.toThrow();
  });

  it('invite-create-button exists when active server grants CREATE_INVITE', async () => {
    // Pre-populate the query cache so useQuery returns data synchronously
    mockQueryClient.setQueryData(['servers'], SERVER_WITH_INVITE);
    const { ShellScreen } = require('../screens/ShellScreen');
    const React = require('react');
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(renderShell(React, ShellScreen));
    });
    // Open the left drawer so the channel-header controls (including invite-create-button) render
    const hamburger = tree!.root.findByProps({ testID: 'hamburger-button' });
    renderer.act(() => {
      hamburger.props.onPress();
    });
    // activeServer auto-selects servers.data[0] when no server is explicitly chosen
    expect(() => tree!.root.findByProps({ testID: 'invite-create-button' })).not.toThrow();
  });

  it('invite-create-button is absent when active server lacks CREATE_INVITE', () => {
    mockQueryClient.setQueryData(['servers'], SERVER_WITHOUT_INVITE);
    const { ShellScreen } = require('../screens/ShellScreen');
    const React = require('react');
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(renderShell(React, ShellScreen));
    });
    expect(() => tree!.root.findByProps({ testID: 'invite-create-button' })).toThrow();
  });
});
