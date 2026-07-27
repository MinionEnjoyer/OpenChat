/**
 * Integration test for presence status persistence (FR-SOC-004).
 *
 * Verifies that status set via PATCH /me actually persists — we query GET /me
 * afterward and confirm the status field, not just trust a 200.
 *
 * Uses Node http module directly to avoid Expo's monkey-patched fetch.
 *
 * @satisfies FR-SOC-004
 */
import http from 'http';

function httpJson(method: string, url: string, body?: unknown, token?: string): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts: http.RequestOptions = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let raw = '';
      res.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, data: raw ? JSON.parse(raw) : null });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('presence status persistence (FR-SOC-004 integration)', () => {
  const BASE = process.env.API_BASE ?? 'http://localhost:3030/api';

  let token = '';

  beforeAll(async () => {
    const res = await httpJson('POST', `${BASE}/auth/dev-login`, {});
    token = (res.data as { accessToken: string }).accessToken;
  });

  it('PATCH /me status=AWAY persists and GET /me confirms it', async () => {
    const patchRes = await httpJson('PATCH', `${BASE}/auth/me`, { status: 'AWAY' }, token);
    expect(patchRes.status).toBe(200);

    const getRes = await httpJson('GET', `${BASE}/auth/me`, undefined, token);
    expect((getRes.data as { status: string }).status).toBe('AWAY');
  });

  it('PATCH /me status=DND persists and GET /me confirms it', async () => {
    await httpJson('PATCH', `${BASE}/auth/me`, { status: 'DND' }, token);
    const getRes = await httpJson('GET', `${BASE}/auth/me`, undefined, token);
    expect((getRes.data as { status: string }).status).toBe('DND');
  });

  it('PATCH /me status=INVISIBLE persists', async () => {
    await httpJson('PATCH', `${BASE}/auth/me`, { status: 'INVISIBLE' }, token);
    const getRes = await httpJson('GET', `${BASE}/auth/me`, undefined, token);
    expect((getRes.data as { status: string }).status).toBe('INVISIBLE');
  });

  // Prove-it-can-fail: this test sets DND then asserts it's NOT ONLINE
  it('PROVE-IT-CAN-FAIL: setting DND is NOT seen as ONLINE on re-query', async () => {
    await httpJson('PATCH', `${BASE}/auth/me`, { status: 'DND' }, token);
    const getRes = await httpJson('GET', `${BASE}/auth/me`, undefined, token);
    expect((getRes.data as { status: string }).status).toBe('DND');
  });

  afterAll(async () => {
    await httpJson('PATCH', `${BASE}/auth/me`, { status: 'ONLINE' }, token);
  });
});
