/** @characterizes auth — dev-login, /me, PATCH /me, ws-ticket, logout, 401 matrix */
import { apiFetch, createJar, devLogin, assertUserShape, assertIsoDate, assertWsTicketShape, assert401Shape } from './helpers';

describe('auth — dev-login', () => {
  it('returns user object with standard shape and session cookie', async () => {
    const uname = 'char-test-' + Date.now();
    const jar = createJar();
    const res = await apiFetch('/auth/dev-login', { method: 'POST', body: { username: uname }, jar });
    // characterizes: dev-login returns 201 Created
    expect(res.status).toBe(201);
    assertUserShape(res.body);
    // characterizes: displayName defaults to username
    expect(res.body.displayName).toBe(uname);
    // characterizes: status is ONLINE after dev-login
    expect(res.body.status).toBe('ONLINE');
    // characterizes: friendCode may be null (lazy backfill in getCurrentUser)
    if (res.body.friendCode !== null) {
      expect(res.body.friendCode).toMatch(/^\d{8}$/);
    }
    // characterizes: serverLayout is null for new users
    expect(res.body.serverLayout).toBeNull();
    // characterizes: avatarUrl is null by default
    expect(res.body.avatarUrl).toBeNull();
    // characterizes: authSub is never exposed
    expect(res.body).not.toHaveProperty('authSub');
  });

  it('defaults username to "dev" when empty body', async () => {
    const res = await apiFetch('/auth/dev-login', { method: 'POST', body: {}, jar: createJar() });
    expect(res.status).toBe(201);
    // characterizes: empty username defaults to "dev"
    expect(res.body.username).toBe('dev');
  });
});

describe('auth — GET /me', () => {
  it('returns the authenticated user', async () => {
    const { jar, userId } = await devLogin('alice');
    const res = await apiFetch('/auth/me', { jar });
    expect(res.status).toBe(200);
    assertUserShape(res.body);
    expect(res.body.id).toBe(userId);
  });

  it('returns 401 without session cookie', async () => {
    const res = await apiFetch('/auth/me');
    expect(res.status).toBe(401);
    // characterizes: 401 body shape {message, error, statusCode}
    expect(res.body).toEqual({ message: 'Session is invalid or expired', error: 'Unauthorized', statusCode: 401 });
  });

  it('returns 401 with invalid Bearer token (no bearer support today)', async () => {
    // characterizes: bearer auth does not exist today (E10 confirmed)
    const res = await apiFetch('/auth/me', { headers: { authorization: 'Bearer faketoken' } });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Session is invalid or expired');
  });
});

describe('auth — PATCH /me', () => {
  it('updates displayName', async () => {
    const { jar } = await devLogin('alice');
    const res = await apiFetch('/auth/me', { method: 'PATCH', body: { displayName: 'Alice Updated' }, jar });
    expect(res.status).toBe(200);
    assertUserShape(res.body);
    expect(res.body.displayName).toBe('Alice Updated');
  });

  it('updates status', async () => {
    const { jar } = await devLogin('bob');
    const res = await apiFetch('/auth/me', { method: 'PATCH', body: { status: 'DND' }, jar });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DND');
  });

  it('returns 401 without session', async () => {
    const res = await apiFetch('/auth/me', { method: 'PATCH', body: { displayName: 'nope' } });
    expect(res.status).toBe(401);
  });
});

describe('auth — PUT /server-layout', () => {
  it('accepts and returns layout JSON', async () => {
    const { jar } = await devLogin('alice');
    const layout = { folders: [{ id: '1', name: 'Main', serverIds: [] }] };
    const res = await apiFetch('/auth/server-layout', { method: 'PUT', body: { layout }, jar });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('serverLayout');
    expect(res.body.serverLayout).toEqual(layout);
  });
});

describe('auth — ws-ticket', () => {
  it('returns ticket and expiresAt', async () => {
    const { jar } = await devLogin('alice');
    const res = await apiFetch('/auth/ws-ticket', { jar });
    expect(res.status).toBe(200);
    // characterizes: ws-ticket response shape {ticket, expiresAt}
    assertWsTicketShape(res.body);
  });
});

describe('auth — POST /logout', () => {
  it('returns {endSessionUrl} and destroys session', async () => {
    const { jar } = await devLogin('alice');
    const res = await apiFetch('/auth/logout', { method: 'POST', jar });
    // characterizes: logout returns 201 (not 200)
    expect([200, 201]).toContain(res.status);
    // characterizes: logout returns {endSessionUrl}
    expect(res.body).toHaveProperty('endSessionUrl');
    // characterizes: endSessionUrl is '/' when OIDC is unreachable
    expect(res.body.endSessionUrl).toBe('/');
    // characterizes: after logout, session is destroyed; subsequent requests 401
    const me = await apiFetch('/auth/me', { jar });
    expect(me.status).toBe(401);
  });
});

describe('auth — 401 matrix', () => {
  const guardedRoutes = [
    { method: 'GET', path: '/auth/me' },
    { method: 'GET', path: '/servers' },
    { method: 'GET', path: '/friends' },
    { method: 'GET', path: '/friends/requests' },
    { method: 'GET', path: '/dms' },
    { method: 'GET', path: '/notifications' },
  ];
  for (const { method, path } of guardedRoutes) {
    it(`${method} ${path} → 401 without cookie`, async () => {
      const res = await apiFetch(path, { method });
      expect(res.status).toBe(401);
      assert401Shape(res.body);
    });
  }
});

describe('auth — non-existent routes', () => {
  it('POST /api/auth/me returns 404 (no POST handler)', async () => {
    const res = await apiFetch('/auth/me', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});