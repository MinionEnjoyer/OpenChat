/**
 * Integration test for FR-AUTH-007 — presence status persists via PATCH /auth/me.
 *
 * Tests against the real API (shared dev stack on 3030). Uses Node's http module
 * to bypass the jest-expo fetch polyfill which doesn't handle real HTTP.
 *
 * @satisfies FR-AUTH-007
 */

import http from 'http';

const BASE = 'http://localhost:3030/api';

interface User {
  id: string;
  username: string;
  status: string | null;
}

interface DevLoginResponse extends User {
  accessToken: string;
  refreshToken: string;
}

function httpReq<T>(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE}${path}`);
    const opts: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers = { ...opts.headers, Authorization: `Bearer ${token}` };

    const req = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (chunk: Buffer) => { buf += chunk.toString(); });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 0, data: JSON.parse(buf) as T });
        } catch {
          resolve({ status: res.statusCode ?? 0, data: buf as unknown as T });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('FR-AUTH-007 integration — presence status persistence', () => {
  let token: string;

  beforeAll(async () => {
    const { status, data } = await httpReq<DevLoginResponse>(
      'POST', '/auth/dev-login', undefined, { username: 'alice' },
    );

    if (status !== 201) throw new Error(`dev-login failed: ${status} — ${JSON.stringify(data)}`);
    token = data.accessToken;
  });

  // @satisfies FR-AUTH-007
  it('sets status to DND via PATCH /auth/me and verifies it persisted', async () => {
    // Set status to DND
    const patchRes = await httpReq<User>('PATCH', '/auth/me', token, { status: 'DND' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.data.status).toBe('DND');

    // Verify by fetching fresh data (do not trust the 200 alone)
    const getRes = await httpReq<User>('GET', '/auth/me', token);
    expect(getRes.status).toBe(200);
    expect(getRes.data.status).toBe('DND');
  });

  // @satisfies FR-AUTH-007
  it('sets status to INVISIBLE and verifies it persisted', async () => {
    const patchRes = await httpReq<User>('PATCH', '/auth/me', token, { status: 'INVISIBLE' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.data.status).toBe('INVISIBLE');

    const getRes = await httpReq<User>('GET', '/auth/me', token);
    expect(getRes.status).toBe(200);
    expect(getRes.data.status).toBe('INVISIBLE');
  });

  // @satisfies FR-AUTH-007
  it('sets status back to ONLINE and verifies it persisted', async () => {
    const patchRes = await httpReq<User>('PATCH', '/auth/me', token, { status: 'ONLINE' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.data.status).toBe('ONLINE');

    const getRes = await httpReq<User>('GET', '/auth/me', token);
    expect(getRes.status).toBe(200);
    expect(getRes.data.status).toBe('ONLINE');
  });
});
