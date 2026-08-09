import { PresenceService } from './presence.service';

describe('PresenceService', () => {
  it('tracks and clears live status independently for each connected user', () => {
    const presence = new PresenceService();
    expect(presence.get('user-1')).toBe('OFFLINE');

    presence.set('user-1', 'ONLINE');
    presence.set('user-2', 'DND');
    expect(presence.get('user-1')).toBe('ONLINE');
    expect(presence.get('user-2')).toBe('DND');

    presence.clear('user-1');
    expect(presence.get('user-1')).toBe('OFFLINE');
    expect(presence.get('user-2')).toBe('DND');
  });

  it('exposes only visible active statuses to @here and snapshots', () => {
    const presence = new PresenceService();
    presence.set('online', 'ONLINE');
    presence.set('away', 'AWAY');
    presence.set('dnd', 'DND');
    presence.set('invisible', 'INVISIBLE');
    presence.set('offline', 'OFFLINE');

    expect(presence.isActive('online')).toBe(true);
    expect(presence.isActive('away')).toBe(true);
    expect(presence.isActive('dnd')).toBe(true);
    expect(presence.isActive('invisible')).toBe(false);
    expect(presence.isActive('missing')).toBe(false);
    expect(presence.snapshot()).toEqual([
      { userId: 'online', status: 'ONLINE' },
      { userId: 'away', status: 'AWAY' },
      { userId: 'dnd', status: 'DND' },
    ]);
  });
});
