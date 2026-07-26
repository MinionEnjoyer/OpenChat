/**
 * SoundboardPanel component tests (FR-SOUND-001).
 *
 * Validates: renders from API response, tap triggers local playback,
 * tap calls the publish seam, empty state, fetch-error state, testID contract.
 *
 * @satisfies FR-SOUND-001
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { ServerSound } from '../../../api/schema';

// ── Mocks ──

const mockPlay = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-audio', () => ({
  useAudioPlayer: jest.fn(() => ({ play: mockPlay, replace: mockReplace })),
}));

const mockApiRequest = jest.fn();
jest.mock('../../../stores/session', () => ({
  api: { request: mockApiRequest },
}));

const mockPublishSoundToRoom = jest.fn();
jest.mock('../publishSeam', () => ({
  publishSoundToRoom: mockPublishSoundToRoom,
}));

// Lazy import after mocks — mocked hooks must be in place first.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SoundboardPanel } = require('../SoundboardPanel');
type SoundboardPanelProps = React.ComponentProps<typeof SoundboardPanel>;

// ── Helpers ──

function sound(overrides: Partial<ServerSound> = {}): ServerSound {
  return {
    id: 'sound-1',
    name: 'Airhorn',
    url: 'https://example.com/airhorn.mp3',
    emoji: '📢',
    ...overrides,
  };
}

function render(props: SoundboardPanelProps): TestRenderer.ReactTestRenderer {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(SoundboardPanel, props, null));
  });
  return renderer;
}

// ── Tests ──

describe('SoundboardPanel (FR-SOUND-001)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiRequest.mockResolvedValue([]);
  });

  describe('loading state', () => {
    it('shows loading indicator while fetching', () => {
      mockApiRequest.mockReturnValue(new Promise(() => {}));
      const tree = render({ serverId: 'srv-1' });
      const loading = tree.root.findByProps({ testID: 'soundboard-loading' });
      expect(loading).toBeTruthy();
    });
  });

  describe('loaded state with sounds', () => {
    it('renders the panel container', async () => {
      mockApiRequest.mockResolvedValue([sound()]);
      const tree = render({ serverId: 'srv-1' });
      await act(async () => {
        await Promise.resolve();
      });
      const panel = tree.root.findByProps({ testID: 'soundboard-panel' });
      expect(panel).toBeTruthy();
    });

    it('renders a button for each sound', async () => {
      const s1 = sound({ id: 's1', name: 'Airhorn' });
      const s2 = sound({ id: 's2', name: 'Clap' });
      mockApiRequest.mockResolvedValue([s1, s2]);
      const tree = render({ serverId: 'srv-1' });
      await act(async () => {
        await Promise.resolve();
      });

      const btn1 = tree.root.findByProps({ testID: 'soundboard-btn-s1' });
      const btn2 = tree.root.findByProps({ testID: 'soundboard-btn-s2' });
      expect(btn1).toBeTruthy();
      expect(btn2).toBeTruthy();
    });

    it('shows sound name and emoji on each button', async () => {
      mockApiRequest.mockResolvedValue([sound({ emoji: '🎵', name: 'Music' })]);
      const tree = render({ serverId: 'srv-1' });
      await act(async () => {
        await Promise.resolve();
      });

      const textNodes = tree.root.findAllByType('Text' as never);
      const emojiNode = textNodes.find((n) => n.props.children === '🎵');
      const nameNode = textNodes.find((n) => n.props.children === 'Music');
      expect(emojiNode).toBeTruthy();
      expect(nameNode).toBeTruthy();
    });

    it('uses default emoji when sound has no emoji', async () => {
      mockApiRequest.mockResolvedValue([sound({ emoji: null, name: 'NoEmoji' })]);
      const tree = render({ serverId: 'srv-1' });
      await act(async () => {
        await Promise.resolve();
      });

      const textNodes = tree.root.findAllByType('Text' as never);
      const emojiNode = textNodes.find((n) => n.props.children === '🔊');
      expect(emojiNode).toBeTruthy();
    });
  });

  describe('playback on tap', () => {
    it('calls player.replace and player.play on tap', async () => {
      mockApiRequest.mockResolvedValue([sound({ id: 's1', url: 'https://ex.com/s.mp3' })]);
      const tree = render({ serverId: 'srv-1' });
      await act(async () => {
        await Promise.resolve();
      });

      const btn = tree.root.findByProps({ testID: 'soundboard-btn-s1' });
      act(() => {
        btn.props.onPress();
      });

      expect(mockReplace).toHaveBeenCalledWith({ uri: 'https://ex.com/s.mp3' });
      expect(mockPlay).toHaveBeenCalled();
    });
  });

  describe('publish seam', () => {
    it('calls publishSoundToRoom on every tap', async () => {
      const s = sound({ id: 's1', name: 'Airhorn' });
      mockApiRequest.mockResolvedValue([s]);
      const tree = render({ serverId: 'srv-1' });
      await act(async () => {
        await Promise.resolve();
      });

      const btn = tree.root.findByProps({ testID: 'soundboard-btn-s1' });
      act(() => {
        btn.props.onPress();
      });

      expect(mockPublishSoundToRoom).toHaveBeenCalledWith(s);
    });

    it('calls BOTH local playback and publish seam on same tap', async () => {
      mockApiRequest.mockResolvedValue([sound({ id: 's1' })]);
      const tree = render({ serverId: 'srv-1' });
      await act(async () => {
        await Promise.resolve();
      });

      const btn = tree.root.findByProps({ testID: 'soundboard-btn-s1' });
      mockPlay.mockClear();
      mockPublishSoundToRoom.mockClear();

      act(() => {
        btn.props.onPress();
      });

      expect(mockPlay).toHaveBeenCalled();
      expect(mockPublishSoundToRoom).toHaveBeenCalled();
    });
  });

  describe('empty state', () => {
    it('shows empty message when server has no sounds', async () => {
      mockApiRequest.mockResolvedValue([]);
      const tree = render({ serverId: 'srv-1' });
      await act(async () => {
        await Promise.resolve();
      });

      const empty = tree.root.findByProps({ testID: 'soundboard-empty' });
      expect(empty).toBeTruthy();
    });

    it('does not show scroll area when empty', async () => {
      mockApiRequest.mockResolvedValue([]);
      const tree = render({ serverId: 'srv-1' });
      await act(async () => {
        await Promise.resolve();
      });

      expect(() => tree.root.findByProps({ testID: 'soundboard-scroll' })).toThrow();
    });
  });

  describe('error state', () => {
    it('shows error message on fetch failure', async () => {
      mockApiRequest.mockRejectedValue(new Error('Network error'));
      const tree = render({ serverId: 'srv-1' });
      await act(async () => {
        await Promise.resolve();
      });

      const error = tree.root.findByProps({ testID: 'soundboard-error' });
      expect(error).toBeTruthy();
    });

    it('does not show loading after error', async () => {
      mockApiRequest.mockRejectedValue(new Error('fail'));
      const tree = render({ serverId: 'srv-1' });
      await act(async () => {
        await Promise.resolve();
      });

      expect(() => tree.root.findByProps({ testID: 'soundboard-loading' })).toThrow();
    });
  });

  describe('fetch contract', () => {
    it('fetches from GET /servers/:serverId/sounds', () => {
      render({ serverId: 'srv-99' });
      expect(mockApiRequest).toHaveBeenCalledWith('/servers/srv-99/sounds');
    });

    it('re-fetches when serverId changes', () => {
      const tree = render({ serverId: 'srv-1' });
      mockApiRequest.mockClear();
      act(() => {
        tree.update(
          React.createElement(SoundboardPanel, { serverId: 'srv-2' }, null),
        );
      });
      expect(mockApiRequest).toHaveBeenCalledWith('/servers/srv-2/sounds');
    });
  });
});
