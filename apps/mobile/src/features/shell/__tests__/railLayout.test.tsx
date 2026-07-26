/**
 * Rail overflow layout test.
 *
 * Verifies that rail-create-server and rail-friends remain present in the rendered tree
 * when many servers are loaded, and that the rail layout has flex constraints to prevent
 * the FlatList from greedily consuming all vertical space and collapsing the bottom controls.
 *
 * Test 1 (structural): bottom controls exist with 25 servers.
 * Test 2 (overflow prevention): rail View has flex: 1 — the key constraint that makes
 *   the FlatList scroll within remaining space instead of pushing bottom controls off-screen.
 *   MUST FAIL before the fix (rail has no flex, FlatList has no style).
 */
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

// ── Generate many fake servers ──

const MANY_SERVERS = Array.from({ length: 25 }, (_, i) => ({
  id: `server-${i}`,
  name: `Server ${i}`,
  ownerId: 'u1',
  iconUrl: null,
  myPermissions: 0,
}));

// api.request returns many servers for /servers, empty arrays for others
const mockApiRequest = jest.fn((url: string) => {
  if (url === '/servers') return Promise.resolve(MANY_SERVERS);
  return Promise.resolve([]);
});

// ── Mock app dependencies ──

jest.mock('../../../stores/session', () => ({
  __esModule: true,
  api: { request: mockApiRequest },
  useSession: (s: (state: Record<string, unknown>) => unknown) => s({ user: { id: 'u1', username: 'alice', displayName: 'Alice', status: 'ONLINE', avatarUrl: null }, logout: jest.fn(), updateProfile: jest.fn() }),
}));

jest.mock('../../../stores/connection', () => ({
  __esModule: true,
  useConnection: () => ({ state: 'connected', everConnected: true }),
}));

jest.mock('../../../realtime', () => ({
  __esModule: true,
  gateway: { start: jest.fn(), stop: jest.fn() },
}));

jest.mock('../../../sync/queryClient', () => ({
  __esModule: true,
  queryClient: { invalidateQueries: jest.fn() },
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

// ── Wrap ShellScreen in QueryClientProvider + SafeAreaProvider ──

/* eslint-disable @typescript-eslint/no-require-imports */
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { SafeAreaProvider } = require('react-native-safe-area-context');
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 24, left: 0, right: 0, bottom: 34 },
};

function renderShell(React: typeof import('react'), ShellScreen: React.ComponentType) {
  return React.createElement(SafeAreaProvider, { initialMetrics: SAFE_AREA_METRICS },
    React.createElement(QueryClientProvider, { client: qc },
      React.createElement(ShellScreen),
    ),
  );
}

describe('Rail overflow — bottom controls survive many servers', () => {
  it('rail-create-server and rail-friends exist with 25 servers', () => {
    const { ShellScreen } = require('../screens/ShellScreen');
    const React = require('react');
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(renderShell(React, ShellScreen));
    });
    const root = tree!.root;

    // Bottom controls must be present even when many servers overflow.
    expect(() => root.findByProps({ testID: 'rail-create-server' })).not.toThrow();
    expect(() => root.findByProps({ testID: 'rail-friends' })).not.toThrow();
  });

  it('rail View has flex: 1 to constrain FlatList from overflowing', () => {
    const { ShellScreen } = require('../screens/ShellScreen');
    const React = require('react');
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(renderShell(React, ShellScreen));
    });
    const root = tree!.root;

    const rail = root.findByProps({ testID: 'server-rail' });
    // The rail must have flex: 1 so the FlatList scrolls within remaining space
    // instead of greedily consuming all vertical space and collapsing bottom controls.
    const railStyle = rail.props.style;
    // Style can be an array — flatten it
    const flatStyle = Array.isArray(railStyle)
      ? Object.assign({}, ...railStyle.filter(Boolean))
      : railStyle;
    expect(flatStyle.flex).toBe(1);
  });
});
