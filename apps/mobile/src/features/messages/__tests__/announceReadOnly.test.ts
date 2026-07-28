// @satisfies FR-SRV-010
import { canSendInChannel } from '../announceReadOnly';
import { Permission } from '../../../api/schema';
import type { ChannelPermissionsResponse } from '../../../api/schema';

function perms(permissions: bigint): ChannelPermissionsResponse {
  return { permissions: permissions.toString() };
}

describe('canSendInChannel (FR-SRV-010)', () => {
  // @satisfies FR-SRV-010
  it('returns true for non-ANNOUNCEMENT channels regardless of permissions', () => {
    // TEXT channel — always sendable (backend gates send)
    expect(canSendInChannel('TEXT', perms(0n))).toBe(true);
    expect(canSendInChannel('TEXT', undefined)).toBe(true);
    expect(canSendInChannel('VOICE', perms(0n))).toBe(true);
    expect(canSendInChannel(undefined, undefined)).toBe(true);
    expect(canSendInChannel('DM', perms(Permission.SEND_MESSAGES))).toBe(true);
  });

  // @satisfies FR-SRV-010
  it('returns false for ANNOUNCEMENT channel when permissions not yet loaded', () => {
    // Loading state — assume no send (safe default)
    expect(canSendInChannel('ANNOUNCEMENT', undefined)).toBe(false);
  });

  // @satisfies FR-SRV-010
  it('returns true for ANNOUNCEMENT channel when user has SEND_MESSAGES', () => {
    expect(canSendInChannel('ANNOUNCEMENT', perms(Permission.SEND_MESSAGES))).toBe(true);
    // SEND_MESSAGES as part of ADMINISTRATOR should also work
    expect(canSendInChannel('ANNOUNCEMENT', perms(Permission.ADMINISTRATOR | Permission.SEND_MESSAGES))).toBe(true);
  });

  // @satisfies FR-SRV-010
  it('returns false for ANNOUNCEMENT channel when user lacks SEND_MESSAGES', () => {
    // User has READ_MESSAGES but not SEND_MESSAGES
    expect(canSendInChannel('ANNOUNCEMENT', perms(Permission.READ_MESSAGES))).toBe(false);
    // User has zero permissions
    expect(canSendInChannel('ANNOUNCEMENT', perms(0n))).toBe(false);
    // User has other permissions but not SEND_MESSAGES
    expect(canSendInChannel('ANNOUNCEMENT', perms(Permission.CREATE_INVITE | Permission.READ_MESSAGES))).toBe(false);
  });

  // @satisfies FR-SRV-010
  it('returns false for ANNOUNCEMENT channel when permissions is invalid string', () => {
    // Corrupt/invalid bigint string → no send (safe default)
    expect(canSendInChannel('ANNOUNCEMENT', { permissions: 'not-a-number' })).toBe(false);
  });

  // ── Fixture: prove the test can catch a real bug ──
  // Perturb: temporarily change `ANNOUNCEMENT` → `TEXT` in canSendInChannel
  // and this test MUST fail (wasn't seeing the announcement gate).
  // @satisfies FR-SRV-010
  it('would fail if ANNOUNCEMENT channels were treated the same as TEXT', () => {
    // A naive implementation that ignores channel type would return true here.
    // Our implementation correctly returns false for ANNOUNCEMENT without SEND_MESSAGES.
    expect(canSendInChannel('ANNOUNCEMENT', perms(0n))).toBe(false);

    // Verify the difference: TEXT with 0 permissions still returns true
    // (because server-level permissions gate send at the API level).
    // This demonstrates the type-specific behavior that a naive implementation would miss.
    expect(canSendInChannel('TEXT', perms(0n))).toBe(true);
  });
});
