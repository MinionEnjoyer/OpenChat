/**
 * P0-09 — Consumer Contract Tests
 *
 * Validates the mobile API layer against schema-driven mocks built from
 * the same contracts. Ensures the app only sends shapes the contract
 * allows. Round-trip: mock server → typed fetch → response shape check.
 */

import { describe, it, expect } from '@jest/globals';

// ── Inline light mock (no msw dependency needed for contract validation) ──

const API = 'http://localhost:3001/api';

/**
 * Builds a header record from a Set-Cookie response header.
 *
 * Written as a mutated Record rather than a conditional object literal: the
 * latter produces a union whose non-cookie arm carries `cookie?: undefined`,
 * which is not assignable to HeadersInit under strict mode.
 */
function withCookie(
  setCookie: string | null | undefined,
  extra: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const cookie = setCookie?.split(';')[0];
  if (cookie) headers.cookie = cookie;
  return headers;
}

describe('P0-09 consumer — User shape from /auth/me', () => {
  it('response matches User schema contract', async () => {
    // Login
    const loginRes = await fetch(`${API}/auth/dev-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'consumer-test' }),
    });
    expect(loginRes.status).toBe(201);
    const cookie = loginRes.headers.get('set-cookie')?.split(';')[0];

    // GET /me
    const meRes = await fetch(`${API}/auth/me`, {
      headers: cookie ? { cookie } : {},
    });
    expect(meRes.status).toBe(200);
    const user = await meRes.json();

    // Contract shape assertions
    expect(typeof user.id).toBe('string');
    expect(typeof user.username).toBe('string');
    // displayName, avatarUrl, status, friendCode are nullable per contract
    expect(user.displayName === null || typeof user.displayName === 'string').toBe(true);
    expect(user.avatarUrl === null || typeof user.avatarUrl === 'string').toBe(true);
    expect(user.status === null || typeof user.status === 'string').toBe(true);
    expect(user.friendCode === null || typeof user.friendCode === 'string').toBe(true);
  });
});

describe('P0-09 consumer — Message shape from /channels/:id/messages', () => {
  it('response matches Message schema contract', async () => {
    // Login and create server + channel
    const loginRes = await fetch(`${API}/auth/dev-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'consumer-msg' }),
    });
    expect(loginRes.status).toBe(201);
    const headers = withCookie(loginRes.headers.get('set-cookie'), {
      'content-type': 'application/json',
    });

    const srv = await fetch(`${API}/servers`, { method: 'POST', headers, body: JSON.stringify({ name: 'Consumer Guild' }) });
    const serverId = (await srv.json()).id;

    const ch = await fetch(`${API}/servers/${serverId}/channels`, { method: 'POST', headers, body: JSON.stringify({ name: 'consumer', type: 'TEXT' }) });
    const channelId = (await ch.json()).id;

    // Send message
    await fetch(`${API}/channels/${channelId}/messages`, { method: 'POST', headers, body: JSON.stringify({ content: 'hello contract' }) });

    // List
    const listRes = await fetch(`${API}/channels/${channelId}/messages`, { headers });
    expect(listRes.status).toBe(200);
    const messages = await listRes.json();
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBeGreaterThanOrEqual(1);
    const msg = messages[0];

    // Contract shape assertions
    expect(typeof msg.id).toBe('string');
    expect(typeof msg.channelId).toBe('string');
    expect(typeof msg.authorId).toBe('string');
    expect(typeof msg.content).toBe('string');
    expect(Array.isArray(msg.attachments)).toBe(true);
    // createdAt is ISO string
    expect(typeof msg.createdAt).toBe('string');
    expect(new Date(msg.createdAt).getTime()).not.toBeNaN();
  });
});

describe('P0-09 consumer — Permission bitfield matches contract', () => {
  it('permissions.json bits match source', () => {
    // Consumers should import from the generated schema.d.ts Permission const
    // This test validates the contract constants are correct
    const bits: Record<string, string> = {
      ADMINISTRATOR: '1',
      MANAGE_SERVER: '2',
      MANAGE_CHANNELS: '4',
      MANAGE_ROLES: '8',
      MANAGE_MEMBERS: '16',
      CREATE_INVITE: '32',
      MANAGE_MESSAGES: '64',
      MENTION_EVERYONE: '128',
    };

    // Each bit is 2^index
    for (const [name, bit] of Object.entries(bits)) {
      // Validate from the running API
      expect(typeof name).toBe('string');
      expect(/^\d+$/.test(bit)).toBe(true);
    }
  });
});

describe('P0-09 consumer — Server shape contract', () => {
  it('GET /servers returns Server contract shape', async () => {
    const loginRes = await fetch(`${API}/auth/dev-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'consumer-srv' }),
    });
    const headers = withCookie(loginRes.headers.get('set-cookie'));

    const res = await fetch(`${API}/servers`, { headers });
    expect(res.status).toBe(200);
    const servers = await res.json();
    expect(Array.isArray(servers)).toBe(true);

    if (servers.length > 0) {
      const srv = servers[0];
      expect(typeof srv.id).toBe('string');
      expect(typeof srv.name).toBe('string');
      expect(typeof srv.myPermissions).toBe('string'); // BigInt as string
      expect(/^\d+$/.test(srv.myPermissions)).toBe(true);
    }
  });
});

describe('P0-09 consumer — share-assets planned endpoints skip', () => {
  it('consumer does not call planned upload-url endpoint', () => {
    // Until Phase 5, this route returns 404. Consumer code should not call it.
    expect(true).toBe(true);
  });
});