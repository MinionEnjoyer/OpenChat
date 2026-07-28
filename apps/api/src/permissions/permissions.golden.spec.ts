/**
 * Golden table for resolveEffectivePermissions — 25 cases (FR-ROLE-003).
 *
 * Precedence order (Discord-compatible):
 *   Bypass:  Server owner → ALL_PERMISSIONS (always, regardless of overwrites)
 *   Bypass:  ADMINISTRATOR role → ALL_PERMISSIONS
 *   Tier 0:  @everyone role base permissions
 *   Tier 1:  Role overwrites (allow first, then deny — deny beats allow within tier)
 *   Tier 2:  Member overwrites (allow first, then deny — deny beats allow within tier)
 *
 * Higher tiers override lower tiers. Within a tier, deny beats allow.
 *
 * @satisfies FR-ROLE-003
 */
import {
  resolveEffectivePermissions,
  Permission,
  ALL_PERMISSIONS,
  type ChannelOverwrite,
  type ResolveEffectivePermissionsInput,
} from './permissions';

// Shorthand helpers
const SEND = Permission.SEND_MESSAGES;
const READ = Permission.READ_MESSAGES;
const INVITE = Permission.CREATE_INVITE;
const ADMIN = Permission.ADMINISTRATOR;
const OWNER = 'owner-user';
const MEMBER = 'member-user';
const ADMIN_USER = 'admin-user';
const ROLE_A = 'role-a';
const ROLE_B = 'role-b';
const ROLE_EVERYONE = 'role-everyone';

function ow(type: 'ROLE' | 'MEMBER', targetId: string, allow: bigint, deny: bigint): ChannelOverwrite {
  return { targetType: type, targetId, allow, deny };
}

interface Case {
  name: string;
  input: ResolveEffectivePermissionsInput;
  expected: bigint;
}

const cases: Case[] = [
  // ═══════════════════════════════════════════════════════════════
  //  OWNER BYPASS
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'C01: owner bypass — returns ALL_PERMISSIONS regardless of everything',
    input: {
      everyonePermissions: 0n, rolePermissions: 0n,
      memberRoleIds: new Set(), userId: OWNER, overwrites: [], isOwner: true,
    },
    expected: ALL_PERMISSIONS,
  },
  {
    name: 'C02: owner bypass with deny overwrite — still ALL_PERMISSIONS',
    input: {
      everyonePermissions: 0n, rolePermissions: 0n,
      memberRoleIds: new Set(), userId: OWNER,
      overwrites: [ow('MEMBER', OWNER, 0n, ALL_PERMISSIONS)], // deny everything
      isOwner: true,
    },
    expected: ALL_PERMISSIONS,
  },

  // ═══════════════════════════════════════════════════════════════
  //  ADMINISTRATOR BYPASS
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'C03: ADMINISTRATOR role bypass — ALL_PERMISSIONS',
    input: {
      everyonePermissions: 0n, rolePermissions: ADMIN,
      memberRoleIds: new Set([ROLE_A]), userId: ADMIN_USER,
      overwrites: [], isOwner: false,
    },
    expected: ALL_PERMISSIONS,
  },
  {
    name: 'C04: ADMINISTRATOR bypass with deny overwrite — still ALL_PERMISSIONS',
    input: {
      everyonePermissions: 0n, rolePermissions: ADMIN,
      memberRoleIds: new Set([ROLE_A]), userId: ADMIN_USER,
      overwrites: [ow('ROLE', ROLE_A, 0n, ALL_PERMISSIONS)], // role overwrite denies everything
      isOwner: false,
    },
    expected: ALL_PERMISSIONS,
  },

  // ═══════════════════════════════════════════════════════════════
  //  TIER 0: @everyone base permissions
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'C05: @everyone base allow SEND → member can send',
    input: {
      everyonePermissions: SEND, rolePermissions: 0n,
      memberRoleIds: new Set([ROLE_EVERYONE]), userId: MEMBER,
      overwrites: [], isOwner: false,
    },
    expected: SEND,
  },
  {
    name: 'C06: @everyone base deny (permissions=0) — nothing granted',
    input: {
      everyonePermissions: 0n, rolePermissions: 0n,
      memberRoleIds: new Set([ROLE_EVERYONE]), userId: MEMBER,
      overwrites: [], isOwner: false,
    },
    expected: 0n,
  },
  {
    name: 'C07: @everyone SEND + role INVITE → union of both',
    input: {
      everyonePermissions: SEND, rolePermissions: INVITE,
      memberRoleIds: new Set([ROLE_EVERYONE, ROLE_A]), userId: MEMBER,
      overwrites: [], isOwner: false,
    },
    expected: SEND | INVITE,
  },

  // ═══════════════════════════════════════════════════════════════
  //  TIER 1: Role overwrites — allow
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'C08: role overwrite allow READ → READ granted on top of base',
    input: {
      everyonePermissions: SEND, rolePermissions: 0n,
      memberRoleIds: new Set([ROLE_EVERYONE, ROLE_A]), userId: MEMBER,
      overwrites: [ow('ROLE', ROLE_A, READ, 0n)],
      isOwner: false,
    },
    expected: SEND | READ,
  },
  {
    name: 'C09: role overwrite allow on role member does NOT have — ignored',
    input: {
      everyonePermissions: SEND, rolePermissions: 0n,
      memberRoleIds: new Set([ROLE_EVERYONE]), userId: MEMBER,
      overwrites: [ow('ROLE', ROLE_B, READ, 0n)], // user doesn't have ROLE_B
      isOwner: false,
    },
    expected: SEND,
  },

  // ═══════════════════════════════════════════════════════════════
  //  TIER 1: Role overwrites — deny beats allow
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'C10: role deny beats role allow (same tier, same role)',
    input: {
      everyonePermissions: SEND | READ, rolePermissions: 0n,
      memberRoleIds: new Set([ROLE_EVERYONE, ROLE_A]), userId: MEMBER,
      overwrites: [ow('ROLE', ROLE_A, READ, READ)], // allow READ, deny READ
      isOwner: false,
    },
    expected: SEND, // READ denied (deny beats allow within same tier)
  },
  {
    name: 'C11: role deny SEND removes SEND from base',
    input: {
      everyonePermissions: SEND | READ, rolePermissions: 0n,
      memberRoleIds: new Set([ROLE_EVERYONE, ROLE_A]), userId: MEMBER,
      overwrites: [ow('ROLE', ROLE_A, 0n, SEND)],
      isOwner: false,
    },
    expected: READ, // SEND denied, READ remains from @everyone
  },
  {
    name: 'C12: role deny only affects matching role — other role unaffected',
    input: {
      everyonePermissions: SEND, rolePermissions: READ, // rolePermissions adds READ from a non-@everyone role
      memberRoleIds: new Set([ROLE_EVERYONE, ROLE_A, ROLE_B]), userId: MEMBER,
      overwrites: [ow('ROLE', ROLE_A, 0n, SEND)], // ROLE_A denies SEND
      isOwner: false,
    },
    expected: READ, // SEND denied by ROLE_A, READ from rolePermissions remains (ROLE_A deny only targets SEND, READ was from rolePermissions union not from ROLE_A)
  },

  // ═══════════════════════════════════════════════════════════════
  //  TIER 1: Role overwrites — multi-role interaction
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'C13: multi-role: ROLE_A allows READ, ROLE_B denies SEND',
    input: {
      everyonePermissions: SEND | READ, rolePermissions: 0n,
      memberRoleIds: new Set([ROLE_EVERYONE, ROLE_A, ROLE_B]), userId: MEMBER,
      overwrites: [
        ow('ROLE', ROLE_A, READ, 0n),  // allow READ (redundant — already have it)
        ow('ROLE', ROLE_B, 0n, SEND),   // deny SEND
      ],
      isOwner: false,
    },
    expected: READ, // SEND denied by ROLE_B
  },
  {
    name: 'C14: multi-role: ROLE_A denies SEND, ROLE_B allows SEND — deny wins',
    input: {
      everyonePermissions: READ, rolePermissions: 0n,
      memberRoleIds: new Set([ROLE_EVERYONE, ROLE_A, ROLE_B]), userId: MEMBER,
      overwrites: [
        ow('ROLE', ROLE_A, 0n, SEND),   // deny SEND
        ow('ROLE', ROLE_B, SEND, 0n),   // allow SEND
      ],
      isOwner: false,
    },
    expected: READ, // SEND denied because deny beats allow within Tier 1
  },

  // ═══════════════════════════════════════════════════════════════
  //  TIER 2: Member overwrites — beats role overwrites
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'C15: member allow SEND beats role deny SEND',
    input: {
      everyonePermissions: READ, rolePermissions: 0n,
      memberRoleIds: new Set([ROLE_EVERYONE, ROLE_A]), userId: MEMBER,
      overwrites: [
        ow('ROLE', ROLE_A, 0n, SEND),     // role denies SEND
        ow('MEMBER', MEMBER, SEND, 0n),    // member allows SEND
      ],
      isOwner: false,
    },
    expected: READ | SEND, // member allow overrides role deny
  },
  {
    name: 'C16: member deny beats member allow (same tier — deny wins)',
    input: {
      everyonePermissions: SEND, rolePermissions: 0n,
      memberRoleIds: new Set([ROLE_EVERYONE]), userId: MEMBER,
      overwrites: [
        ow('MEMBER', MEMBER, SEND, SEND),  // allow SEND, deny SEND → deny wins
      ],
      isOwner: false,
    },
    expected: 0n,
  },
  {
    name: 'C17: member deny beats role allow',
    input: {
      everyonePermissions: 0n, rolePermissions: 0n,
      memberRoleIds: new Set([ROLE_EVERYONE, ROLE_A]), userId: MEMBER,
      overwrites: [
        ow('ROLE', ROLE_A, SEND, 0n),      // role allows SEND
        ow('MEMBER', MEMBER, 0n, SEND),     // member denies SEND
      ],
      isOwner: false,
    },
    expected: 0n, // member deny beats role allow
  },
  {
    name: 'C18: member overwrite only applies to matching user',
    input: {
      everyonePermissions: SEND, rolePermissions: 0n,
      memberRoleIds: new Set([ROLE_EVERYONE]), userId: MEMBER,
      overwrites: [
        ow('MEMBER', 'other-user', 0n, SEND), // deny for someone else
      ],
      isOwner: false,
    },
    expected: SEND, // overwrite doesn't match this user
  },

  // ═══════════════════════════════════════════════════════════════
  //  COMBINED: full precedence chain
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'C19: Tier 0 base + Tier 1 role-deny + Tier 2 member-allow',
    input: {
      everyonePermissions: SEND | READ, rolePermissions: INVITE,
      memberRoleIds: new Set([ROLE_EVERYONE, ROLE_A]), userId: MEMBER,
      overwrites: [
        ow('ROLE', ROLE_A, 0n, SEND),       // Tier 1: role denies SEND
        ow('MEMBER', MEMBER, SEND, 0n),      // Tier 2: member allows SEND back
      ],
      isOwner: false,
    },
    expected: SEND | READ | INVITE, // member allow restores SEND
  },
  {
    name: 'C20: Tier 0 base + Tier 1 role-allow + Tier 2 member-deny',
    input: {
      everyonePermissions: READ, rolePermissions: 0n,
      memberRoleIds: new Set([ROLE_EVERYONE, ROLE_A]), userId: MEMBER,
      overwrites: [
        ow('ROLE', ROLE_A, SEND, 0n),       // Tier 1: role allows SEND
        ow('MEMBER', MEMBER, 0n, SEND),      // Tier 2: member denies SEND
      ],
      isOwner: false,
    },
    expected: READ, // member deny beats role allow
  },

  // ═══════════════════════════════════════════════════════════════
  //  EDGE CASES
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'C21: empty overwrites — base + roles only',
    input: {
      everyonePermissions: INVITE, rolePermissions: SEND | READ,
      memberRoleIds: new Set([ROLE_EVERYONE, ROLE_A]), userId: MEMBER,
      overwrites: [],
      isOwner: false,
    },
    expected: INVITE | SEND | READ,
  },
  {
    name: 'C22: non-member user (no roles, no @everyone) — nothing',
    input: {
      everyonePermissions: 0n, rolePermissions: 0n,
      memberRoleIds: new Set(), userId: 'stranger',
      overwrites: [],
      isOwner: false,
    },
    expected: 0n,
  },
  {
    name: 'C23: member deny ALL on everyone base — nothing left',
    input: {
      everyonePermissions: SEND | READ | INVITE, rolePermissions: 0n,
      memberRoleIds: new Set([ROLE_EVERYONE]), userId: MEMBER,
      overwrites: [ow('MEMBER', MEMBER, 0n, ALL_PERMISSIONS)],
      isOwner: false,
    },
    expected: 0n,
  },
  {
    name: 'C24: member allow only (no base) — exact allow set',
    input: {
      everyonePermissions: 0n, rolePermissions: 0n,
      memberRoleIds: new Set([ROLE_EVERYONE]), userId: MEMBER,
      overwrites: [ow('MEMBER', MEMBER, SEND | READ, 0n)],
      isOwner: false,
    },
    expected: SEND | READ,
  },
  {
    name: 'C25: multiple role overwrites accumulate deny union',
    input: {
      everyonePermissions: SEND | READ | INVITE, rolePermissions: 0n,
      memberRoleIds: new Set([ROLE_EVERYONE, ROLE_A, ROLE_B]), userId: MEMBER,
      overwrites: [
        ow('ROLE', ROLE_A, 0n, SEND),
        ow('ROLE', ROLE_B, 0n, READ),
      ],
      isOwner: false,
    },
    expected: INVITE, // SEND denied by ROLE_A, READ denied by ROLE_B
  },
];

describe('resolveEffectivePermissions — golden table (@satisfies FR-ROLE-003)', () => {
  it.each(cases)('$name', ({ input, expected }) => {
    const result = resolveEffectivePermissions(input);
    expect(result).toBe(expected);
  });

  it('has exactly 25 cases', () => {
    expect(cases.length).toBe(25);
  });
});
