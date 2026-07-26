/**
 * channelHeaderCollapsed.test.tsx
 *
 * Verifies that the channel-header controls (server-settings-button, notif-settings-button,
 * invite-create-button) do NOT render when the left drawer is collapsed.
 *
 * Bug: with the drawer collapsed, these controls rendered on top of the hamburger menu
 * because they were inside the Animated.View that was only translated off-screen (not
 * conditionally rendered). The controls belong to the channel/server drawer and should
 * only render when leftOpenJS is true.
 *
 * Test 1 (MUST FAIL before fix): controls absent when drawer starts collapsed
 * Test 2 (MUST PASS): controls appear after hamburger press opens the drawer
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

// ── Server with CREATE_INVITE permission ──

const SERVER_WITH_INVITE = [{
  id: 's1',
  name: 'Test Server',
  ownerId: 'u1',
  iconUrl: null,
  myPermissions: '40', // CREATE_INVITE (32) | MANAGE_ROLES (8) = 40
}];

// ── Mock app dependencies ──

const mockApiRequest = jest.fn((url: string) => {
  if (url === '/servers') return Promise.resolve([]);
  return Promise.resolve([]);
});

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

describe('Channel header controls — collapsed drawer', () => {
  beforeEach(() => {
    mockApiRequest.mockClear();
    mockQueryClient.clear();
  });

  it('controls do NOT render when drawer is collapsed (leftOpenJS=false)', () => {
    mockQueryClient.setQueryData(['servers'], SERVER_WITH_INVITE);
    const { ShellScreen } = require('../screens/ShellScreen');
    const React = require('react');
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(renderShell(React, ShellScreen));
    });

    // All three channel-header controls must be absent when drawer is collapsed.
    // Before the fix, these would be present — the bug is that they rendered
    // on top of the hamburger when the drawer was supposedly off-screen.
    expect(() => tree!.root.findByProps({ testID: 'server-settings-button' })).toThrow();
    expect(() => tree!.root.findByProps({ testID: 'notif-settings-button' })).toThrow();
    expect(() => tree!.root.findByProps({ testID: 'invite-create-button' })).toThrow();
    expect(() => tree!.root.findByProps({ testID: 'roles-editor-button' })).toThrow();
  });

  it('controls appear after hamburger press opens the drawer', () => {
    mockQueryClient.setQueryData(['servers'], SERVER_WITH_INVITE);
    const { ShellScreen } = require('../screens/ShellScreen');
    const React = require('react');
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(renderShell(React, ShellScreen));
    });

    // Open the drawer by pressing the hamburger
    const hamburger = tree!.root.findByProps({ testID: 'hamburger-button' });
    renderer.act(() => {
      hamburger.props.onPress();
    });

    // Now the drawer is open — all four controls should be present.
    expect(() => tree!.root.findByProps({ testID: 'server-settings-button' })).not.toThrow();
    expect(() => tree!.root.findByProps({ testID: 'notif-settings-button' })).not.toThrow();
    expect(() => tree!.root.findByProps({ testID: 'invite-create-button' })).not.toThrow();
    expect(() => tree!.root.findByProps({ testID: 'roles-editor-button' })).not.toThrow();
  });

  it('all four permission-gated controls render with both CREATE_INVITE and MANAGE_ROLES', () => {
    // Regression: when all controls are present, they must all render —
    // before the glyph fix, text labels + gear + bell overflowed the
    // 280px drawer and visually collided.
    mockQueryClient.setQueryData(['servers'], SERVER_WITH_INVITE);
    const { ShellScreen } = require('../screens/ShellScreen');
    const React = require('react');
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(renderShell(React, ShellScreen));
    });

    const hamburger = tree!.root.findByProps({ testID: 'hamburger-button' });
    renderer.act(() => {
      hamburger.props.onPress();
    });

    expect(() => tree!.root.findByProps({ testID: 'server-settings-button' })).not.toThrow();
    expect(() => tree!.root.findByProps({ testID: 'notif-settings-button' })).not.toThrow();
    expect(() => tree!.root.findByProps({ testID: 'invite-create-button' })).not.toThrow();
    expect(() => tree!.root.findByProps({ testID: 'roles-editor-button' })).not.toThrow();
  });

  it('drawerTitle has flexShrink:1 to yield space to header controls', () => {
    mockQueryClient.setQueryData(['servers'], SERVER_WITH_INVITE);
    const { ShellScreen } = require('../screens/ShellScreen');
    const React = require('react');
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(renderShell(React, ShellScreen));
    });

    const title = tree!.root.findByProps({ testID: 'channel-drawer-title' });
    const titleStyle = title.props.style;
    const flatStyle = Array.isArray(titleStyle)
      ? Object.assign({}, ...titleStyle.filter(Boolean))
      : titleStyle;
    // flexShrink: 1 allows the title to truncate instead of pushing
    // controls out of the 280px drawer.
    expect(flatStyle.flexShrink).toBe(1);
  });

  it('hamburger and channel-drawer-title always render regardless of drawer state', () => {
    mockQueryClient.setQueryData(['servers'], SERVER_WITH_INVITE);
    const { ShellScreen } = require('../screens/ShellScreen');
    const React = require('react');
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(renderShell(React, ShellScreen));
    });

    // These are structural elements that should always be in the tree.
    expect(() => tree!.root.findByProps({ testID: 'hamburger-button' })).not.toThrow();
    expect(() => tree!.root.findByProps({ testID: 'channel-drawer-title' })).not.toThrow();
  });
});
