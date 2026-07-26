/**
 * FR-SOC-007 — Blocked-users endpoint integration test.
 *
 * @satisfies FR-SOC-007
 *
 * Full lifecycle: block a user → listBlocked includes them → unblock (via
 * DELETE /friends/:userId) → listBlocked is empty again.
 * Also: unauthenticated request returns 401.
 */
import { apiFetch, createJar } from '../characterization/helpers';

const API = { put: 'PUT', post: 'POST', delete: 'DELETE', get: 'GET' } as const;

async function devLogin(username: string) {
  const jar = createJar();
  const res = await apiFetch('/auth/dev-login', {
    method: API.post,
    body: { username },
    jar,
  });
  expect(res.status).toBe(201);
  return { userId: res.body.id as string, jar };
}

describe('FR-SOC-007 — Blocked users endpoint', () => {
  let alice: { userId: string; jar: ReturnType<typeof createJar> };
  let bob: { userId: string; jar: ReturnType<typeof createJar> };

  beforeAll(async () => {
    const ts = Date.now();
    alice = await devLogin(`soc007-alice-${ts}`);
    bob = await devLogin(`soc007-bob-${ts}`);
  });

  // @satisfies FR-SOC-007
  it('returns 401 when unauthenticated', async () => {
    const res = await apiFetch('/friends/blocked');
    expect(res.status).toBe(401);
  });

  // @satisfies FR-SOC-007
  it('returns empty array when no users are blocked', async () => {
    const res = await apiFetch('/friends/blocked', { jar: alice.jar });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  // @satisfies FR-SOC-007
  it('includes blocked user after block', async () => {
    // Alice blocks Bob
    const blockRes = await apiFetch(`/friends/block/${bob.userId}`, {
      method: API.post,
      jar: alice.jar,
    });
    // 201 = created, 200 = already blocked (idempotent upsert)
    expect([200, 201]).toContain(blockRes.status);

    // Verify Bob appears in Alice's blocked list
    const listRes = await apiFetch('/friends/blocked', { jar: alice.jar });
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBeGreaterThanOrEqual(1);

    const blockedIds = listRes.body.map((u: any) => u.id);
    expect(blockedIds).toContain(bob.userId);

    // Verify the blocked user object has the expected shape
    const bobEntry = listRes.body.find((u: any) => u.id === bob.userId);
    expect(bobEntry).toBeDefined();
    expect(bobEntry.username).toBeDefined();
    expect(bobEntry.id).toBe(bob.userId);
  });

  // @satisfies FR-SOC-007
  it('removes blocked user after unblock (POST unblock)', async () => {
    // Alice unblocks Bob via the dedicated unblock endpoint
    const unblockRes = await apiFetch(`/friends/unblock/${bob.userId}`, {
      method: API.post,
      jar: alice.jar,
    });
    // 200 or 204 are both acceptable
    expect([200, 201, 204]).toContain(unblockRes.status);

    // Verify Bob is no longer in Alice's blocked list
    const listRes = await apiFetch('/friends/blocked', { jar: alice.jar });
    expect(listRes.status).toBe(200);
    const blockedIds = listRes.body.map((u: any) => u.id);
    expect(blockedIds).not.toContain(bob.userId);
  });

  // @satisfies FR-SOC-007
  it('block does not affect the blocked user\'s blocked list', async () => {
    // Alice blocks Bob
    await apiFetch(`/friends/block/${bob.userId}`, {
      method: API.post,
      jar: alice.jar,
    });

    // Bob's blocked list should NOT include Alice (block is one-way)
    const bobList = await apiFetch('/friends/blocked', { jar: bob.jar });
    expect(bobList.status).toBe(200);
    const bobBlockedIds = bobList.body.map((u: any) => u.id);
    expect(bobBlockedIds).not.toContain(alice.userId);

    // Cleanup: unblock
    await apiFetch(`/friends/unblock/${bob.userId}`, {
      method: API.post,
      jar: alice.jar,
    });
  });
});
