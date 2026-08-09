import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureShowcase } from './main';

describe('realtime feature showcase', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/showcase.html');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('simulates a message arriving in the public-server view', () => {
    vi.useFakeTimers();
    render(<FeatureShowcase />);

    expect(screen.getByText('Public server · realtime')).toBeInTheDocument();
    expect(screen.queryByText(/Upload received/)).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByText(/Upload received/)).toBeInTheDocument();
    expect(screen.getByText('Sky is typing…')).toBeInTheDocument();
  });

  it('renders the production call grid for a private call', () => {
    window.history.replaceState(null, '', '/showcase.html?scenario=private-call');
    const { container } = render(<FeatureShowcase />);

    expect(screen.getByText('Private call · encrypted transport')).toBeInTheDocument();
    expect(container.querySelectorAll('.call-participant-card')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Disconnect/ })).toBeInTheDocument();
  });

  it('shows a synchronized watch party with the full viewer roster', () => {
    window.history.replaceState(null, '', '/showcase.html?scenario=watch-party');
    render(<FeatureShowcase />);

    expect(screen.getByText('Watch party · 4 viewers synchronized')).toBeInTheDocument();
    expect(screen.getByText(/OpenChat Release Night/)).toBeInTheDocument();
    expect(screen.getByTitle(/Watching: alex, Morgan, Sky, Jordan/)).toBeInTheDocument();
  });

  it('renders multiple selected screen surfaces through the real call view', () => {
    window.history.replaceState(null, '', '/showcase.html?scenario=screen-share');
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
      fillRect: vi.fn(), fillText: vi.fn(),
      set fillStyle(_value: string) {}, set font(_value: string) {},
    } as unknown as CanvasRenderingContext2D);
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', { configurable: true, value: () => ({ getVideoTracks: () => [track] }) });
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('MediaStream', class { constructor(_tracks: MediaStreamTrack[]) {} });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();

    const { container } = render(<FeatureShowcase />);

    expect(screen.getByText('alex is sharing 2 windows')).toBeInTheDocument();
    expect(container.querySelectorAll('.call-screens-grid video')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Share Another/ })).toBeInTheDocument();
  });
});
