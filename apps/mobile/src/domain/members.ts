/**
 * Member grouping and sorting logic (FR-SRV-007, FR-SRV-008).
 *
 * Pure functions — no I/O, no side effects. Directly exercisable by unit tests.
 *
 * @satisfies FR-SRV-007
 */

import type { Member, Role } from '../api/schema';

/** Presence priority: higher = more "present". */
export const PRESENCE_PRIORITY: Record<string, number> = {
  ONLINE: 4,
  DND: 3,
  AWAY: 2,
  INVISIBLE: 1,
  OFFLINE: 0,
};

export interface MemberWithRoleNames extends Member {
  roleNames: string[];
}

export interface RoleGroup {
  roleName: string;
  color: number;
  members: MemberWithRoleNames[];
}

/**
 * Attach role names to each member by mapping roleIds → role names.
 */
export function attachRoleNames(members: Member[], roles: Role[]): MemberWithRoleNames[] {
  const roleMap = new Map<string, Role>();
  for (const r of roles) roleMap.set(r.id, r);
  return members.map((m) => ({
    ...m,
    roleNames: m.roleIds.map((id) => roleMap.get(id)?.name ?? 'Unknown').filter((n) => n !== 'Unknown'),
  }));
}

/**
 * Primary sort: sort members within each group by presence (descending),
 * then by displayName/username (ascending, case-insensitive).
 * Owner comes first within their role group.
 */
export function sortByPresence(members: MemberWithRoleNames[]): MemberWithRoleNames[] {
  return [...members].sort((a, b) => {
    // Owner first within the group
    if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
    // Presence descending
    const pa = PRESENCE_PRIORITY[a.user?.status ?? 'OFFLINE'] ?? 0;
    const pb = PRESENCE_PRIORITY[b.user?.status ?? 'OFFLINE'] ?? 0;
    if (pa !== pb) return pb - pa;
    // Alphabetical by displayName, fall back to username
    const na = (a.user?.displayName ?? a.user?.username ?? '').toLowerCase();
    const nb = (b.user?.displayName ?? b.user?.username ?? '').toLowerCase();
    return na.localeCompare(nb);
  });
}

/**
 * Group members by their highest-position role. Members with no roles
 * are placed in a "Member" group at the bottom. Owner is always grouped
 * with their highest role but placed first within it (via sortByPresence).
 */
export function groupMembers(
  members: MemberWithRoleNames[],
  roles: Role[],
): RoleGroup[] {
  // Sort roles by position descending for group ordering
  const roleById = new Map<string, Role>();
  for (const r of roles) roleById.set(r.id, r);

  const groups = new Map<string, { roleName: string; color: number; members: MemberWithRoleNames[] }>();

  for (const member of members) {
    // Find highest-position role for this member
    let bestRole: Role | null = null;
    for (const rid of member.roleIds) {
      const r = roleById.get(rid);
      if (r && (!bestRole || r.position > bestRole.position)) {
        bestRole = r;
      }
    }
    const roleName = bestRole?.name ?? 'Member';
    const color = bestRole?.color ?? 0;

    if (!groups.has(roleName)) {
      groups.set(roleName, { roleName, color, members: [] });
    }
    groups.get(roleName)!.members.push(member);
  }

  // Sort members within each group
  for (const [, g] of groups) {
    g.members = sortByPresence(g.members);
  }

  // Sort groups: owner's group first (? no — groups are by role), then by role position desc
  // Role "Member" (no-role) goes last
  const sortedGroups = [...groups.values()].sort((a, b) => {
    // Find the max position among roles with these names
    const posA = roles.find((r) => r.name === a.roleName)?.position ?? -1;
    const posB = roles.find((r) => r.name === b.roleName)?.position ?? -1;
    return posB - posA;
  });

  return sortedGroups;
}

/**
 * Full pipeline: attach role names → group by role → sort within groups.
 */
export function buildMemberGroups(members: Member[], roles: Role[]): RoleGroup[] {
  const enriched = attachRoleNames(members, roles);
  return groupMembers(enriched, roles);
}

/**
 * Test: does a given permissions string grant MANAGE_MEMBERS?
 * Uses the SHARED Permission constant from schema.ts (FR-ROLE-002).
 */
export function canManageMembers(myPermissions: string | undefined): boolean {
  if (!myPermissions) return false;
  try {
    const perms = BigInt(myPermissions);
    // ADMINISTRATOR implicitly grants all permissions (server-side semantics)
    return (perms & 1n) !== 0n || (perms & (1n << 4n)) !== 0n;
  } catch {
    return false;
  }
}
