/**
 * FR-NOTIF-001 — Device token registry integration test.
 *
 * Verifies the full lifecycle: register, idempotent re-register, ownership
 * transfer, list-scoped-to-user, delete, delete-unknown-token, and the
 * cross-user security boundary.
 *
 * @satisfies FR-NOTIF-001
 */
import { apiFetch, createJar } from '../characterization/helpers';

const API = { get: 'GET', put: 'PUT', delete: 'DELETE', post: 'POST' } as const;

async function devLogin(username: string) {
  const res = await apiFetch('/auth/dev-login', {
    method: API.post,
    body: { username },
    jar: createJar(),
  });
  expect(res.status).toBe(201);
  return res.body as { id: string; accessToken: string; refreshToken: string; expiresIn: number };
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe('FR-NOTIF-001 — device token registry', () => {
  const TS = Date.now();
  let userA: { id: string; accessToken: string };
  let userB: { id: string; accessToken: string };

  beforeAll(async () => {
    userA = await devLogin(`fr-notif-001-a-${TS}`);
    userB = await devLogin(`fr-notif-001-b-${TS}`);
  });

  describe('POST /devices — register', () => {
    it('registers a new device token and returns 201', async () => {
      const res = await apiFetch('/devices', {
        method: API.post,
        body: { token: `token-ios-${TS}`, platform: 'ios' },
        headers: bearer(userA.accessToken),
      });
      expect(res.status).toBe(201);
      expect(res.body.token).toBe(`token-ios-${TS}`);
      expect(res.body.platform).toBe('ios');
      expect(res.body.userId).toBe(userA.id);
      expect(res.body.id).toBeTruthy();
    });

    it('re-registering the same token by the same user is idempotent (200? 201? — accepts either)', async () => {
      const res = await apiFetch('/devices', {
        method: API.post,
        body: { token: `token-ios-${TS}`, platform: 'ios' },
        headers: bearer(userA.accessToken),
      });
      // Idempotent upsert — 201 is the fixed contract
      expect(res.status).toBe(201);
      expect(res.body.token).toBe(`token-ios-${TS}`);
    });

    it('re-registering by a DIFFERENT user transfers ownership', async () => {
      // First, user A registers
      const resA = await apiFetch('/devices', {
        method: API.post,
        body: { token: `transfer-${TS}`, platform: 'android' },
        headers: bearer(userA.accessToken),
      });
      expect(resA.status).toBe(201);
      const idA = resA.body.id;

      // Then user B registers the same token
      const resB = await apiFetch('/devices', {
        method: API.post,
        body: { token: `transfer-${TS}`, platform: 'android' },
        headers: bearer(userB.accessToken),
      });
      expect(resB.status).toBe(201);
      // Same record, different owner
      expect(resB.body.id).toBe(idA);
      expect(resB.body.userId).toBe(userB.id);

      // User A should no longer see it
      const listA = await apiFetch('/devices', {
        headers: bearer(userA.accessToken),
      });
      expect(listA.status).toBe(200);
      const aTokens = listA.body as any[];
      expect(aTokens.some((t: any) => t.token === `transfer-${TS}`)).toBe(false);
    });
  });

  describe('GET /devices — list scoped to user', () => {
    beforeAll(async () => {
      // Register tokens for both users
      await apiFetch('/devices', {
        method: API.post,
        body: { token: `a-phone-${TS}`, platform: 'ios' },
        headers: bearer(userA.accessToken),
      });
      await apiFetch('/devices', {
        method: API.post,
        body: { token: `b-phone-${TS}`, platform: 'android' },
        headers: bearer(userB.accessToken),
      });
    });

    it('user A sees only their own tokens', async () => {
      const res = await apiFetch('/devices', {
        headers: bearer(userA.accessToken),
      });
      expect(res.status).toBe(200);
      const tokens = res.body as any[];
      // Should include a-phone and token-ios (and transfer- moved away)
      expect(tokens.some((t: any) => t.token === `a-phone-${TS}`)).toBe(true);
      // Must NOT include other user's tokens
      expect(tokens.some((t: any) => t.token === `b-phone-${TS}`)).toBe(false);
      // All tokens belong to user A
      for (const t of tokens) {
        expect(t.userId).toBe(userA.id);
      }
    });

    it('user B sees only their own tokens', async () => {
      const res = await apiFetch('/devices', {
        headers: bearer(userB.accessToken),
      });
      expect(res.status).toBe(200);
      const tokens = res.body as any[];
      expect(tokens.some((t: any) => t.token === `b-phone-${TS}`)).toBe(true);
      expect(tokens.some((t: any) => t.token === `a-phone-${TS}`)).toBe(false);
      for (const t of tokens) {
        expect(t.userId).toBe(userB.id);
      }
    });
  });

  describe('DELETE /devices/:token', () => {
    it('deletes an existing token and returns 204', async () => {
      const res = await apiFetch(`/devices/a-phone-${TS}`, {
        method: API.delete,
        headers: bearer(userA.accessToken),
      });
      expect(res.status).toBe(204);

      // Verify it's gone
      const list = await apiFetch('/devices', {
        headers: bearer(userA.accessToken),
      });
      expect((list.body as any[]).some((t: any) => t.token === `a-phone-${TS}`)).toBe(false);
    });

    it('deleting an unknown token is idempotent (204)', async () => {
      const res = await apiFetch('/devices/nonexistent-token-xyz', {
        method: API.delete,
        headers: bearer(userA.accessToken),
      });
      expect(res.status).toBe(204);
    });
  });

  describe('security boundary — cross-user isolation', () => {
    it('user A cannot delete user B\'s token', async () => {
      // B has b-phone-TS registered. A tries to delete it.
      const res = await apiFetch(`/devices/b-phone-${TS}`, {
        method: API.delete,
        headers: bearer(userA.accessToken),
      });
      // Should return 204 (idempotent — as if token doesn't exist for user A)
      expect(res.status).toBe(204);

      // But B should still see it
      const listB = await apiFetch('/devices', {
        headers: bearer(userB.accessToken),
      });
      expect((listB.body as any[]).some((t: any) => t.token === `b-phone-${TS}`)).toBe(true);
    });

    it('user A cannot see user B\'s tokens via list', async () => {
      const res = await apiFetch('/devices', {
        headers: bearer(userA.accessToken),
      });
      const tokens = res.body as any[];
      // None should belong to user B
      expect(tokens.every((t: any) => t.userId === userA.id)).toBe(true);
    });
  });

  describe('unauthenticated', () => {
    it('returns 401 without auth header', async () => {
      const res = await apiFetch('/devices');
      expect(res.status).toBe(401);
    });

    it('returns 401 on POST without auth', async () => {
      const res = await apiFetch('/devices', {
        method: API.post,
        body: { token: 'some-token', platform: 'ios' },
      });
      expect(res.status).toBe(401);
    });

    it('returns 401 on DELETE without auth', async () => {
      const res = await apiFetch('/devices/some-token', { method: API.delete });
      expect(res.status).toBe(401);
    });
  });
});
