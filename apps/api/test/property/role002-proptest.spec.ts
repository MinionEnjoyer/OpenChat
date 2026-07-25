/**
 * FR-ROLE-002 — Property test: 1000 random (permissions, flags) cases prove
 * the CLIENT permission calculator (`apps/mobile/src/permissions.ts`) agrees
 * with the SERVER lib (`apps/api/src/permissions/permissions.ts`) verbatim.
 *
 * The two libs are mirrors (DRIFT-LOG DD-018). This test is the compensating
 * control: it imports BOTH implementations and compares them over random
 * inputs covering standard bits, HIGH bits above 2^53, ADMINISTRATOR
 * (owner-implies-admin), and edge cases. A falsification test proves it can
 * detect divergence.
 *
 * Seed: 0xR0LE002 → 0x52304C45303032 (hex from ASCII). Reproducible.
 *
 * @satisfies FR-ROLE-002
 */

// ── Imports ────────────────────────────────────────────────────────────────

// Server lib (the authority)
import {
  hasPermission as serverHasPermission,
  Permission as ServerPermission,
} from '../../src/permissions/permissions';

// Client lib (the mirror — must agree with server)
import {
  hasPermission as clientHasPermission,
} from '../../../mobile/src/permissions';

// ── Seeded PRNG (mulberry32) ────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seed from the ASCII hex of "R0LE002": 0x52304C45303032 → decimal
// 0x52304C45303032 = 23142255502626866 — but we need a 32-bit seed for
// mulberry32. Use the low 32 bits: 0x4C45303032 → 327471357490.
// Wait: Math.imul needs a 32-bit int. Take (0x52304C45303032 & 0xFFFFFFFF) >>> 0.
const SEED: number = Number(BigInt('0x52304C45303032') & BigInt(0xFFFFFFFF));
const rand = mulberry32(SEED);

// ── Permission flags (from server — both libs must agree on these) ──────────

const ALL_FLAGS: bigint[] = Object.values(ServerPermission) as bigint[];

// ── Random generation helpers ───────────────────────────────────────────────

/** Random integer in [0, max) (max < 2^32). */
function randInt(max: number): number {
  return Math.trunc(rand() * max);
}

/**
 * Generate a random bigint with up to 64 bits set.
 * Also sets high bits (above 2^53) with ~30% probability to cover the
 * IEEE-754 boundary zone where Number() would corrupt.
 */
function randomBigInt(): bigint {
  // Generate a 64-bit value in two halves to avoid Number precision issues
  const lo = BigInt(Math.trunc(rand() * 0xFFFFFFFF));
  const mid = BigInt(Math.trunc(rand() * 0xFFFFFFFF)) << 16n;
  const hi = rand() < 0.3 ? BigInt(Math.trunc(rand() * 0xFF)) << 53n : 0n;
  return lo | mid | hi;
}

/**
 * Generate a random permission bitfield that exercises realistic patterns.
 * Mix: empty (5%), ADMINISTRATOR-only (5%), sparse (40%), dense (50%).
 */
function randomPerms(): bigint {
  const r = rand();
  if (r < 0.05) return 0n;
  if (r < 0.10) return ServerPermission.ADMINISTRATOR;

  let perms = 0n;
  if (r < 0.50) {
    // Sparse: set each of the 11 bits with 25% probability
    for (const flag of ALL_FLAGS) {
      if (rand() < 0.25) perms |= flag;
    }
  } else {
    // Dense: set each bit with 70% probability + random high bits
    for (const flag of ALL_FLAGS) {
      if (rand() < 0.70) perms |= flag;
    }
  }

  // Sprinkle in high bits above bit 53 (~20% chance)
  if (rand() < 0.20) {
    perms |= randomBigInt();
  }

  return perms;
}

/**
 * Pick a flag to test against.
 * 50%: one of the 11 known permission bits
 * 30%: composite (two known bits OR'd)
 * 10%: ADMINISTRATOR specifically (owner-implies-admin stress)
 * 10%: high bit above 2^53
 */
function randomFlag(): bigint {
  const r = rand();
  if (r < 0.50) {
    return ALL_FLAGS[randInt(ALL_FLAGS.length)];
  }
  if (r < 0.80) {
    const a = ALL_FLAGS[randInt(ALL_FLAGS.length)];
    const b = ALL_FLAGS[randInt(ALL_FLAGS.length)];
    return a | (b === a ? ALL_FLAGS[(randInt(ALL_FLAGS.length - 1) + 1) % ALL_FLAGS.length] : b);
  }
  if (r < 0.90) {
    return ServerPermission.ADMINISTRATOR;
  }
  // High bit above 2^53
  const shift = 53n + BigInt(randInt(11)); // bits 53-63
  return 1n << shift;
}

/**
 * Generate a single test case: { perms, flag }.
 */
function generateCase(): { perms: bigint; flag: bigint } {
  // 10% of cases: ensure ADMINISTRATOR is in the perms to exercise the
  // owner-implies-admin shortcut closure.
  const r = rand();
  let perms: bigint;
  if (r < 0.10) {
    perms = randomPerms() | ServerPermission.ADMINISTRATOR;
  } else {
    perms = randomPerms();
  }
  const flag = randomFlag();
  return { perms, flag };
}

// ── Test case generation ───────────────────────────────────────────────────

const CASES: { perms: bigint; flag: bigint }[] = [];
for (let i = 0; i < 1000; i++) {
  CASES.push(generateCase());
}

// Add explicit edge cases (not random — deterministic):
// 1. ADMINISTRATOR perms, every flag → all true (owner-implies-admin)
for (const flag of ALL_FLAGS) {
  CASES.push({ perms: ServerPermission.ADMINISTRATOR, flag });
}
// 2. Zero perms, every flag → all false
for (const flag of ALL_FLAGS) {
  CASES.push({ perms: 0n, flag });
}
// 3. ALL_PERMISSIONS (all bits set), every flag → all true
const allPerms: bigint = ALL_FLAGS.reduce((a, b) => a | b, 0n);
for (const flag of ALL_FLAGS) {
  CASES.push({ perms: allPerms, flag });
}
// 4. High-bit perms with ADMINISTRATOR → every flag true
for (const flag of ALL_FLAGS) {
  CASES.push({ perms: (1n << 60n) | ServerPermission.ADMINISTRATOR, flag });
}
// 5. High-bit perms WITHOUT ADMINISTRATOR → flag check depends on exact match
CASES.push({ perms: 1n << 60n, flag: 1n << 60n }); // true — exact match
CASES.push({ perms: 1n << 60n, flag: 1n << 61n }); // false — different high bit
CASES.push({ perms: (1n << 60n) | (1n << 53n), flag: 1n << 53n }); // true
// 6. Boundary: exactly 2^53 (last exact IEEE-754 integer)
CASES.push({ perms: 1n << 53n, flag: 1n << 53n }); // true
CASES.push({ perms: 1n << 53n, flag: (1n << 53n) + 1n }); // false
// 7. Boundary: exactly 2^53 + 1 (first IEEE-754 integer with rounding loss)
CASES.push({ perms: (1n << 53n) + 1n, flag: (1n << 53n) + 1n }); // true
// 8. BigInt max safety
CASES.push({ perms: (1n << 63n) - 1n, flag: ServerPermission.ADMINISTRATOR });

// ── Tests ──────────────────────────────────────────────────────────────────

describe('FR-ROLE-002 — Client/server hasPermission agreement (property test)', () => {
  // ── Main comparison ────────────────────────────────────────────────────

  it(`compares client and server hasPermission over ${CASES.length} cases`, () => {
    const mismatches: string[] = [];

    for (let i = 0; i < CASES.length; i++) {
      const { perms, flag } = CASES[i];
      const serverResult = serverHasPermission(perms, flag);
      const clientResult = clientHasPermission(perms, flag);

      if (serverResult !== clientResult) {
        mismatches.push(
          `case[${i}] perms=${perms.toString()} flag=${flag.toString()} ` +
          `server=${serverResult} client=${clientResult}`,
        );
      }
    }

    if (mismatches.length > 0) {
      throw new Error(
        `Client and server hasPermission disagree on ${mismatches.length} cases:\n` +
        mismatches.slice(0, 20).join('\n') +
        (mismatches.length > 20 ? `\n... and ${mismatches.length - 20} more` : ''),
      );
    }

    // Sanity: we actually ran enough cases
    expect(CASES.length).toBeGreaterThanOrEqual(1044); // 1000 random + 44 edge
  });

  // ── Owner-implies-admin is explicitly covered ──────────────────────────

  it('owner-implies-admin: ADMINISTRATOR grants every permission flag', () => {
    for (const flag of ALL_FLAGS) {
      expect(serverHasPermission(ServerPermission.ADMINISTRATOR, flag)).toBe(true);
      expect(clientHasPermission(ServerPermission.ADMINISTRATOR, flag)).toBe(true);
    }
  });

  // ── High-bit coverage is present ───────────────────────────────────────

  it('includes cases with bits above 2^53 (IEEE-754 boundary)', () => {
    const highCases = CASES.filter(
      (c) => c.perms >= (1n << 53n) || c.flag >= (1n << 53n),
    );
    // With 30% high-bit probability in randomBigInt and 10% in randomFlag,
    // plus explicit edge cases, we expect many high-bit cases.
    expect(highCases.length).toBeGreaterThan(50);
  });

  // ── Falsification proof ────────────────────────────────────────────────

  it('PROOF: a 1-bit perturbation in one lib causes detectable divergence', () => {
    // Simulate a drift: someone changes the server's hasPermission to check
    // MANAGE_SERVER instead of ADMINISTRATOR for the implicit-grant shortcut.
    // This is a realistic drift vector — a refactor that replaces the wrong
    // constant.

    function buggyServerHasPermission(perms: bigint, flag: bigint): boolean {
      // BUG: using MANAGE_SERVER (1<<1) instead of ADMINISTRATOR (1<<0)
      return (perms & ServerPermission.MANAGE_SERVER) !== 0n || (perms & flag) !== 0n;
    }

    // Run the perturbed version against the stable client over all cases.
    let divergence = 0;
    for (let i = 0; i < CASES.length; i++) {
      const { perms, flag } = CASES[i];
      if (buggyServerHasPermission(perms, flag) !== clientHasPermission(perms, flag)) {
        divergence++;
      }
    }

    // Must detect at least one mismatch — otherwise the test is vacuous.
    expect(divergence).toBeGreaterThan(0);

    // Verify a specific known case: ADMINISTRATOR-only perms with a
    // non-MANAGE_SERVER flag.
    // client says true (ADMINISTRATOR grants all), buggy says false (only
    // MANAGE_SERVER shortcut, and flag != MANAGE_SERVER).
    expect(
      buggyServerHasPermission(ServerPermission.ADMINISTRATOR, ServerPermission.SEND_MESSAGES),
    ).toBe(false);
    expect(
      clientHasPermission(ServerPermission.ADMINISTRATOR, ServerPermission.SEND_MESSAGES),
    ).toBe(true);
  });
});
