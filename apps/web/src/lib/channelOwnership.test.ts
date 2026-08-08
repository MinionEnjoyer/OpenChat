import { describe, expect, it } from 'vitest';
import { indexServerChannels, serverIdForChannel } from './channelOwnership';

describe('channel ownership index', () => {
  it('replaces stale channels for one server without disturbing another', () => {
    const before = { general: 'server-a', retired: 'server-a', lobby: 'server-b' };
    const next = indexServerChannels(before, 'server-a', [{ id: 'general' }, { id: 'media' }]);

    expect(next).toEqual({ general: 'server-a', media: 'server-a', lobby: 'server-b' });
    expect(serverIdForChannel(next, 'media')).toBe('server-a');
    expect(serverIdForChannel(next, 'dm-channel')).toBeNull();
    expect(before).toHaveProperty('retired');
  });
});
