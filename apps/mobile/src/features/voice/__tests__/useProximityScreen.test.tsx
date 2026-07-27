/**
 * useProximityScreen unit tests — proximity wake lock lifecycle
 *
 * Verifies that the proximity screen-off wake lock is acquired/released
 * based on connectionState + isSpeakerOn.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useVoiceStore } from '../VoiceStore';
import { injectProximityAPI, useProximityScreen } from '../useProximityScreen';

// ── Test wrapper component ──

function TestHarness(): React.JSX.Element | null {
  useProximityScreen();
  return null;
}

// ── Helpers ──

function makeMockAPI() {
  return {
    acquireProximityScreenOff: jest.fn(),
    releaseProximityScreenOff: jest.fn(),
  };
}

function resetStore() {
  useVoiceStore.setState({
    connectionState: 'idle',
    activeChannelId: null,
    error: null,
    participantCount: 0,
    room: null,
    cameraEnabled: false,
    cameraFacing: 'front',
    isMuted: false,
    isDeafened: false,
    isSpeakerOn: true,
  });
}

/** Create a TestRenderer and track it for cleanup. */
function mount(): TestRenderer.ReactTestRenderer {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<TestHarness />);
  });
  return renderer;
}

/** Set voice store state, wrapped in act when a renderer is mounted. */
function setVoiceState(partial: Partial<ReturnType<typeof useVoiceStore.getState>>) {
  act(() => {
    useVoiceStore.setState(partial);
  });
}

// ── Tests ──

describe('useProximityScreen', () => {
  let api: ReturnType<typeof makeMockAPI>;
  let renderer: TestRenderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    api = makeMockAPI();
    injectProximityAPI(api);
    jest.clearAllMocks();
    renderer = null;
    resetStore();
  });

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer!.unmount();
      });
    }
    injectProximityAPI(null);
    resetStore();
  });

  // ── Not connected ──

  it('does NOT acquire when not connected', () => {
    renderer = mount();
    expect(api.acquireProximityScreenOff).not.toHaveBeenCalled();
  });

  // ── Connected, speaker on (default) ──

  it('does NOT acquire when connected with speaker on', () => {
    setVoiceState({ connectionState: 'connected', isSpeakerOn: true });
    renderer = mount();
    expect(api.acquireProximityScreenOff).not.toHaveBeenCalled();
  });

  // ── Connected, earpiece ──

  it('acquires when connected in earpiece mode', () => {
    setVoiceState({ connectionState: 'connected', isSpeakerOn: false });
    renderer = mount();
    expect(api.acquireProximityScreenOff).toHaveBeenCalledTimes(1);
    expect(api.releaseProximityScreenOff).not.toHaveBeenCalled();
  });

  // ── Transition: earpiece → speaker ──

  it('releases when switching from earpiece to speaker', () => {
    setVoiceState({ connectionState: 'connected', isSpeakerOn: false });
    renderer = mount();
    expect(api.acquireProximityScreenOff).toHaveBeenCalledTimes(1);

    // Switch to speaker — cleanup fires, release runs.
    setVoiceState({ isSpeakerOn: true });
    expect(api.releaseProximityScreenOff).toHaveBeenCalledTimes(1);
    expect(api.acquireProximityScreenOff).toHaveBeenCalledTimes(1); // no duplicate
  });

  // ── Transition: earpiece → disconnect ──

  it('releases when disconnecting from earpiece call', () => {
    setVoiceState({ connectionState: 'connected', isSpeakerOn: false });
    renderer = mount();
    expect(api.acquireProximityScreenOff).toHaveBeenCalledTimes(1);

    // Disconnect — cleanup fires, release runs.
    setVoiceState({ connectionState: 'idle' });
    expect(api.releaseProximityScreenOff).toHaveBeenCalledTimes(1);
  });

  // ── Unmount cleanup ──

  it('releases on unmount even if still in earpiece', () => {
    setVoiceState({ connectionState: 'connected', isSpeakerOn: false });
    renderer = mount();
    expect(api.acquireProximityScreenOff).toHaveBeenCalledTimes(1);

    // Unmount — should trigger cleanup
    act(() => {
      renderer!.unmount();
    });
    renderer = null;
    expect(api.releaseProximityScreenOff).toHaveBeenCalledTimes(1);
  });

  // ── Speaker → earpiece toggle ──

  it('acquires when toggling from speaker to earpiece during a call', () => {
    setVoiceState({ connectionState: 'connected', isSpeakerOn: true });
    renderer = mount();
    expect(api.acquireProximityScreenOff).not.toHaveBeenCalled();

    // Switch to earpiece — cleanup fires (release, no-op since not held),
    // then new effect acquires.
    setVoiceState({ isSpeakerOn: false });
    expect(api.acquireProximityScreenOff).toHaveBeenCalledTimes(1);
    // Cleanup release fires on the dependency change (no-op, but called).
    expect(api.releaseProximityScreenOff).toHaveBeenCalledTimes(1);
  });
});
