/**
 * VoiceTileGrid component tests (FR-VOX-002).
 *
 * Validates: renders when connected, hidden otherwise, shows tiles
 * for each participant, empty state when no participants, testID contract.
 *
 * @satisfies FR-VOX-002
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useVoiceStore, type VoiceParticipantInfo } from '../VoiceStore';

// Mock useVoiceParticipants — it's a side-effect hook that wires LiveKit;
// in component tests we just want to verify rendering from store state.
jest.mock('../useVoiceParticipants', () => ({
  useVoiceParticipants: jest.fn(),
}));

// Mock Animated
jest.mock('react-native/Libraries/Animated/Animated', () => {
  const actual = jest.requireActual('react-native/Libraries/Animated/Animated');
  return { ...actual, timing: () => ({ start: jest.fn() }) };
});

// Lazy import after mocks — mocked hooks must be in place first.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { VoiceTileGrid } = require('../VoiceTileGrid');

function participant(overrides: Partial<VoiceParticipantInfo> = {}): VoiceParticipantInfo {
  return {
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    avatarUrl: null,
    isSpeaking: false,
    audioLevel: 0,
    isMuted: false,
    isLocal: false,
    ...overrides,
  };
}

function configureStore(opts: {
  connectionState?: string;
  participants?: VoiceParticipantInfo[];
}) {
  useVoiceStore.setState({
    connectionState: (opts.connectionState ?? 'idle') as 'idle' | 'joining' | 'connected' | 'leaving',
    participants: opts.participants ?? [],
  });
}

function renderGrid(): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<VoiceTileGrid />);
  });
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return renderer!;
}

describe('VoiceTileGrid (FR-VOX-002)', () => {
  beforeEach(() => {
    useVoiceStore.setState({
      connectionState: 'idle',
      activeChannelId: null,
      error: null,
      participantCount: 0,
      participants: [],
      room: null,
    });
  });

  it('renders null when not connected', () => {
    configureStore({ connectionState: 'idle' });
    const tree = renderGrid();
    expect(tree.toJSON()).toBeNull();
  });

  it('renders null when joining', () => {
    configureStore({ connectionState: 'joining' });
    const tree = renderGrid();
    expect(tree.toJSON()).toBeNull();
  });

  it('renders grid when connected', () => {
    configureStore({ connectionState: 'connected', participants: [participant({ id: 'u1' })] });
    const tree = renderGrid();
    expect(tree.toJSON()).toBeTruthy();
  });

  it('has voice-tile-grid testID', () => {
    configureStore({ connectionState: 'connected', participants: [participant({ id: 'u1' })] });
    const tree = renderGrid();
    const grid = tree.root.findByProps({ testID: 'voice-tile-grid' });
    expect(grid).toBeTruthy();
  });

  it('renders a VoiceTile for each participant', () => {
    const p1 = participant({ id: 'u1', username: 'alice' });
    const p2 = participant({ id: 'u2', username: 'bob' });
    configureStore({ connectionState: 'connected', participants: [p1, p2] });
    const tree = renderGrid();

    const tile1 = tree.root.findByProps({ testID: 'voice-tile-u1' });
    const tile2 = tree.root.findByProps({ testID: 'voice-tile-u2' });
    expect(tile1).toBeTruthy();
    expect(tile2).toBeTruthy();
  });

  it('shows empty text when no participants', () => {
    configureStore({ connectionState: 'connected', participants: [] });
    const tree = renderGrid();
    const textNodes = tree.root.findAllByType('Text' as never);
    const emptyNode = textNodes.find(
      (n) => typeof n.props.children === 'string' && n.props.children?.includes('Waiting'),
    );
    expect(emptyNode).toBeTruthy();
  });
});
