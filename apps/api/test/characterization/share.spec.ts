/**
 * @characterizes share — ShareService behavior AS IT IS TODAY
 *
 * OpenChat now brokers uploads through its authenticated /uploads route, which calls
 * OpenShare's service-authenticated POST /api/assets contract.
 */

import { shareFetch, createJar } from './helpers';

describe('share — OpenShare public endpoints (per E4/E5)', () => {
  it('GET /raw/:id is public (no auth)', async () => {
    // characterizes: /raw returns 404 for nonexistent IDs (public, no auth required per E4)
    const res = await shareFetch('/raw/nonexistent');
    // characterizes: 404 because ID doesn't exist, not 401 (which would mean auth required)
    expect(res.status).toBe(404);
  });

  it('GET /thumb/:id is public (no auth)', async () => {
    const res = await shareFetch('/thumb/nonexistent');
    // characterizes: /thumb is public (no auth required per E4)
    expect(res.status).toBe(404);
  });

  it('POST /upload requires session (401 without)', async () => {
    const res = await shareFetch('/upload', { method: 'POST' });
    // characterizes: /upload requires auth — 401 without session per E4
    expect(res.status).toBe(401);
  });

  it('OpenShare root serves HTML', async () => {
    const res = await shareFetch('/');
    // characterizes: root serves login page HTML
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('string');
    expect(res.body).toContain('<!DOCTYPE html>');
  });
});

describe('share — OpenChat service upload contract', () => {
  it('POST OpenShare /api/assets requires service authentication', async () => {
    const res = await shareFetch('/api/assets', {
      method: 'POST',
    });
    expect(res.status).toBe(401);
  });
});

describe('share — OpenShare dev-login (P0-02a bypass)', () => {
  it('POST /auth/dev-login creates a dev session', async () => {
    const res = await shareFetch('/auth/dev-login', {
      method: 'POST',
      body: new URLSearchParams({ username: 'test' }).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      jar: createJar(),
    });
    // characterizes: OpenShare dev-login returns user info when DEV_AUTH=1
    expect(res.status).toBe(200);
    // characterizes: dev-login response shape {sub, username}
    if (res.status === 200) {
      expect(res.body).toHaveProperty('sub');
      expect(res.body).toHaveProperty('username');
    }
  });
});
