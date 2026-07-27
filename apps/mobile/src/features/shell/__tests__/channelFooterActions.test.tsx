/**
 * channelFooterActions.test.tsx
 *
 * Verifies that the server-action buttons (create-channel, reorder-channels,
 * invite-create, roles-editor) render in the drawer footer, below the channel
 * list, as proper buttons — not as server-rail items.
 *
 * Test 1: invite + roles render when CREATE_INVITE + MANAGE_ROLES granted.
 * Test 2: invite + roles absent when permissions are NOT granted.
 * Test 3: all four footer buttons survive with many channels (structural).
 * Test 4: ChannelList root has flex:1 (scroll constraint keeps footer pinned).
 * Test 5: footer buttons styled as buttons (borderRadius:6), not rail items.
 * Test 6: header crowding fix from 705f1ae still green (drawerTitle flexShrink:1).
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

// ── Server fixtures ──

const SERVER_WITH_PERMS = [{
  id: 's1',
  name: 'Test Server',
  ownerId: 'u1',
  iconUrl: null,
  myPermissions: '40', // CREATE_INVITE (32) | MANAGE_ROLES (8) = 40
}];

const SERVER_NO_PERMS = [{
  id: 's1',
  name: 'Test Server',
  ownerId: 'u1',
  iconUrl: null,
  myPermissions: '0',
}];

// ── Mock app dependencies ──

const mockApiRequest = jest.fn((_url: string) => Promise.resolve([]));

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
  gateway: { start: jest.fn(), stop: jest.fn(), subscribe: jest.fn(), unsubscribe: jest.fn() },
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

describe('Channel footer — server-action buttons', () => {
  beforeEach(() => {
    mockQueryClient.clear();
  });

  // ── Test 1: permission-gated buttons render when granted ──

  it('invite-create-button and roles-editor-button render with CREATE_INVITE + MANAGE_ROLES', () => {
    mockQueryClient.setQueryData(['servers'], SERVER_WITH_PERMS);
    const { ShellScreen } = require('../screens/ShellScreen');
    const React = require('react');
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(renderShell(React, ShellScreen));
    });

    const root = tree!.root;
    expect(() => root.findByProps({ testID: 'invite-create-button' })).not.toThrow();
    expect(() => root.findByProps({ testID: 'roles-editor-button' })).not.toThrow();
  });

  // ── Test 2: permission-gated buttons absent when not granted ──

  it('invite-create-button and roles-editor-button absent without permissions', () => {
    mockQueryClient.setQueryData(['servers'], SERVER_NO_PERMS);
    const { ShellScreen } = require('../screens/ShellScreen');
    const React = require('react');
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(renderShell(React, ShellScreen));
    });

    const root = tree!.root;
    expect(() => root.findByProps({ testID: 'invite-create-button' })).toThrow();
    expect(() => root.findByProps({ testID: 'roles-editor-button' })).toThrow();
  });

  // ── Test 3: all footer buttons survive with many channels ──

  it('create-channel, reorder-channels, invite-create, roles-editor survive 25 channels', () => {
    const MANY_CHANNELS = Array.from({ length: 25 }, (_, i) => ({
      id: `ch-${i}`,
      name: `channel-${i}`,
      type: 'TEXT' as const,
      serverId: 's1',
      position: i,
      categoryId: null,
      topic: null,
    }));
    mockQueryClient.setQueryData(['servers'], SERVER_WITH_PERMS);
    mockQueryClient.setQueryData(['channels', 's1'], MANY_CHANNELS);
    const { ShellScreen } = require('../screens/ShellScreen');
    const React = require('react');
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(renderShell(React, ShellScreen));
    });

    const root = tree!.root;
    // All four footer buttons must be present even with many channels.
    expect(() => root.findByProps({ testID: 'create-channel-button' })).not.toThrow();
    expect(() => root.findByProps({ testID: 'reorder-channels-button' })).not.toThrow();
    expect(() => root.findByProps({ testID: 'invite-create-button' })).not.toThrow();
    expect(() => root.findByProps({ testID: 'roles-editor-button' })).not.toThrow();
  });

  // ── Test 4: ChannelList root has flex:1 for scroll constraint ──

  it('ChannelList root View has flex:1 so footer stays pinned below scrollable list', () => {
    mockQueryClient.setQueryData(['servers'], SERVER_WITH_PERMS);
    const { ShellScreen } = require('../screens/ShellScreen');
    const React = require('react');
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(renderShell(React, ShellScreen));
    });

    const root = tree!.root;
    // Find the channel-list testID — this is the ChannelList root View
    const channelListRoot = root.findByProps({ testID: 'channel-list' });
    const listStyle = channelListRoot.props.style;
    const flatListStyle = Array.isArray(listStyle)
      ? Object.assign({}, ...listStyle.filter(Boolean))
      : listStyle;
    // flex: 1 ensures ChannelList scrolls within remaining space,
    // keeping the footer buttons pinned below.
    expect(flatListStyle.flex).toBe(1);
  });

  // ── Test 5: Footer buttons are styled as buttons, not rail items ──

  it('footer buttons use actionButton style (borderRadius:6), not railItem (borderRadius:24)', () => {
    mockQueryClient.setQueryData(['servers'], SERVER_WITH_PERMS);
    const { ShellScreen } = require('../screens/ShellScreen');
    const React = require('react');
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(renderShell(React, ShellScreen));
    });

    const root = tree!.root;
    const inviteBtn = root.findByProps({ testID: 'invite-create-button' });
    const btnStyle = inviteBtn.props.style;
    // actionButton has borderRadius: 6, not 24 (railItem).
    expect(btnStyle.borderRadius).toBe(6);
  });

  // ── Test 6: header relief — drawerTitle still has flexShrink:1 ──

  it('drawerTitle retains flexShrink:1 (header crowding fix from 705f1ae still green)', () => {
    mockQueryClient.setQueryData(['servers'], SERVER_WITH_PERMS);
    const { ShellScreen } = require('../screens/ShellScreen');
    const React = require('react');
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(renderShell(React, ShellScreen));
    });

    const root = tree!.root;
    const title = root.findByProps({ testID: 'channel-drawer-title' });
    const titleStyle = title.props.style;
    const flatStyle = Array.isArray(titleStyle)
      ? Object.assign({}, ...titleStyle.filter(Boolean))
      : titleStyle;
    expect(flatStyle.flexShrink).toBe(1);
  });
});
