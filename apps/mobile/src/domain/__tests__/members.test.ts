// @ts-nocheck — test assertions on known-present array elements

/**
 * Unit tests for member grouping and sorting logic (FR-SRV-007, FR-SRV-008).
 *
 * @satisfies FR-SRV-007
 * @satisfies FR-SRV-008
 */
import {
  attachRoleNames,
  sortByPresence,
  groupMembers,
  buildMemberGroups,
  canManageMembers,
  type MemberWithRoleNames,
} from '../members';
import type { Member, Role } from '../../api/schema';

// ── Test fixtures ──

function m(userId: string, overrides: Partial<Member> = {}): Member {
  return {
    userId,
    nickname: null,
    isOwner: false,
    joinedAt: new Date().toISOString(),
    roleIds: [],
    user: {
      id: userId,
      username: `user-${userId}`,
      displayName: null,
      avatarUrl: null,
      status: 'OFFLINE',
    },
    ...overrides,
  };
}

function mrn(userId: string, overrides: Partial<MemberWithRoleNames> = {}): MemberWithRoleNames {
  const base = m(userId, overrides);
  return { ...base, roleNames: (overrides.roleNames as string[]) ?? [] };
}

function role(id: string, overrides: Partial<Role> = {}): Role {
  return {
    id,
    serverId: 'srv-1',
    name: `Role-${id}`,
    color: 0,
    permissions: '0',
    position: 0,
    ...overrides,
  };
}

// ── attachRoleNames ──

describe('attachRoleNames', () => {
  // @satisfies FR-SRV-007
  it('maps roleIds to role names', () => {
    const r1 = role('r1', { name: 'Admin' });
    const r2 = role('r2', { name: 'Mod' });
    const members = [
      m('u1', { roleIds: ['r1', 'r2'] }),
      m('u2', { roleIds: ['r2'] }),
    ];
    const result = attachRoleNames(members, [r1, r2]);
    expect(result[0].roleNames).toEqual(['Admin', 'Mod']);
    expect(result[1].roleNames).toEqual(['Mod']);
  });

  // @satisfies FR-SRV-007
  it('filters out unknown role IDs', () => {
    const members = [m('u1', { roleIds: ['nonexistent'] })];
    const result = attachRoleNames(members, []);
    expect(result[0].roleNames).toEqual([]);
  });
});

// ── sortByPresence ──

describe('sortByPresence', () => {
  // @satisfies FR-SRV-007
  it('sorts ONLINE before OFFLINE within same role group', () => {
    const alice = mrn('alice', {
      user: { id: 'alice', username: 'alice', displayName: null, avatarUrl: null, status: 'ONLINE' },
    });
    const bob = mrn('bob', {
      user: { id: 'bob', username: 'bob', displayName: null, avatarUrl: null, status: 'OFFLINE' },
    });
    const sorted = sortByPresence([bob, alice]);
    expect(sorted[0].userId).toBe('alice');
    expect(sorted[1].userId).toBe('bob');
  });

  // @satisfies FR-SRV-007
  it('sorts DND above AWAY above OFFLINE', () => {
    const offline = mrn('offline', {
      user: { id: 'offline', username: 'offline', displayName: null, avatarUrl: null, status: 'OFFLINE' },
    });
    const away = mrn('away', {
      user: { id: 'away', username: 'away', displayName: null, avatarUrl: null, status: 'AWAY' },
    });
    const dnd = mrn('dnd', {
      user: { id: 'dnd', username: 'dnd', displayName: null, avatarUrl: null, status: 'DND' },
    });
    const sorted = sortByPresence([offline, away, dnd]);
    expect(sorted[0].userId).toBe('dnd');
    expect(sorted[1].userId).toBe('away');
    expect(sorted[2].userId).toBe('offline');
  });

  // @satisfies FR-SRV-007 — naive comparator that sorts by presence only
  // would put them wrong; our sort is stable within same presence tier.
  it('sorts alphabetically within same presence tier — breaking a naive presence-only sort', () => {
    const charlie = mrn('charlie', {
      user: { id: 'charlie', username: 'charlie', displayName: null, avatarUrl: null, status: 'ONLINE' },
    });
    const alice = mrn('alice', {
      user: { id: 'alice', username: 'alice', displayName: null, avatarUrl: null, status: 'ONLINE' },
    });
    const bob = mrn('bob', {
      user: { id: 'bob', username: 'bob', displayName: null, avatarUrl: null, status: 'ONLINE' },
    });
    const sorted = sortByPresence([charlie, alice, bob]);
    expect(sorted[0].userId).toBe('alice');
    expect(sorted[1].userId).toBe('bob');
    expect(sorted[2].userId).toBe('charlie');
  });

  // @satisfies FR-SRV-007
  it('puts owner first within equal-presence group', () => {
    const owner = mrn('owner', {
      isOwner: true,
      user: { id: 'owner', username: 'owner', displayName: null, avatarUrl: null, status: 'OFFLINE' },
    });
    const member = mrn('member', {
      user: { id: 'member', username: 'member', displayName: null, avatarUrl: null, status: 'ONLINE' },
    });
    const sorted = sortByPresence([member, owner]);
    expect(sorted[0].userId).toBe('owner');
    expect(sorted[1].userId).toBe('member');
  });
});

// ── groupMembers ──

describe('groupMembers', () => {
  // @satisfies FR-SRV-007
  it('groups members by highest-position role', () => {
    const admin = role('admin', { name: 'Admin', position: 2 });
    const mod = role('mod', { name: 'Mod', position: 1 });

    const alice = mrn('alice', { roleIds: ['admin'], roleNames: ['Admin'] });
    const bob = mrn('bob', { roleIds: ['mod'], roleNames: ['Mod'] });

    const groups = groupMembers([alice, bob], [admin, mod]);
    expect(groups).toHaveLength(2);
    expect(groups[0].roleName).toBe('Admin');
    expect(groups[1].roleName).toBe('Mod');
    expect(groups[0].members[0].userId).toBe('alice');
    expect(groups[1].members[0].userId).toBe('bob');
  });

  // @satisfies FR-SRV-007
  it('places members with no roles in "Member" group last', () => {
    const admin = role('admin', { name: 'Admin', position: 1 });
    const alice = mrn('alice', { roleIds: ['admin'], roleNames: ['Admin'] });
    const noRole = mrn('norole');

    const groups = groupMembers([noRole, alice], [admin]);
    expect(groups).toHaveLength(2);
    expect(groups[0].roleName).toBe('Admin');
    expect(groups[1].roleName).toBe('Member');
    expect(groups[1].members[0].userId).toBe('norole');
  });

  // @satisfies FR-SRV-007
  it('a member with multiple roles uses the highest-position role', () => {
    const admin = role('admin', { name: 'Admin', position: 2 });
    const mod = role('mod', { name: 'Mod', position: 1 });
    const alice = mrn('alice', { roleIds: ['admin', 'mod'], roleNames: ['Admin', 'Mod'] });

    const groups = groupMembers([alice], [admin, mod]);
    expect(groups).toHaveLength(1);
    expect(groups[0].roleName).toBe('Admin');
  });

  // @satisfies FR-SRV-007 — sorted within groups by presence
  it('members within each group are sorted by presence', () => {
    const mod = role('mod', { name: 'Mod', position: 1 });
    const alice = mrn('alice', {
      roleIds: ['mod'], roleNames: ['Mod'],
      user: { id: 'alice', username: 'alice', displayName: null, avatarUrl: null, status: 'ONLINE' },
    });
    const bob = mrn('bob', {
      roleIds: ['mod'], roleNames: ['Mod'],
      user: { id: 'bob', username: 'bob', displayName: null, avatarUrl: null, status: 'OFFLINE' },
    });

    const groups = groupMembers([bob, alice], [mod]);
    expect(groups[0].members[0].userId).toBe('alice');
    expect(groups[0].members[1].userId).toBe('bob');
  });
});

// ── buildMemberGroups (pipeline) ──

describe('buildMemberGroups', () => {
  // @satisfies FR-SRV-007
  it('full pipeline: attaches role names, groups, and sorts', () => {
    const admin = role('r-admin', { name: 'Admin', position: 2 });
    const mod = role('r-mod', { name: 'Mod', position: 1 });

    const owner = m('owner', {
      isOwner: true,
      roleIds: ['r-admin'],
      user: { id: 'owner', username: 'zz-owner', displayName: null, avatarUrl: null, status: 'OFFLINE' },
    });
    const alice = m('alice', {
      roleIds: ['r-mod'],
      user: { id: 'alice', username: 'alice', displayName: null, avatarUrl: null, status: 'ONLINE' },
    });

    const groups = buildMemberGroups([alice, owner], [admin, mod]);
    expect(groups).toHaveLength(2);
    expect(groups[0].roleName).toBe('Admin');
    expect(groups[0].members[0].userId).toBe('owner');
    expect(groups[1].roleName).toBe('Mod');
    expect(groups[1].members[0].userId).toBe('alice');
  });
});

// ── canManageMembers ──

describe('canManageMembers', () => {
  // @satisfies FR-SRV-008
  it('returns true when MANAGE_MEMBERS bit (1n<<4n = 16) is set', () => {
    expect(canManageMembers('16')).toBe(true);
  });

  // @satisfies FR-SRV-008
  it('returns false when MANAGE_MEMBERS bit is not set', () => {
    expect(canManageMembers('0')).toBe(false);
    expect(canManageMembers('8')).toBe(false); // MANAGE_ROLES only
  });

  // @satisfies FR-SRV-008
  it('returns true for ADMINISTRATOR (bit 0 = 1)', () => {
    expect(canManageMembers('1')).toBe(true);
  });

  // @satisfies FR-SRV-008
  it('returns false for undefined permissions', () => {
    expect(canManageMembers(undefined)).toBe(false);
  });

  // @satisfies FR-SRV-008
  it('returns false for invalid string', () => {
    expect(canManageMembers('not-a-number')).toBe(false);
  });
});
