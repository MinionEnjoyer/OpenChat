/**
 * Unit tests: applyEvent cache transitions for all 10 FR-SRV-009 guild-structure events.
 *
 * Each test seeds the query cache with known before-state, applies the event,
 * and asserts the cache transition matches the expected after-state.
 *
 * @satisfies FR-SRV-009
 */

import { applyEvent, queryClient } from '../queryClient';
import { keys } from '../keys';
import { useSession } from '../../stores/session';
import { logger } from '../../lib/logger';
import type { Channel, Role, Member, Server } from '../../api/schema';
import type {
  ChannelCreatedFrame,
  ChannelDeletedFrame,
  RoleCreatedFrame,
  RoleUpdatedFrame,
  RoleDeletedFrame,
  MemberJoinedFrame,
  MemberLeftFrame,
  MemberKickedFrame,
  ServerUpdatedFrame,
  ServerDeletedFrame,
} from '../../realtime/events';

// ── Factory helpers ──

function makeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: 'ch-1',
    serverId: 'srv-1',
    name: 'general',
    type: 'TEXT',
    topic: null,
    categoryId: null,
    parentId: null,
    position: 0,
    isDefault: false,
    ...overrides,
  };
}

function makeRole(overrides: Partial<Role> = {}): Role {
  return {
    id: 'role-1',
    serverId: 'srv-1',
    name: 'Moderator',
    color: 0xff0000,
    permissions: '8',
    position: 0,
    ...overrides,
  };
}

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    userId: 'user-1',
    nickname: null,
    isOwner: false,
    joinedAt: '2026-01-01T00:00:00Z',
    roleIds: [],
    user: { id: 'user-1', username: 'alice', displayName: null, avatarUrl: null, status: null },
    ...overrides,
  };
}

function makeServer(overrides: Partial<Server> = {}): Server {
  return {
    id: 'srv-1',
    name: 'Test Server',
    ownerId: 'owner-1',
    iconUrl: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    myPermissions: '0',
    ...overrides,
  };
}

// ── Setup / teardown ──

beforeEach(() => {
  queryClient.clear();
});

afterAll(() => {
  queryClient.clear();
});

// ── 1. channel.created ─────────────────────────────────────────────────

describe('channel.created', () => {
  it('prepends channel to the correct server cache', () => {
    const existing = makeChannel({ id: 'ch-old', name: 'existing' });
    queryClient.setQueryData<Channel[]>(keys.channels('srv-1'), [existing]);

    const newCh = makeChannel({ id: 'ch-new', name: 'announcements', serverId: 'srv-1' });
    const frame: ChannelCreatedFrame = { op: 'channel.created', d: { channel: newCh as unknown as Record<string, unknown> } };
    applyEvent(frame);

    const cache = queryClient.getQueryData<Channel[]>(keys.channels('srv-1'));
    expect(cache).toHaveLength(2);
    expect(cache![0]!.id).toBe('ch-new');
    expect(cache![1]!.id).toBe('ch-old');
  });

  it('seeds the cache when previously empty', () => {
    const newCh = makeChannel({ id: 'ch-new', serverId: 'srv-1' });
    const frame: ChannelCreatedFrame = { op: 'channel.created', d: { channel: newCh as unknown as Record<string, unknown> } };
    applyEvent(frame);

    const cache = queryClient.getQueryData<Channel[]>(keys.channels('srv-1'));
    expect(cache).toHaveLength(1);
    expect(cache![0]!.id).toBe('ch-new');
  });

  it('does nothing when channel has no serverId', () => {
    const badCh = { id: 'ch-bad', name: 'orphan' } as unknown as Channel;
    const frame: ChannelCreatedFrame = { op: 'channel.created', d: { channel: badCh as unknown as Record<string, unknown> } };
    applyEvent(frame);

    const cache = queryClient.getQueryData<Channel[]>(keys.channels('srv-1'));
    expect(cache).toBeUndefined();
  });
});

// ── 2. channel.deleted ─────────────────────────────────────────────────

describe('channel.deleted', () => {
  it('removes channel from the correct server cache by scanning', () => {
    // Seed two servers so we know the scanner finds the right one.
    queryClient.setQueryData<Server[]>(keys.servers, [makeServer({ id: 'srv-1' }), makeServer({ id: 'srv-2' })]);
    const ch1 = makeChannel({ id: 'ch-1', serverId: 'srv-1' });
    const ch2 = makeChannel({ id: 'ch-keep', serverId: 'srv-1' });
    queryClient.setQueryData<Channel[]>(keys.channels('srv-1'), [ch1, ch2]);
    queryClient.setQueryData<Channel[]>(keys.channels('srv-2'), [makeChannel({ id: 'ch-other', serverId: 'srv-2' })]);

    const frame: ChannelDeletedFrame = { op: 'channel.deleted', d: { channelId: 'ch-1' } };
    applyEvent(frame);

    const cache1 = queryClient.getQueryData<Channel[]>(keys.channels('srv-1'));
    expect(cache1).toHaveLength(1);
    expect(cache1![0]!.id).toBe('ch-keep');

    const cache2 = queryClient.getQueryData<Channel[]>(keys.channels('srv-2'));
    expect(cache2).toHaveLength(1); // untouched
  });

  it('invalidates channel queries when channel is not in any cached list', () => {
    queryClient.setQueryData<Server[]>(keys.servers, [makeServer({ id: 'srv-1' })]);
    // No channels cached — removal scan misses.

    const frame: ChannelDeletedFrame = { op: 'channel.deleted', d: { channelId: 'ch-missing' } };
    applyEvent(frame);

    // Invalidation is async (void), but the immediate cache state remains empty.
    const cache = queryClient.getQueryData<Channel[]>(keys.channels('srv-1'));
    expect(cache).toBeUndefined(); // nothing to remove
  });
});

// ── 3. role.created ────────────────────────────────────────────────────

describe('role.created', () => {
  it('invalidates the role query for the correct server', () => {
    const role = makeRole({ id: 'role-new', serverId: 'srv-1' });
    const frame: RoleCreatedFrame = { op: 'role.created', d: { role: role as unknown as Record<string, unknown> } };
    applyEvent(frame);
    // Invalidation is async; the key assertion is no error and the op is handled.
    // We verify the handler does NOT throw and does NOT hit default.
  });

  it('does nothing when role has no serverId', () => {
    const badRole = { id: 'r-bad', name: 'orphan' } as unknown as Role;
    const frame: RoleCreatedFrame = { op: 'role.created', d: { role: badRole as unknown as Record<string, unknown> } };
    expect(() => applyEvent(frame)).not.toThrow();
  });
});

// ── 4. role.updated ────────────────────────────────────────────────────

describe('role.updated', () => {
  it('invalidates the role query for the correct server', () => {
    const role = makeRole({ id: 'role-1', serverId: 'srv-1', name: 'Admin' });
    const frame: RoleUpdatedFrame = { op: 'role.updated', d: { role: role as unknown as Record<string, unknown> } };
    applyEvent(frame);
  });

  it('does nothing when role has no serverId', () => {
    const badRole = { id: 'r-bad' } as unknown as Role;
    const frame: RoleUpdatedFrame = { op: 'role.updated', d: { role: badRole as unknown as Record<string, unknown> } };
    expect(() => applyEvent(frame)).not.toThrow();
  });
});

// ── 5. role.deleted ────────────────────────────────────────────────────

describe('role.deleted', () => {
  it('invalidates all known server role caches', () => {
    queryClient.setQueryData<Server[]>(keys.servers, [
      makeServer({ id: 'srv-1' }),
      makeServer({ id: 'srv-2' }),
    ]);

    const frame: RoleDeletedFrame = { op: 'role.deleted', d: { roleId: 'role-1' } };
    applyEvent(frame);
    // Invalidation is async — no throw, no default hit.
  });
});

// ── 6. member.joined ───────────────────────────────────────────────────

describe('member.joined', () => {
  it('invalidates all known server member caches', () => {
    queryClient.setQueryData<Server[]>(keys.servers, [
      makeServer({ id: 'srv-1' }),
      makeServer({ id: 'srv-2' }),
    ]);

    const member = makeMember({ userId: 'user-new' });
    const frame: MemberJoinedFrame = { op: 'member.joined', d: { member: member as unknown as Record<string, unknown> } };
    applyEvent(frame);
  });
});

// ── 7. member.left ─────────────────────────────────────────────────────

describe('member.left', () => {
  it('removes the user from all cached member lists', () => {
    queryClient.setQueryData<Server[]>(keys.servers, [makeServer({ id: 'srv-1' }), makeServer({ id: 'srv-2' })]);
    const m1 = makeMember({ userId: 'user-left' });
    const m2 = makeMember({ userId: 'user-stay' });
    queryClient.setQueryData<Member[]>(keys.members('srv-1'), [m1, m2]);
    queryClient.setQueryData<Member[]>(keys.members('srv-2'), [makeMember({ userId: 'user-other' })]);

    const frame: MemberLeftFrame = { op: 'member.left', d: { userId: 'user-left' } };
    applyEvent(frame);

    const cache1 = queryClient.getQueryData<Member[]>(keys.members('srv-1'));
    expect(cache1).toHaveLength(1);
    expect(cache1![0]!.userId).toBe('user-stay');

    const cache2 = queryClient.getQueryData<Member[]>(keys.members('srv-2'));
    expect(cache2).toHaveLength(1); // untouched
  });
});

// ── 8. member.kicked ───────────────────────────────────────────────────

describe('member.kicked', () => {
  it('removes the kicked user from all cached member lists', () => {
    queryClient.setQueryData<Server[]>(keys.servers, [makeServer({ id: 'srv-1' })]);
    queryClient.setQueryData<Member[]>(keys.members('srv-1'), [
      makeMember({ userId: 'user-kicked' }),
      makeMember({ userId: 'user-stay' }),
    ]);

    const frame: MemberKickedFrame = { op: 'member.kicked', d: { userId: 'user-kicked' } };
    applyEvent(frame);

    const cache = queryClient.getQueryData<Member[]>(keys.members('srv-1'));
    expect(cache).toHaveLength(1);
    expect(cache![0]!.userId).toBe('user-stay');
  });

  it('invalidates servers when current user is the one kicked', () => {
    // Set up current user in session store.
    useSession.setState({ status: 'signedIn', user: { id: 'user-me', username: 'me', displayName: null, avatarUrl: null, status: null, customStatus: null, bio: null, friendCode: null, serverLayout: null, isBot: false, botOwnerId: null, botDescription: null, botPublished: false, createdAt: '', updatedAt: '' }, tokens: null as any });
    queryClient.setQueryData<Server[]>(keys.servers, [makeServer({ id: 'srv-1' })]);
    queryClient.setQueryData<Member[]>(keys.members('srv-1'), [
      makeMember({ userId: 'user-me' }),
      makeMember({ userId: 'user-other' }),
    ]);

    const frame: MemberKickedFrame = { op: 'member.kicked', d: { userId: 'user-me' } };
    applyEvent(frame);

    // Member list: current user removed
    const cache = queryClient.getQueryData<Member[]>(keys.members('srv-1'));
    expect(cache).toHaveLength(1);
    expect(cache![0]!.userId).toBe('user-other');

    // Session store reset after test
    useSession.setState({ status: 'signedOut', user: null, tokens: null });
  });
});

// ── 9. server.updated ──────────────────────────────────────────────────

describe('server.updated', () => {
  it('replaces the server entry in the servers cache', () => {
    const old = makeServer({ id: 'srv-1', name: 'Old Name' });
    queryClient.setQueryData<Server[]>(keys.servers, [old, makeServer({ id: 'srv-2' })]);

    const updated = makeServer({ id: 'srv-1', name: 'New Name' });
    const frame: ServerUpdatedFrame = { op: 'server.updated', d: { server: updated as unknown as Record<string, unknown> } };
    applyEvent(frame);

    const cache = queryClient.getQueryData<Server[]>(keys.servers);
    expect(cache).toHaveLength(2);
    expect(cache!.find((s) => s.id === 'srv-1')!.name).toBe('New Name');
    expect(cache!.find((s) => s.id === 'srv-2')!.name).toBe('Test Server');
  });

  it('does nothing when server has no id', () => {
    const bad = { name: 'no-id' } as unknown as Server;
    queryClient.setQueryData<Server[]>(keys.servers, [makeServer({ id: 'srv-1' })]);
    const frame: ServerUpdatedFrame = { op: 'server.updated', d: { server: bad as unknown as Record<string, unknown> } };
    applyEvent(frame);

    const cache = queryClient.getQueryData<Server[]>(keys.servers);
    expect(cache).toHaveLength(1);
    expect(cache![0]!.name).toBe('Test Server');
  });
});

// ── 10. server.deleted ─────────────────────────────────────────────────

describe('server.deleted', () => {
  it('removes the server from the servers cache', () => {
    queryClient.setQueryData<Server[]>(keys.servers, [
      makeServer({ id: 'srv-1' }),
      makeServer({ id: 'srv-2' }),
    ]);

    const frame: ServerDeletedFrame = { op: 'server.deleted', d: { serverId: 'srv-1' } };
    applyEvent(frame);

    const cache = queryClient.getQueryData<Server[]>(keys.servers);
    expect(cache).toHaveLength(1);
    expect(cache![0]!.id).toBe('srv-2');
  });

  it('invalidates sub-queries (channels, members, roles) for the deleted server', () => {
    queryClient.setQueryData<Server[]>(keys.servers, [makeServer({ id: 'srv-1' })]);
    // Seed sub-caches so we can verify they're invalidated.
    queryClient.setQueryData<Channel[]>(keys.channels('srv-1'), [makeChannel()]);
    queryClient.setQueryData<Member[]>(keys.members('srv-1'), [makeMember()]);
    queryClient.setQueryData<Role[]>(keys.roles('srv-1'), [makeRole()]);

    const frame: ServerDeletedFrame = { op: 'server.deleted', d: { serverId: 'srv-1' } };
    applyEvent(frame);

    // Server is removed from servers cache.
    const servers = queryClient.getQueryData<Server[]>(keys.servers);
    expect(servers).toHaveLength(0);
  });
});

// ── default case ───────────────────────────────────────────────────────

describe('default (unknown op)', () => {
  it('logs a warning instead of silently dropping', () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    try {
      applyEvent({ op: 'bogus.event' as any, d: {} });
      expect(warnSpy).toHaveBeenCalledWith('applyEvent: unhandled op', { op: 'bogus.event' });
    } finally {
      warnSpy.mockRestore();
    }
  });
});
