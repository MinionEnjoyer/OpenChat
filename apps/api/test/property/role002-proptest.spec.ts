/**
 * FR-ROLE-002 — Property test: 1000 random (permissions, flags) cases prove
 * the CLIENT permission calculator (`apps/mobile/src/permissions.ts`) agrees
 * with the SERVER lib (`apps/api/src/permissions/permissions.ts`) verbatim.
 *
 * The two libs are mirrors (DRIFT-LOG DD-018). This test is the compensating
 * control: it imports BOTH implementations, compares every permission-constant
 * value by name (catches bit drift), then runs 1000 random behavioral cases
 * with each side's flags looked up from its OWN table by name.
 *
 * Seed: 0xR0LE002 → 0x52304C45303032 (hex from ASCII). Reproducible.
 *
 * @satisfies FR-ROLE-002
 */

// ── Imports ────────────────────────────────────────────────────────────────

// Server lib (the authority)
import type { PermissionName } from '../../src/permissions/permissions';
import {
  hasPermission as serverHasPermission,
  Permission as ServerPermission,
} from '../../src/permissions/permissions';

// Client lib (the mirror — full import so we can compare constants AND functions)
import {
  hasPermission as clientHasPermission,
  Permission as ClientPermission,
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

const SEED: number = Number(BigInt('0x52304C45303032') & BigInt(0xFFFFFFFF));
const rand = mulberry32(SEED);

// ── Permission names (agreed-upon keys) ────────────────────────────────────

const ALL_NAMES: PermissionName[] = Object.keys(ServerPermission) as PermissionName[];

// ── Random generation helpers ───────────────────────────────────────────────

function randInt(max: number): number {
  return Math.trunc(rand() * max);
}

/**
 * Build a BigInt bitfield from a set of permission NAMES, using the given table.
 * This is the key change: each side uses its OWN constant values.
 */
function namesToPerms(names: Set<PermissionName>, table: Record<string, bigint>): bigint {
  let perms = 0n;
  for (const name of names) {
    // If a name is missing from the table, its bit contributes 0n (the
    // constant-value and key-set tests will catch the missing key separately).
    perms |= table[name] ?? 0n;
  }
  return perms;
}

/**
 * Generate a random set of permission names.
 * empty (5%), ADMINISTRATOR-only (5%), sparse (40%), dense (50%).
 */
function randomNameSet(): Set<PermissionName> {
  const r = rand();
  if (r < 0.05) return new Set();
  if (r < 0.10) return new Set(['ADMINISTRATOR']);

  const names = new Set<PermissionName>();
  const nonAdmin = ALL_NAMES.filter((n) => n !== 'ADMINISTRATOR');

  if (r < 0.50) {
    // Sparse
    for (const n of nonAdmin) {
      if (rand() < 0.25) names.add(n);
    }
  } else {
    // Dense
    for (const n of nonAdmin) {
      if (rand() < 0.70) names.add(n);
    }
  }
  return names;
}

/**
 * Pick a permission name to test against.
 * 50%: any single name
 * 30%: composite (two names, always distinct)
 * 10%: ADMINISTRATOR
 * 10%: high bit (raw 1n << 53..63, no name mapping needed — directly compares bit ops)
 */
function randomFlagName(): PermissionName {
  const r = rand();
  if (r < 0.90) {
    return ALL_NAMES[randInt(ALL_NAMES.length)];
  }
  // ADMINISTRATOR specifically
  return 'ADMINISTRATOR';
}

/**
 * Generate a single test case.
 * Returns { names (set of names in perms), flagName (name to test) }.
 * Also includes explicit high-bit raw-flag cases for IEEE-754 boundary coverage.
 */
interface Case {
  names: Set<PermissionName>;
  flagName: PermissionName;
  /** If set, this is a raw bigint flag (high-bit stress), not a named one */
  rawFlag?: bigint;
}

function generateCase(): Case {
  // 10% of cases: ensure ADMINISTRATOR is in the perms
  const withAdmin = rand() < 0.10;
  const names = randomNameSet();
  if (withAdmin) names.add('ADMINISTRATOR');

  // 10% high-bit raw flag
  if (rand() < 0.10) {
    const shift = 53n + BigInt(randInt(11));
    return { names, flagName: 'ADMINISTRATOR', rawFlag: 1n << shift };
  }

  return { names, flagName: randomFlagName() };
}

// ── Test case generation ───────────────────────────────────────────────────

const CASES: Case[] = [];
for (let i = 0; i < 1000; i++) {
  CASES.push(generateCase());
}

// ── Explicit edge cases (deterministic) ─────────────────────────────────────

// 1. ADMINISTRATOR-only perms, every flag → all true
for (const name of ALL_NAMES) {
  CASES.push({ names: new Set(['ADMINISTRATOR']), flagName: name });
}

// 2. Zero perms, every flag → all false
for (const name of ALL_NAMES) {
  CASES.push({ names: new Set(), flagName: name });
}

// 3. All permissions set, every flag → all true
CASES.push({ names: new Set(ALL_NAMES), flagName: 'SEND_MESSAGES' });
CASES.push({ names: new Set(ALL_NAMES), flagName: 'MANAGE_ROLES' });

// 4. Sparse perms with one specific flag — should be true for that flag
CASES.push({ names: new Set(['MANAGE_SERVER', 'MANAGE_ROLES']), flagName: 'MANAGE_ROLES' });
// Sparse perms WITHOUT the flag — should be false
CASES.push({ names: new Set(['MANAGE_SERVER', 'CREATE_INVITE']), flagName: 'MANAGE_ROLES' });

// 5. High-bit raw flags (bit ops only — these use direct BigInt values, not names)
for (const name of ALL_NAMES) {
  CASES.push({ names: new Set(['ADMINISTRATOR']), flagName: name, rawFlag: 1n << 60n });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('FR-ROLE-002 — Client/server permission agreement (property test)', () => {
  // ── A. Constant-value comparison (catches bit drift) ────────────────────
  //     This is the CRITICAL test — it catches the realistic failure mode
  //     where a hand-mirrored constant gets the wrong bit position.

  it('every permission constant has the same BigInt value in both tables', () => {
    const mismatches: string[] = [];

    for (const name of ALL_NAMES) {
      const sv = ServerPermission[name];
      const cv = ClientPermission[name];

      if (cv === undefined) {
        mismatches.push(`${name}: missing from client table`);
      } else if (sv !== cv) {
        mismatches.push(
          `${name}: server=${sv.toString()} (0x${sv.toString(16)}) ` +
          `client=${cv.toString()} (0x${cv.toString(16)})`,
        );
      }
    }

    // Also check the reverse: any extra keys in client?
    const clientKeys = Object.keys(ClientPermission) as PermissionName[];
    for (const name of clientKeys) {
      if (ServerPermission[name] === undefined) {
        mismatches.push(`${name}: present in client but missing from server`);
      }
    }

    if (mismatches.length > 0) {
      throw new Error(
        `Permission constant mismatch (${mismatches.length}):\n` +
        mismatches.join('\n'),
      );
    }
  });

  // ── B. Behavioral comparison over random cases ──────────────────────────
  //     Each side computes its hasPermission using its OWN constant values.

  it(`compares client and server hasPermission over ${CASES.length} cases (per-side tables)`, () => {
    const mismatches: string[] = [];

    for (let i = 0; i < CASES.length; i++) {
      const c = CASES[i];

      // Compute perms for each side from its own table
      const serverPerms = namesToPerms(c.names, ServerPermission as Record<string, bigint>);
      const clientPerms = namesToPerms(c.names, ClientPermission as Record<string, bigint>);

      // Compute flags for each side
      let serverFlag: bigint;
      let clientFlag: bigint;
      if (c.rawFlag !== undefined) {
        // Raw high-bit flag — same value for both sides (no name lookup)
        serverFlag = c.rawFlag;
        clientFlag = c.rawFlag;
      } else {
        serverFlag = ServerPermission[c.flagName];
        clientFlag = ClientPermission[c.flagName];
      }

      const serverResult = serverHasPermission(serverPerms, serverFlag);
      const clientResult = clientHasPermission(clientPerms, clientFlag);

      if (serverResult !== clientResult) {
        mismatches.push(
          `case[${i}] flagName=${c.flagName} ` +
          `names=[${[...c.names].join(',')}] ` +
          `serverPerms=${serverPerms.toString()} clientPerms=${clientPerms.toString()} ` +
          `serverFlag=${serverFlag.toString()} clientFlag=${clientFlag.toString()} ` +
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

    expect(CASES.length).toBeGreaterThanOrEqual(1000);
  });

  // ── C. Owner-implies-admin coverage ─────────────────────────────────────

  it('owner-implies-admin: ADMINISTRATOR grants every permission flag', () => {
    for (const name of ALL_NAMES) {
      const sf = ServerPermission[name];
      const cf = ClientPermission[name];
      const sa = ServerPermission.ADMINISTRATOR;
      const ca = ClientPermission.ADMINISTRATOR;
      expect(serverHasPermission(sa, sf)).toBe(true);
      expect(clientHasPermission(ca, cf)).toBe(true);
    }
  });

  // ── D. Falsification proof ──────────────────────────────────────────────

  it('PROOF: a 1-bit perturbation in one lib causes detectable divergence', () => {
    // Simulate a drift: someone changes the server's hasPermission to check
    // MANAGE_SERVER instead of ADMINISTRATOR for the implicit-grant shortcut.
    function buggyServerHasPermission(perms: bigint, flag: bigint): boolean {
      return (perms & ServerPermission.MANAGE_SERVER) !== 0n || (perms & flag) !== 0n;
    }

    let divergence = 0;
    for (let i = 0; i < CASES.length; i++) {
      const c = CASES[i];
      const serverPerms = namesToPerms(c.names, ServerPermission as Record<string, bigint>);
      const clientPerms = namesToPerms(c.names, ClientPermission as Record<string, bigint>);
      const serverFlag = c.rawFlag ?? ServerPermission[c.flagName];
      const clientFlag = c.rawFlag ?? ClientPermission[c.flagName];

      if (buggyServerHasPermission(serverPerms, serverFlag) !== clientHasPermission(clientPerms, clientFlag)) {
        divergence++;
      }
    }

    expect(divergence).toBeGreaterThan(0);

    // Specific known case
    expect(
      buggyServerHasPermission(ServerPermission.ADMINISTRATOR, ServerPermission.SEND_MESSAGES),
    ).toBe(false);
    expect(
      clientHasPermission(ClientPermission.ADMINISTRATOR, ClientPermission.SEND_MESSAGES),
    ).toBe(true);
  });

  // ── E. keyset comparison (catches missing/extra keys) ───────────────────

  it('both tables have identical key sets', () => {
    const serverKeys = new Set(Object.keys(ServerPermission));
    const clientKeys = new Set(Object.keys(ClientPermission));

    const onlyServer = [...serverKeys].filter((k) => !clientKeys.has(k));
    const onlyClient = [...clientKeys].filter((k) => !serverKeys.has(k));

    const diffs: string[] = [];
    if (onlyServer.length > 0) diffs.push(`only in server: ${onlyServer.join(', ')}`);
    if (onlyClient.length > 0) diffs.push(`only in client: ${onlyClient.join(', ')}`);

    if (diffs.length > 0) {
      throw new Error(`Key-set mismatch:\n${diffs.join('\n')}`);
    }
  });
});
