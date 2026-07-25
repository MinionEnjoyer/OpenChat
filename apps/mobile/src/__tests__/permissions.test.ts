/**
 * FR-SRV-003 — Permission gating unit tests.
 *
 * Tests the shared permission library ensuring client and server semantics
 * are identical (FR-ROLE-002).
 *
 * @satisfies FR-SRV-003
 */
import {
  Permission,
  hasPermission,
  hasServerPermission,
  isServerOwner,
  ALL_PERMISSIONS,
} from '../permissions';

describe('Permission bitfield constants', () => {
  it('ADMINISTRATOR is bit 0', () => {
    expect(Permission.ADMINISTRATOR).toBe(1n << 0n);
  });

  it('MANAGE_SERVER is bit 1', () => {
    expect(Permission.MANAGE_SERVER).toBe(1n << 1n);
  });

  it('ALL_PERMISSIONS includes every flag', () => {
    const all = (Object.values(Permission) as bigint[]).reduce((a, b) => a | b, 0n);
    expect(ALL_PERMISSIONS).toBe(all);
  });
});

describe('hasPermission', () => {
  it('returns true when the exact flag is set', () => {
    expect(hasPermission(Permission.MANAGE_SERVER, Permission.MANAGE_SERVER)).toBe(true);
  });

  it('returns false when the flag is not set', () => {
    expect(hasPermission(Permission.CREATE_INVITE, Permission.MANAGE_SERVER)).toBe(false);
  });

  // @satisfies FR-SRV-003: owner implies admin
  it('ADMINISTRATOR grants every permission (owner ⇒ admin)', () => {
    // If a user has ADMINISTRATOR, every flag check returns true.
    const everyFlag = Object.values(Permission);
    for (const flag of everyFlag) {
      expect(hasPermission(Permission.ADMINISTRATOR, flag)).toBe(true);
    }
  });

  it('returns true for zero (no permissions) when checking ADMINISTRATOR? No', () => {
    // 0n has no flags — ADMINISTRATOR is not set.
    expect(hasPermission(0n, Permission.ADMINISTRATOR)).toBe(false);
  });

  it('returns false for a flag when only another flag is set', () => {
    const perms = Permission.SEND_MESSAGES | Permission.READ_MESSAGES;
    expect(hasPermission(perms, Permission.MANAGE_SERVER)).toBe(false);
  });
});

describe('hasServerPermission', () => {
  // @satisfies FR-SRV-003
  it('returns true when myPermissions string grants MANAGE_SERVER', () => {
    const perms = Permission.MANAGE_SERVER.toString(); // '2'
    expect(hasServerPermission(perms, Permission.MANAGE_SERVER)).toBe(true);
  });

  it('returns false when myPermissions string does not grant MANAGE_SERVER', () => {
    // Only CREATE_INVITE (1<<5 = 32)
    const perms = Permission.CREATE_INVITE.toString(); // '32'
    expect(hasServerPermission(perms, Permission.MANAGE_SERVER)).toBe(false);
  });

  it('returns true when myPermissions includes ADMINISTRATOR (grants everything)', () => {
    const perms = Permission.ADMINISTRATOR.toString(); // '1'
    expect(hasServerPermission(perms, Permission.MANAGE_SERVER)).toBe(true);
    expect(hasServerPermission(perms, Permission.MANAGE_MEMBERS)).toBe(true);
    expect(hasServerPermission(perms, Permission.CREATE_INVITE)).toBe(true);
  });

  it('returns false for undefined permissions', () => {
    expect(hasServerPermission(undefined, Permission.MANAGE_SERVER)).toBe(false);
  });

  it('handles invalid permission string gracefully', () => {
    expect(hasServerPermission('not-a-number', Permission.MANAGE_SERVER)).toBe(false);
  });
});

describe('isServerOwner', () => {
  it('returns true when userId matches ownerId', () => {
    expect(isServerOwner('u1', 'u1')).toBe(true);
  });

  it('returns false when userId does not match ownerId', () => {
    expect(isServerOwner('u1', 'u2')).toBe(false);
  });

  it('returns false when userId is undefined', () => {
    expect(isServerOwner(undefined, 'owner')).toBe(false);
  });

  it('returns false when ownerId is undefined', () => {
    expect(isServerOwner('u1', undefined)).toBe(false);
  });

  it('returns false when both are undefined', () => {
    expect(isServerOwner(undefined, undefined)).toBe(false);
  });
});
