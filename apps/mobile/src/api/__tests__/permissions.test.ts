/**
 * Permissions bitfield unit tests (FR-ROLE-001).
 *
 * Proves:
 *  1. BigInt round-trip exact with high bits (>2^53) — Number() WOULD corrupt.
 *  2. Bit toggle changes exactly one bit and no other.
 *  3. All 11 permission bits are unique and non-overlapping.
 *
 * NOTE: All assertions use string comparisons because Jest cannot serialize
 * BigInt values through its worker protocol. This is also the canonical format
 * since permissions are transported as decimal strings on the wire.
 *
 * @satisfies FR-ROLE-001
 */
import { Permission } from '../schema';

// BigInt-safe helpers (same logic as RolesEditorScreen, tested in isolation)
function strToBigInt(s: string): bigint {
  try { return BigInt(s); } catch { return 0n; }
}
function bigIntToStr(b: bigint): string {
  return b.toString();
}
function hasBit(perms: string, bit: bigint): boolean {
  return (strToBigInt(perms) & bit) !== 0n;
}
function toggleBit(perms: string, bit: bigint, on: boolean): string {
  let current = strToBigInt(perms);
  if (on) {
    current |= bit;
  } else {
    current &= ~bit;
  }
  return bigIntToStr(current);
}

describe('FR-ROLE-001 BigInt round-trip (high bits >2^53)', () => {
  // @satisfies FR-ROLE-001
  it('BigInt round-trip is exact with high bits (1n << 60n)', () => {
    const highBit = 1n << 60n; // 1152921504606846976
    const str = bigIntToStr(highBit);
    expect(str).toBe('1152921504606846976');
    const back = strToBigInt(str);
    // Compare as strings to avoid Jest BigInt serialization issues
    expect(bigIntToStr(back)).toBe(str);
  });

  // @satisfies FR-ROLE-001
  it('Number() WOULD corrupt a high bit — proves why BigInt is mandatory', () => {
    // 2^53 + 1 is the FIRST integer that IEEE 754 double cannot represent exactly.
    // Number(2^53+1) === Number(2^53), losing the +1.
    const val = (1n << 53n) + 1n; // 9007199254740993
    const str = val.toString();   // '9007199254740993'
    // Number() truncates — it cannot represent 2^53+1 exactly
    const asNumber = Number(str);
    // asNumber is 9007199254740992 (the +1 is lost)
    const roundTripped = BigInt(Math.trunc(asNumber)).toString();
    expect(roundTripped).not.toBe(str);
    expect(roundTripped).toBe('9007199254740992'); // Proof: +1 was silently dropped
    // But BigInt(str) is exact
    expect(BigInt(str).toString()).toBe(str);
  });

  // @satisfies FR-ROLE-001
  it('serialization round-trip: str → BigInt → str preserves identity', () => {
    const testValues = [
      '0',
      '1',
      '64',
      '512',
      '1152921504606846976', // 1n << 60n
      '9007199254740992',    // 2^53 — boundary
      '9007199254740993',    // 2^53 + 1 — first value that Number loses
    ];
    for (const val of testValues) {
      expect(bigIntToStr(strToBigInt(val))).toBe(val);
    }
  });
});

describe('FR-ROLE-001 Bit toggle precision', () => {
  // @satisfies FR-ROLE-001
  it('all 11 permission bits are unique and non-overlapping', () => {
    const bits = Object.values(Permission);
    expect(bits).toHaveLength(11);
    // Every bit must be a power of 2 and unique — use string forms
    const seen = new Set<string>();
    for (const bit of bits) {
      const bitStr = bit.toString();
      // Power of two: parseInt backwards checks
      const bitVal = BigInt(bitStr);
      // (bit & (bit - 1)) === 0 for power of two
      expect((bitVal & (bitVal - 1n)).toString()).toBe('0');
      expect(seen.has(bitStr)).toBe(false);
      seen.add(bitStr);
    }
    expect(seen.size).toBe(11);
  });

  // @satisfies FR-ROLE-001
  it('hasBit returns correct boolean for each permission', () => {
    // All bits 0-10 set (sum = 2047)
    const allBits = '2047';
    for (const bit of Object.values(Permission)) {
      expect(hasBit(allBits, bit)).toBe(true);
    }
    // No bits set
    expect(hasBit('0', Permission.SEND_MESSAGES)).toBe(false);
    expect(hasBit('0', Permission.ADMINISTRATOR)).toBe(false);
  });

  // @satisfies FR-ROLE-001
  it('toggleBit changes exactly one bit and no other', () => {
    // Start with MANAGE_MESSAGES (bit 6 = 64)
    let perms = '64';
    expect(hasBit(perms, Permission.MANAGE_MESSAGES)).toBe(true);
    expect(hasBit(perms, Permission.SEND_MESSAGES)).toBe(false);

    // Toggle SEND_MESSAGES ON
    perms = toggleBit(perms, Permission.SEND_MESSAGES, true);
    expect(hasBit(perms, Permission.MANAGE_MESSAGES)).toBe(true);
    expect(hasBit(perms, Permission.SEND_MESSAGES)).toBe(true);
    // Verify exact value: 64 | 512 = 576
    expect(perms).toBe('576');

    // Toggle MANAGE_MESSAGES OFF
    perms = toggleBit(perms, Permission.MANAGE_MESSAGES, false);
    expect(hasBit(perms, Permission.MANAGE_MESSAGES)).toBe(false);
    expect(hasBit(perms, Permission.SEND_MESSAGES)).toBe(true);
    // Verify exact value: 512 only
    expect(perms).toBe('512');

    // Toggle SEND_MESSAGES OFF
    perms = toggleBit(perms, Permission.SEND_MESSAGES, false);
    expect(hasBit(perms, Permission.SEND_MESSAGES)).toBe(false);
    expect(hasBit(perms, Permission.MANAGE_MESSAGES)).toBe(false);
    expect(perms).toBe('0');
  });

  // @satisfies FR-ROLE-001
  it('toggleBit with high bits preserves other high bits', () => {
    const highBit = 1n << 60n;
    const highStr = highBit.toString();
    // Set a high bit first
    let perms = toggleBit('0', highBit, true);
    expect(perms).toBe(highStr);

    // Toggle a low bit ON
    perms = toggleBit(perms, Permission.SEND_MESSAGES, true);
    // highStr + 512
    const expectedWithLow = bigIntToStr(highBit | Permission.SEND_MESSAGES);
    expect(perms).toBe(expectedWithLow);

    // Both bits should be detectable
    expect(hasBit(perms, highBit)).toBe(true);
    expect(hasBit(perms, Permission.SEND_MESSAGES)).toBe(true);

    // Toggle low bit OFF — high bit preserved
    perms = toggleBit(perms, Permission.SEND_MESSAGES, false);
    expect(perms).toBe(highStr);
    expect(hasBit(perms, highBit)).toBe(true);
    expect(hasBit(perms, Permission.SEND_MESSAGES)).toBe(false);
  });

  // @satisfies FR-ROLE-001
  it('each Permission constant matches its expected bit value', () => {
    expect(Permission.ADMINISTRATOR.toString()).toBe((1n << 0n).toString());
    expect(Permission.MANAGE_SERVER.toString()).toBe((1n << 1n).toString());
    expect(Permission.MANAGE_CHANNELS.toString()).toBe((1n << 2n).toString());
    expect(Permission.MANAGE_ROLES.toString()).toBe((1n << 3n).toString());
    expect(Permission.MANAGE_MEMBERS.toString()).toBe((1n << 4n).toString());
    expect(Permission.CREATE_INVITE.toString()).toBe((1n << 5n).toString());
    expect(Permission.MANAGE_MESSAGES.toString()).toBe((1n << 6n).toString());
    expect(Permission.MENTION_EVERYONE.toString()).toBe((1n << 7n).toString());
    expect(Permission.BAN_MEMBERS.toString()).toBe((1n << 8n).toString());
    expect(Permission.SEND_MESSAGES.toString()).toBe((1n << 9n).toString());
    expect(Permission.READ_MESSAGES.toString()).toBe((1n << 10n).toString());
  });
});
