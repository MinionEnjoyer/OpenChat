/**
 * S5 — Role CRUD and BigInt round-trip integration tests (FR-ROLE-001).
 *
 * @satisfies FR-ROLE-001
 *
 * Proves:
 *  1. BigInt round-trip exact with high bits set (above 2^53).
 *  2. Toggling one permission changes exactly that bit and no other.
 *  3. Assign role to member and re-query to confirm assignment.
 */
import { apiFetch, devLogin, createJar } from '../characterization/helpers';

// A high bit — 1n << 60n = 1152921504606846976, well above 2^53 (9007199254740992)
const HIGH_BIT_STR = '1152921504606846976'; // 1n << 60n
const HIGH_BIT = 1n << 60n;

let alice: { username: string; userId: string; jar: ReturnType<typeof createJar> };
let bob: { username: string; userId: string; jar: ReturnType<typeof createJar> };
let serverId: string;
let everyoneRoleId: string;

beforeAll(async () => {
  const ts = Date.now();
  alice = await devLogin(`alice-s5-${ts}`);
  bob = await devLogin(`bob-s5-${ts}`);

  // Alice creates server
  const srv = await apiFetch('/servers', { method: 'POST', body: { name: `S5-Test-${ts}` }, jar: alice.jar });
  expect(srv.status).toBe(201);
  serverId = srv.body.id;

  // Invite + accept Bob
  const inv = await apiFetch(`/servers/${serverId}/members`, {
    method: 'POST', body: { userId: bob.userId }, jar: alice.jar,
  });
  expect(inv.status).toBe(201);
  const accept = await apiFetch(`/server-invitations/${inv.body.id}/accept`, { method: 'POST', jar: bob.jar });
  expect(accept.status).toBe(201);

  // Get @everyone role id
  const roles = await apiFetch(`/servers/${serverId}/roles`, { jar: alice.jar });
  everyoneRoleId = roles.body.find((r: any) => r.name === '@everyone')?.id ?? '';
});

describe('S5 — FR-ROLE-001 BigInt round-trip (high bits >2^53)', () => {
  it('creates a role with a high-bit permissions value, reads it back, and asserts exact BigInt equality', async () => {
    // Use a bit > 2^53 — JavaScript Number would silently corrupt this.
    // The high bit: 1n << 60n
    const create = await apiFetch(`/servers/${serverId}/roles`, {
      method: 'POST',
      body: { name: 'HighBitTest', color: 0xff0000, permissions: HIGH_BIT_STR },
      jar: alice.jar,
    });
    expect(create.status).toBe(201);
    expect(typeof create.body.permissions).toBe('string');
    expect(create.body.name).toBe('HighBitTest');

    // Read back via list
    const list = await apiFetch(`/servers/${serverId}/roles`, { jar: alice.jar });
    const found = list.body.find((r: any) => r.name === 'HighBitTest');
    expect(found).toBeDefined();
    expect(found.permissions).toBe(HIGH_BIT_STR);

    // Prove exact BigInt round-trip (not just string equality — verify it is the right BigInt)
    expect(BigInt(found.permissions)).toBe(HIGH_BIT);

    // Cleanup
    await apiFetch(`/servers/${serverId}/roles/${create.body.id}`, { method: 'DELETE', jar: alice.jar });
  });

  it('Number() conversion WOULD corrupt the high bit — demonstrate the hazard', async () => {
    // 2^53 + 1 is the FIRST integer that IEEE 754 double cannot represent exactly.
    const val = (1n << 53n) + 1n; // 9007199254740993
    // Number() silently drops the +1:
    const asNumber = Number(val.toString()); // 9007199254740992
    // Converting back through BigInt loses the exact value:
    expect(BigInt(Math.trunc(asNumber))).not.toBe(val);
    // But BigInt(str) is exact:
    expect(BigInt(val.toString())).toBe(val);
  });
});

describe('S5 — FR-ROLE-001 Bit toggle precision', () => {
  it('toggling one permission changes exactly that bit and no other', async () => {
    // Create a role with MANAGE_MESSAGES (bit 64) only
    const create = await apiFetch(`/servers/${serverId}/roles`, {
      method: 'POST',
      body: { name: 'ToggleTest', color: 0x00ff00, permissions: '64' },
      jar: alice.jar,
    });
    expect(create.status).toBe(201);
    const roleId = create.body.id;
    const initialPerms = BigInt(create.body.permissions);
    expect(initialPerms).toBe(64n); // only bit 6

    // Add SEND_MESSAGES (bit 512) — expected: 64 | 512 = 576
    const update = await apiFetch(`/servers/${serverId}/roles/${roleId}`, {
      method: 'PATCH',
      body: { permissions: '576' }, // 64 | 512
      jar: alice.jar,
    });
    expect(update.status).toBe(200);
    const updatedPerms = BigInt(update.body.permissions);
    expect(updatedPerms).toBe(576n); // 64n | 512n
    // Prove MANAGE_MESSAGES is still set
    expect(updatedPerms & 64n).toBe(64n);
    // Prove SEND_MESSAGES is now set
    expect(updatedPerms & 512n).toBe(512n);
    // Prove no other bits changed
    expect(updatedPerms & ~(64n | 512n)).toBe(0n);

    // Remove MANAGE_MESSAGES — expected: 512 only
    const update2 = await apiFetch(`/servers/${serverId}/roles/${roleId}`, {
      method: 'PATCH',
      body: { permissions: '512' },
      jar: alice.jar,
    });
    expect(update2.status).toBe(200);
    const finalPerms = BigInt(update2.body.permissions);
    expect(finalPerms).toBe(512n);

    // Cleanup
    await apiFetch(`/servers/${serverId}/roles/${roleId}`, { method: 'DELETE', jar: alice.jar });
  });
});

describe('S5 — FR-ROLE-001 Member role assignment', () => {
  it('assigns a role to a member and re-queries to confirm it is present', async () => {
    // Create a custom role
    const role = await apiFetch(`/servers/${serverId}/roles`, {
      method: 'POST',
      body: { name: 'AssignTest', color: 0x0000ff, permissions: '512' },
      jar: alice.jar,
    });
    expect(role.status).toBe(201);
    const roleId = role.body.id;

    // Initially Bob should NOT have this role
    const membersBefore = await apiFetch(`/servers/${serverId}/members`, { jar: alice.jar });
    const bobBefore = membersBefore.body.find((m: any) => m.userId === bob.userId);
    expect(bobBefore).toBeDefined();
    expect(bobBefore.roleIds).not.toContain(roleId);

    // Assign role to Bob
    const assign = await apiFetch(`/servers/${serverId}/members/${bob.userId}/roles/${roleId}`, {
      method: 'PUT',
      jar: alice.jar,
    });
    expect(assign.status).toBe(200);
    expect(assign.body.success).toBe(true);

    // Re-query members to confirm Bob now has the role
    const membersAfter = await apiFetch(`/servers/${serverId}/members`, { jar: alice.jar });
    const bobAfter = membersAfter.body.find((m: any) => m.userId === bob.userId);
    expect(bobAfter).toBeDefined();
    expect(bobAfter.roleIds).toContain(roleId);

    // Remove role from Bob
    const unassign = await apiFetch(`/servers/${serverId}/members/${bob.userId}/roles/${roleId}`, {
      method: 'DELETE',
      jar: alice.jar,
    });
    expect(unassign.status).toBe(200);

    // Cleanup
    await apiFetch(`/servers/${serverId}/roles/${roleId}`, { method: 'DELETE', jar: alice.jar });
  });
});
