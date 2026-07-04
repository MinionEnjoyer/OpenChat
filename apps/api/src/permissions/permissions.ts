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
} as const;

export type PermissionName = keyof typeof Permission;

/** Every non-administrator permission OR'd together (what ADMINISTRATOR expands to). */
export const ALL_PERMISSIONS: bigint = Object.values(Permission).reduce((a, b) => a | b, 0n);

/** Sensible defaults for a brand-new member/@everyone: chat + invite. */
export const DEFAULT_MEMBER_PERMISSIONS: bigint =
  Permission.CREATE_INVITE;

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
];
