import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WatchPartyState } from '../lib/types';
import { WatchPartyPlayer } from './WatchPartyPlayer';

const party: WatchPartyState = {
  id: 'party-1',
  channelId: 'channel-1',
  hostId: 'host-1',
  hostName: 'Host',
  source: 'youtube',
  itemId: 'yt:dQw4w9WgXcQ',
  youtubeId: 'dQw4w9WgXcQ',
  itemName: 'YouTube video',
  positionMs: 0,
  paused: true,
  streamUrl: null,
};

describe('WatchPartyPlayer lifecycle controls', () => {
  it('shows a viewer exit action without exposing the host close action', () => {
    const onLeave = vi.fn();
    render(<WatchPartyPlayer party={party} isHost={false} onState={vi.fn()} onClose={vi.fn()} onLeave={onLeave} />);

    expect(screen.queryByRole('button', { name: 'Close Party' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Exit Party' }));
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it('shows the host close action without presenting exit as an ambiguous stop', () => {
    const onClose = vi.fn();
    render(<WatchPartyPlayer party={party} isHost onState={vi.fn()} onClose={onClose} onLeave={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Exit Party' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close Party' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
