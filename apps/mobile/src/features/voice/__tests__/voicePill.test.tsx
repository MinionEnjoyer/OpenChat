/**
 * VoicePill unit tests (FR-VOX-003).
 *
 * Tests the VoicePill component with mocked VoiceStore state.
 * Verifies status visibility, mute/deafen/disconnect buttons,
 * badge indicators, and label states.
 *
 * @satisfies FR-VOX-001, FR-VOX-003
 */
import React from 'react';
import renderer from 'react-test-renderer';
import { VoicePill } from '../VoicePill';
import { useVoiceStore, injectVoiceService } from '../VoiceStore';
import { VoiceService } from '../VoiceService';

// ── helpers ──

function mockService(): VoiceService {
  const mockApi = { request: jest.fn() };
  return new VoiceService(mockApi as any);
}

function resetStore(): void {
  useVoiceStore.setState({
    connectionState: 'idle',
    activeChannelId: null,
    error: null,
    participantCount: 0,
    room: null,
    isMuted: false,
    isDeafened: false,
    isSpeakerOn: true,
  });
}

function setConnected(): void {
  useVoiceStore.setState({
    connectionState: 'connected',
    activeChannelId: 'chan-1',
  });
}

// ── tests ──

describe('VoicePill (FR-VOX-003)', () => {
  beforeEach(() => {
    injectVoiceService(mockService());
    resetStore();
  });

  afterEach(() => {
    injectVoiceService(null as unknown as VoiceService);
  });

  it('renders nothing when idle', () => {
    resetStore();
    let tree: unknown = null;
    renderer.act(() => {
      tree = renderer.create(<VoicePill />).toJSON();
    });
    expect(tree).toBeNull();
  });

  it('renders pill when connecting', () => {
    useVoiceStore.setState({
      connectionState: 'joining',
      activeChannelId: 'chan-1',
    });
    let root: renderer.ReactTestRenderer;
    renderer.act(() => {
      root = renderer.create(<VoicePill />);
    });
    expect(root!.toJSON()).not.toBeNull();
  });

  it('renders pill with controls row when connected', () => {
    setConnected();
    let root: renderer.ReactTestRenderer;
    renderer.act(() => {
      root = renderer.create(<VoicePill />);
    });
    expect(root!.toJSON()).not.toBeNull();
    expect(() => root!.root.findByProps({ testID: 'voice-pill-controls' })).not.toThrow();
  });

  it('renders three control buttons when connected', () => {
    setConnected();
    let root: renderer.ReactTestRenderer;
    renderer.act(() => {
      root = renderer.create(<VoicePill />);
    });
    expect(() => root!.root.findByProps({ testID: 'voice-pill-mute' })).not.toThrow();
    expect(() => root!.root.findByProps({ testID: 'voice-pill-deafen' })).not.toThrow();
    expect(() => root!.root.findByProps({ testID: 'voice-pill-disconnect' })).not.toThrow();
  });

  it('does not show controls row when only joining', () => {
    useVoiceStore.setState({
      connectionState: 'joining',
      activeChannelId: 'chan-1',
    });
    let root: renderer.ReactTestRenderer;
    renderer.act(() => {
      root = renderer.create(<VoicePill />);
    });
    expect(() => root!.root.findByProps({ testID: 'voice-pill-controls' })).toThrow();
  });

  it('shows muted badge when muted', () => {
    useVoiceStore.setState({
      connectionState: 'connected',
      activeChannelId: 'chan-1',
      isMuted: true,
    });
    let root: renderer.ReactTestRenderer;
    renderer.act(() => {
      root = renderer.create(<VoicePill />);
    });
    expect(() => root!.root.findByProps({ testID: 'voice-pill-muted-badge' })).not.toThrow();
  });

  it('does not show muted badge when not muted', () => {
    setConnected();
    let root: renderer.ReactTestRenderer;
    renderer.act(() => {
      root = renderer.create(<VoicePill />);
    });
    expect(() => root!.root.findByProps({ testID: 'voice-pill-muted-badge' })).toThrow();
  });

  it('shows deafened badge when deafened', () => {
    useVoiceStore.setState({
      connectionState: 'connected',
      activeChannelId: 'chan-1',
      isDeafened: true,
    });
    let root: renderer.ReactTestRenderer;
    renderer.act(() => {
      root = renderer.create(<VoicePill />);
    });
    expect(() => root!.root.findByProps({ testID: 'voice-pill-deafened-badge' })).not.toThrow();
  });

  it('calls toggleMute on mute button press (verified via store state)', () => {
    setConnected();
    let root: renderer.ReactTestRenderer;
    renderer.act(() => {
      root = renderer.create(<VoicePill />);
    });
    const muteBtn = root!.root.findByProps({ testID: 'voice-pill-mute' });
    renderer.act(() => {
      muteBtn.props.onPress();
    });
    expect(useVoiceStore.getState().isMuted).toBe(true);
  });

  it('calls toggleDeafen on deafen button press (verified via store state)', () => {
    setConnected();
    let root: renderer.ReactTestRenderer;
    renderer.act(() => {
      root = renderer.create(<VoicePill />);
    });
    const deafenBtn = root!.root.findByProps({ testID: 'voice-pill-deafen' });
    renderer.act(() => {
      deafenBtn.props.onPress();
    });
    expect(useVoiceStore.getState().isDeafened).toBe(true);
  });

  it('shows connected label when connected', () => {
    setConnected();
    let root: renderer.ReactTestRenderer;
    renderer.act(() => {
      root = renderer.create(<VoicePill />);
    });
    const allTexts = root!.root.findAllByType('Text' as any);
    const found = allTexts.some((t) => (t.props as any).children === 'Voice Connected');
    expect(found).toBe(true);
  });

  it('shows connecting label when joining', () => {
    useVoiceStore.setState({
      connectionState: 'joining',
      activeChannelId: 'chan-1',
    });
    let root: renderer.ReactTestRenderer;
    renderer.act(() => {
      root = renderer.create(<VoicePill />);
    });
    const allTexts = root!.root.findAllByType('Text' as any);
    const found = allTexts.some((t) => (t.props as any).children === 'Connecting…');
    expect(found).toBe(true);
  });
});
