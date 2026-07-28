/**
 * Server permission bitfield (stored on Role.permissions as BigInt).
 * ADMINISTRATOR implicitly grants every permission; the server owner always
 * has ADMINISTRATOR regardless of roles.
 *
 * This file mirrors apps/api/src/permissions/permissions.ts identically.
 * FR-ROLE-002 requires client and server semantics to be identical.
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

/**
 * Check if a permission bitfield grants a specific flag.
 * ADMINISTRATOR implicitly grants everything.
 */
export function hasPermission(perms: bigint, flag: bigint): boolean {
  return (perms & Permission.ADMINISTRATOR) !== 0n || (perms & flag) !== 0n;
}

/**
 * Check if a myPermissions string (from SerializedServer) grants a flag.
 * Owner-perms already expand to ADMINISTRATOR server-side, but we also check
 * ownerId === myUserId as a separate path for delete gating.
 */
export function hasServerPermission(permsStr: string | undefined, flag: bigint): boolean {
  if (!permsStr) return false;
  try {
    return hasPermission(BigInt(permsStr), flag);
  } catch {
    return false;
  }
}

/**
 * Returns true if the user is the server owner.
 * Owner always has ADMINISTRATOR, but delete is explicitly owner-only.
 */
export function isServerOwner(myUserId: string | undefined, ownerId: string | undefined): boolean {
  if (!myUserId || !ownerId) return false;
  return myUserId === ownerId;
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
