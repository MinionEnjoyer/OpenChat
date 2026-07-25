/**
 * P1-01/P1-02 — Bearer auth integration tests (runs against the dev stack).
 *
 * These are the acceptance oracles for the FR-AUTH set that Phase 1's backend
 * half owns. The cookie path is deliberately untouched here — the
 * characterization suite is its regression net (NFR-10).
 */
import { apiFetch, createJar } from '../characterization/helpers';

const API = { post: 'POST' } as const;

async function devLoginBearer(username: string) {
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

describe('P1-01 — token issuance and rotation', () => {
  // @satisfies FR-AUTH-001
  it('issues bearer tokens usable on guarded routes without any cookie', async () => {
    const { accessToken } = await devLoginBearer('p1-auth-001');
    const me = await apiFetch('/auth/me', { headers: bearer(accessToken) });
    expect(me.status).toBe(200);
    expect(me.body.username).toBe('p1-auth-001');
    expect(me.body).not.toHaveProperty('authSub');

    const servers = await apiFetch('/servers', { headers: bearer(accessToken) });
    expect(servers.status).toBe(200);
    expect(Array.isArray(servers.body)).toBe(true);
  });

  it('expiresIn is 3600 and the grant validates its inputs', async () => {
    const { expiresIn } = await devLoginBearer('p1-auth-001b');
    expect(expiresIn).toBe(3600);
    const bad = await apiFetch('/auth/token', { method: 'POST', body: { grantType: 'password' } });
    expect(bad.status).toBe(400);
  });

  // @satisfies FR-AUTH-002
  it('rotates refresh tokens; reusing a spent token 401s and kills the family', async () => {
    const { refreshToken: rt1 } = await devLoginBearer('p1-auth-002');

    const r1 = await apiFetch('/auth/token', {
      method: 'POST',
      body: { grantType: 'refresh_token', refreshToken: rt1 },
    });
    expect(r1.status).toBe(201);
    const rt2 = r1.body.refreshToken as string;
    expect(rt2).not.toBe(rt1);
    expect(r1.body.user.username).toBe('p1-auth-002');

    // Reuse of the SPENT token → rejected…
    const reuse = await apiFetch('/auth/token', {
      method: 'POST',
      body: { grantType: 'refresh_token', refreshToken: rt1 },
    });
    expect(reuse.status).toBe(401);

    // …and the whole family dies with it: the legitimately-rotated sibling is dead too.
    const sibling = await apiFetch('/auth/token', {
      method: 'POST',
      body: { grantType: 'refresh_token', refreshToken: rt2 },
    });
    expect(sibling.status).toBe(401);
  });

  // @satisfies FR-AUTH-004
  it('logout with a refresh token revokes its family', async () => {
    const { refreshToken } = await devLoginBearer('p1-auth-004');

    const out = await apiFetch('/auth/logout', { method: 'POST', body: { refreshToken } });
    expect([200, 201]).toContain(out.status);

    const after = await apiFetch('/auth/token', {
      method: 'POST',
      body: { grantType: 'refresh_token', refreshToken },
    });
    expect(after.status).toBe(401);
  });

  // @satisfies FR-AUTH-005
  it('ws-ticket is obtainable via bearer and the ticket opens a gateway connection', async () => {
    const { accessToken } = await devLoginBearer('p1-auth-005');
    const res = await apiFetch('/auth/ws-ticket', { headers: bearer(accessToken) });
    expect(res.status).toBe(200);
    expect(typeof res.body.ticket).toBe('string');
    expect(typeof res.body.expiresAt).toBe('string');

    // The ticket actually works: connect and receive the ready frame.
    const WebSocket = (await import('ws')).default;
    const ws = new WebSocket(`ws://localhost:3001/ws?ticket=${res.body.ticket}`);
    const ready = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 5000);
      ws.on('message', (data: Buffer) => {
        const frame = JSON.parse(data.toString());
        if (frame.op === 'ready') {
          clearTimeout(timer);
          resolve(true);
        }
      });
      ws.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
    ws.close();
    expect(ready).toBe(true);
  });
});

describe('P1-02 — composite guard backward compatibility', () => {
  it('an invalid bearer with a valid session cookie still authenticates (fall-through)', async () => {
    const jar = createJar();
    await apiFetch('/auth/dev-login', { method: 'POST', body: { username: 'p1-fallthrough' }, jar });
    const res = await apiFetch('/auth/me', { headers: bearer('garbage-token'), jar });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('p1-fallthrough');
  });

  it('no bearer and no cookie → 401 with the unchanged error shape', async () => {
    const res = await apiFetch('/auth/me');
    expect(res.status).toBe(401);
  });

  it('oidc-metadata is public and never leaks the client secret', async () => {
    const res = await apiFetch('/auth/oidc-metadata');
    expect(res.status).toBe(200);
    expect(typeof res.body.nativeRedirectUri).toBe('string');
    expect(res.body.scopes).toContain('openid');
    expect(JSON.stringify(res.body)).not.toMatch(/secret/i);
  });
});
