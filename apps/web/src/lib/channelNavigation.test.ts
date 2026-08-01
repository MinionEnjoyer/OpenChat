import { describe, expect, it, vi } from 'vitest';
import { activateServerChannels } from './channelNavigation';

const channels = [
  { id: 'general', type: 'TEXT' as const },
  { id: 'random', type: 'TEXT' as const },
  { id: 'voice', type: 'VOICE' as const },
];

function dependencies() {
  return {
    listChannels: vi.fn().mockResolvedValue(channels),
    setChannels: vi.fn(),
    subscribe: vi.fn(),
    selectChannel: vi.fn().mockResolvedValue(undefined),
  };
}

describe('activateServerChannels', () => {
  it('restores a requested general channel with one selection', async () => {
    const deps = dependencies();
    await activateServerChannels('server-1', 'general', deps);

    expect(deps.selectChannel).toHaveBeenCalledTimes(1);
    expect(deps.selectChannel).toHaveBeenCalledWith('general');
  });

  it('restores a requested non-default channel without visiting general first', async () => {
    const deps = dependencies();
    await activateServerChannels('server-1', 'random', deps);

    expect(deps.selectChannel).toHaveBeenCalledTimes(1);
    expect(deps.selectChannel).toHaveBeenCalledWith('random');
  });

  it('falls back to the first text channel for a normal server click', async () => {
    const deps = dependencies();
    await activateServerChannels('server-1', null, deps);

    expect(deps.setChannels).toHaveBeenCalledWith('server-1', channels);
    expect(deps.subscribe).toHaveBeenCalledTimes(3);
    expect(deps.selectChannel).toHaveBeenCalledTimes(1);
    expect(deps.selectChannel).toHaveBeenCalledWith('general');
  });
});
