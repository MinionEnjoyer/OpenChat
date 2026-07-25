/**
 * Server permission bitfield (stored on Role.permissions as BigInt).
 * ADMINISTRATOR implicitly grants every permission; the server owner always
 * has ADMINISTRATOR regardless of roles.
 */
export const Permission = {
  ADMINISTRATOR: 1n << 0n,
  MANAGE_SERVER: 1n << 1n, // rename server, edit settings
  MANAGE_CHANNELS: 1n << 2n, // create / delete channels
  MANAGE_ROLES: 1n << 3n, // create / edit / assign roles
  MANAGE_MEMBERS: 1n << 4n, // kick members
  CREATE_INVITE: 1n << 5n, // generate invite codes
  MANAGE_MESSAGES: 1n << 6n, // delete others' messages
  MENTION_EVERYONE: 1n << 7n, // ping @everyone / @here
  BAN_MEMBERS: 1n << 8n, // ban/unban members, view ban list
  SEND_MESSAGES: 1n << 9n, // send messages in channels (x-added-by P7)
  READ_MESSAGES: 1n << 10n, // read channel messages (x-added-by P7)
} as const;

export type PermissionName = keyof typeof Permission;

/** Every non-administrator permission OR'd together (what ADMINISTRATOR expands to). */
export const ALL_PERMISSIONS: bigint = Object.values(Permission).reduce((a, b) => a | b, 0n);

/** Sensible defaults for a brand-new member/@everyone: chat, read, invite. */
export const DEFAULT_MEMBER_PERMISSIONS: bigint =
  Permission.CREATE_INVITE | Permission.SEND_MESSAGES | Permission.READ_MESSAGES;

export function hasPermission(perms: bigint, flag: bigint): boolean {
  return (perms & Permission.ADMINISTRATOR) !== 0n || (perms & flag) !== 0n;
}

/** Ordered list for building admin UIs; label is human-readable. */
export const PERMISSION_LIST: { name: PermissionName; bit: string; label: string }[] = [
  { name: 'ADMINISTRATOR', bit: Permission.ADMINISTRATOR.toString(), label: 'Administrator (all permissions)' },
  { name: 'MANAGE_SERVER', bit: Permission.MANAGE_SERVER.toString(), label: 'Manage Server' },
  { name: 'MANAGE_CHANNELS', bit: Permission.MANAGE_CHANNELS.toString(), label: 'Manage Channels' },
  { name: 'MANAGE_ROLES', bit: Permission.MANAGE_ROLES.toString(), label: 'Manage Roles' },
  { name: 'MANAGE_MEMBERS', bit: Permission.MANAGE_MEMBERS.toString(), label: 'Kick Members' },
  { name: 'CREATE_INVITE', bit: Permission.CREATE_INVITE.toString(), label: 'Create Invites' },
  { name: 'MANAGE_MESSAGES', bit: Permission.MANAGE_MESSAGES.toString(), label: 'Manage Messages' },
  { name: 'MENTION_EVERYONE', bit: Permission.MENTION_EVERYONE.toString(), label: 'Mention @everyone / @here' },
  { name: 'BAN_MEMBERS', bit: Permission.BAN_MEMBERS.toString(), label: 'Ban Members' },
  { name: 'SEND_MESSAGES', bit: Permission.SEND_MESSAGES.toString(), label: 'Send Messages' },
  { name: 'READ_MESSAGES', bit: Permission.READ_MESSAGES.toString(), label: 'Read Messages' },
];

// ═══════════════════════════════════════════════════════════════════════════════
//  Channel permission overwrite resolver (FR-ROLE-003)
//  Discord precedence order — source: https://discord.com/developers/docs/topics/permissions
//
//  Tier 0: @everyone role base permissions
//  Tier 1: Role overwrites (allow/deny from ROLE-type overwrites matching member's roles)
//          Within Tier 1, deny beats allow (deny applied after all allows).
//  Tier 2: Member overwrites (allow/deny from MEMBER-type overwrite matching member)
//          Within Tier 2, deny beats allow.
//  Bypass: Server owner OR any role with ADMINISTRATOR → ALL_PERMISSIONS
//
//  Higher tiers override lower tiers; within a tier, deny beats allow.
// ═══════════════════════════════════════════════════════════════════════════════

/** A single channel overwrite entry (matches Prisma ChannelOverwrite shape). */
export interface ChannelOverwrite {
  targetType: 'ROLE' | 'MEMBER';
  targetId: string;
  allow: bigint;
  deny: bigint;
}

export interface ResolveEffectivePermissionsInput {
  /** The @everyone role's permissions (bitfield). */
  everyonePermissions: bigint;
  /** Union of all non-@everyone roles' permissions the member holds. */
  rolePermissions: bigint;
  /** Set of role IDs the member has (for matching ROLE-type overwrites). */
  memberRoleIds: Set<string>;
  /** The member's user ID (for matching MEMBER-type overwrites). */
  userId: string;
  /** Channel overwrites for this channel. */
  overwrites: ChannelOverwrite[];
  /** Whether the user is the server owner. */
  isOwner: boolean;
}

/**
 * PURE function: compute effective permissions for a user on a specific channel.
 * No I/O, no side effects — directly exercisable by the golden-table tests.
 *
 * Returns the effective BigInt permission bitfield.
 */
export function resolveEffectivePermissions(input: ResolveEffectivePermissionsInput): bigint {
  // Owner bypass: server owner always gets all permissions.
  if (input.isOwner) {
    return ALL_PERMISSIONS;
  }

  // ADMINISTRATOR bypass: if any of the user's roles has ADMINISTRATOR, all permissions.
  if ((input.rolePermissions & Permission.ADMINISTRATOR) !== 0n) {
    return ALL_PERMISSIONS;
  }

  // Tier 0: start with @everyone base, OR in other role permissions.
  let effective: bigint = input.everyonePermissions | input.rolePermissions;

  // Tier 1: apply role-specific channel overwrites.
  // Collect all allows and denies from ROLE overwrites matching any of the member's roles.
  let roleAllow = 0n;
  let roleDeny = 0n;
  for (const ow of input.overwrites) {
    if (ow.targetType === 'ROLE' && input.memberRoleIds.has(ow.targetId)) {
      roleAllow |= ow.allow;
      roleDeny |= ow.deny;
    }
  }
  // Apply role overwrites: allow first, then deny (deny beats allow at same tier).
  effective |= roleAllow;
  effective &= ~roleDeny;

  // Tier 2: apply member-specific channel overwrite.
  const memberOw = input.overwrites.find(
    (ow) => ow.targetType === 'MEMBER' && ow.targetId === input.userId,
  );
  if (memberOw) {
    effective |= memberOw.allow;
    effective &= ~memberOw.deny;
  }

  return effective;
}