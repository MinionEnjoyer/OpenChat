import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AudioControls } from '../lib/audioPrefs';
import { CallView } from './CallView';

const noop = vi.fn();
const audio = {
  getPrefs: () => ({
    inputDeviceId: null,
    outputDeviceId: null,
    outputVolume: 100,
    muteSoundboard: false,
    screenShareBitrate: 12,
    screenShareFps: 30,
    screenShareResolution: '1440' as const,
    inputMode: 'vad' as const,
    pttKeybind: null,
  }),
  setInputDevice: noop,
  setOutputDevice: noop,
  setOutputVolume: noop,
  setMuteSoundboard: noop,
  setScreenShareBitrate: noop,
  setScreenShareFps: noop,
  setScreenShareResolution: noop,
  setInputMode: noop,
  setPttKeybind: noop,
} satisfies AudioControls;

function renderCall(connected = true) {
  return render(
    <CallView
      channelName="Lounge"
      connected={connected}
      connecting={false}
      participants={connected ? [
        { identity: 'alex', name: 'alex', isMe: true, speaking: true, micOn: true },
        { identity: 'morgan', name: 'Morgan', isMe: false, speaking: false, micOn: false },
      ] : []}
      muted={false}
      onJoin={noop}
      onLeave={noop}
      onToggleMute={noop}
      party={null}
      meId="alex"
      onStartWatch={noop}
      onWatchState={noop}
      onCloseWatch={noop}
      onLeaveWatch={noop}
      onOpenSoundboard={noop}
      screens={[]}
      sharing={false}
      audio={audio}
      onShareScreen={noop}
      onStopShare={noop}
      onStopScreen={noop}
    />,
  );
}

describe('CallView layout', () => {
  it('uses the full participant-card call stage and keeps all call controls', () => {
    const { container } = renderCall();

    expect(screen.getByText('Voice connected')).toBeInTheDocument();
    expect(screen.getByTestId('call-participants')).toHaveClass('call-participant-grid');
    expect(container.querySelectorAll('.call-participant-card')).toHaveLength(2);
    expect(container.querySelector('.call-participant-card.is-speaking')).toHaveTextContent('Speaking');
    expect(container.querySelector('.call-participant-card.is-muted')).toHaveTextContent('Morgan');
    expect(screen.getByRole('button', { name: /Soundboard/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start Watch Party/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Disconnect/ })).toBeInTheDocument();
  });

  it('shows a polished join card before connecting', () => {
    renderCall(false);

    expect(screen.getByRole('heading', { name: 'Join Lounge' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join Voice' })).toBeInTheDocument();
  });
});
