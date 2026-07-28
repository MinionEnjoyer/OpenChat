/**
 * VoiceControls unit tests (FR-VOX-003).
 *
 * Tests control dispatch through the VoiceStore and the VoiceConnectionAPI,
 * since the VoiceControls component is a pure view layer that delegates
 * to store actions. Component rendering is tested shallowly to verify
 * null guard and button presence.
 *
 * @satisfies FR-VOX-003
 */
import React from 'react';
import renderer from 'react-test-renderer';
import { VoiceControls } from '../VoiceControls';
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

describe('VoiceControls (FR-VOX-003)', () => {
  beforeEach(() => {
    injectVoiceService(mockService());
    resetStore();
  });

  afterEach(() => {
    injectVoiceService(null as unknown as VoiceService);
  });

  it('renders nothing when not connected', () => {
    resetStore();
    let tree: unknown = null;
    renderer.act(() => {
      tree = renderer.create(<VoiceControls />).toJSON();
    });
    expect(tree).toBeNull();
  });

  it('renders controls row when connected', () => {
    setConnected();
    let root: renderer.ReactTestRenderer;
    renderer.act(() => {
      root = renderer.create(<VoiceControls />);
    });
    const tree = root!.toJSON();
    expect(tree).not.toBeNull();
    if (tree && 'props' in tree) {
      expect((tree as any).props.testID).toBe('voice-controls');
    }
  });

  it('renders four control buttons when connected', () => {
    setConnected();
    let root: renderer.ReactTestRenderer;
    renderer.act(() => {
      root = renderer.create(<VoiceControls />);
    });
    expect(() => root!.root.findByProps({ testID: 'voice-control-mute' })).not.toThrow();
    expect(() => root!.root.findByProps({ testID: 'voice-control-deafen' })).not.toThrow();
    expect(() => root!.root.findByProps({ testID: 'voice-control-speaker' })).not.toThrow();
    expect(() => root!.root.findByProps({ testID: 'voice-control-disconnect' })).not.toThrow();
  });

  it('shows unmute label when muted', () => {
    useVoiceStore.setState({
      connectionState: 'connected',
      activeChannelId: 'chan-1',
      isMuted: true,
    });
    let root: renderer.ReactTestRenderer;
    renderer.act(() => {
      root = renderer.create(<VoiceControls />);
    });
    const muteBtn = root!.root.findByProps({ testID: 'voice-control-mute' });
    const texts = muteBtn.findAllByType('Text' as any);
    const label = texts.find((t) => (t.props as any).children === 'Unmute');
    expect(label).toBeDefined();
  });

  it('shows undeafen label when deafened', () => {
    useVoiceStore.setState({
      connectionState: 'connected',
      activeChannelId: 'chan-1',
      isDeafened: true,
    });
    let root: renderer.ReactTestRenderer;
    renderer.act(() => {
      root = renderer.create(<VoiceControls />);
    });
    const deafenBtn = root!.root.findByProps({ testID: 'voice-control-deafen' });
    const texts = deafenBtn.findAllByType('Text' as any);
    const label = texts.find((t) => (t.props as any).children === 'Undeafen');
    expect(label).toBeDefined();
  });

  it('shows earpiece label when speaker is off', () => {
    useVoiceStore.setState({
      connectionState: 'connected',
      activeChannelId: 'chan-1',
      isSpeakerOn: false,
    });
    let root: renderer.ReactTestRenderer;
    renderer.act(() => {
      root = renderer.create(<VoiceControls />);
    });
    const speakerBtn = root!.root.findByProps({ testID: 'voice-control-speaker' });
    const texts = speakerBtn.findAllByType('Text' as any);
    const label = texts.find((t) => (t.props as any).children === 'Earpiece');
    expect(label).toBeDefined();
  });

  it('calls toggleMute on press (verified via store state)', () => {
    setConnected();
    let root: renderer.ReactTestRenderer;
    renderer.act(() => {
      root = renderer.create(<VoiceControls />);
    });
    const muteBtn = root!.root.findByProps({ testID: 'voice-control-mute' });
    renderer.act(() => {
      muteBtn.props.onPress();
    });
    expect(useVoiceStore.getState().isMuted).toBe(true);
  });

  it('calls toggleDeafen on press (verified via store state)', () => {
    setConnected();
    let root: renderer.ReactTestRenderer;
    renderer.act(() => {
      root = renderer.create(<VoiceControls />);
    });
    const deafenBtn = root!.root.findByProps({ testID: 'voice-control-deafen' });
    renderer.act(() => {
      deafenBtn.props.onPress();
    });
    expect(useVoiceStore.getState().isDeafened).toBe(true);
    expect(useVoiceStore.getState().isMuted).toBe(true); // deafen implies mute
  });

  it('calls toggleSpeaker on press (verified via store state)', () => {
    setConnected();
    let root: renderer.ReactTestRenderer;
    renderer.act(() => {
      root = renderer.create(<VoiceControls />);
    });
    const speakerBtn = root!.root.findByProps({ testID: 'voice-control-speaker' });
    renderer.act(() => {
      speakerBtn.props.onPress();
    });
    expect(useVoiceStore.getState().isSpeakerOn).toBe(false);
  });
});
