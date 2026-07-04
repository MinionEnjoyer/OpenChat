// Mirror of apps/api/src/permissions/permissions.ts — keep in sync.

export const Permission = {
  ADMINISTRATOR: 1n << 0n,
  MANAGE_SERVER: 1n << 1n,
  MANAGE_CHANNELS: 1n << 2n,
  MANAGE_ROLES: 1n << 3n,
  MANAGE_MEMBERS: 1n << 4n,
  CREATE_INVITE: 1n << 5n,
  MANAGE_MESSAGES: 1n << 6n,
  MENTION_EVERYONE: 1n << 7n,
} as const;

export const PERMISSION_LIST: { name: keyof typeof Permission; bit: bigint; label: string }[] = [
  { name: 'ADMINISTRATOR', bit: Permission.ADMINISTRATOR, label: 'Administrator (all permissions)' },
  { name: 'MANAGE_SERVER', bit: Permission.MANAGE_SERVER, label: 'Manage Server' },
  { name: 'MANAGE_CHANNELS', bit: Permission.MANAGE_CHANNELS, label: 'Manage Channels' },
  { name: 'MANAGE_ROLES', bit: Permission.MANAGE_ROLES, label: 'Manage Roles' },
  { name: 'MANAGE_MEMBERS', bit: Permission.MANAGE_MEMBERS, label: 'Kick Members' },
  { name: 'CREATE_INVITE', bit: Permission.CREATE_INVITE, label: 'Create Invites' },
  { name: 'MANAGE_MESSAGES', bit: Permission.MANAGE_MESSAGES, label: 'Manage Messages' },
  { name: 'MENTION_EVERYONE', bit: Permission.MENTION_EVERYONE, label: 'Mention @everyone / @here' },
];

const MANAGEMENT =
  Permission.MANAGE_SERVER | Permission.MANAGE_CHANNELS | Permission.MANAGE_ROLES | Permission.MANAGE_MEMBERS;

export function toBig(perms: string | bigint): bigint {
  if (typeof perms === 'bigint') return perms;
  try {
    return BigInt(perms || '0');
  } catch {
    return 0n;
  }
}

export function has(perms: string | bigint, flag: bigint): boolean {
  const p = toBig(perms);
  return (p & Permission.ADMINISTRATOR) !== 0n || (p & flag) !== 0n;
}

/** Whether to show the server admin panel entry point. */
export function canManageServer(perms: string | bigint): boolean {
  return has(perms, MANAGEMENT);
}
