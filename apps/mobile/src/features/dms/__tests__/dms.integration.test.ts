// @satisfies FR-SOC-002
/**
 * Integration test: DMs — POST /dms idempotency and shape (FR-SOC-002).
 *
 * Tests against the real running API (localhost:3030).
 * - Creates two test users, establishes friendship
 * - POST /dms creates or returns existing DM channel (idempotent)
 * - Verifies response shape matches DmChannelDto contract
 * - Verifies GET /dms lists the DM channel, sorted by activity
 */
import { describe, it, expect, beforeAll } from '@jest/globals';

const API = 'http://localhost:3030/api';

function withCookie(
  setCookie: string | null | undefined,
  extra: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const cookie = setCookie?.split(';')[0];
  if (cookie) headers.cookie = cookie;
  return headers;
}

describe('FR-SOC-002 integration — POST /dms', () => {
  let aliceHeaders: Record<string, string>;
  let bobHeaders: Record<string, string>;
  let aliceId: string;
  let bobId: string;

  beforeAll(async () => {
    // Login as alice
    const aliceLogin = await fetch(`${API}/auth/dev-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'alice' }),
    });
    aliceHeaders = withCookie(aliceLogin.headers.get('set-cookie'), {
      'content-type': 'application/json',
    });

    const aliceMe = await fetch(`${API}/auth/me`, { headers: aliceHeaders });
    aliceId = (await aliceMe.json()).id;

    // Login as bob
    const bobLogin = await fetch(`${API}/auth/dev-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'bob' }),
    });
    bobHeaders = withCookie(bobLogin.headers.get('set-cookie'), {
      'content-type': 'application/json',
    });

    const bobMe = await fetch(`${API}/auth/me`, { headers: bobHeaders });
    bobId = (await bobMe.json()).id;

    // Ensure alice → bob friendship exists
    // Send friend request
    await fetch(`${API}/friends/requests`, {
      method: 'POST',
      headers: aliceHeaders,
      body: JSON.stringify({ username: 'bob' }),
    });

    // Accept as bob — get the request ID from bob's incoming
    const bobIncoming = await fetch(`${API}/friends/requests`, { headers: bobHeaders });
    const { incoming } = await bobIncoming.json();
    if (incoming && incoming.length > 0) {
      await fetch(`${API}/friends/requests/${incoming[0].id}/accept`, {
        method: 'POST',
        headers: bobHeaders,
      });
    }
  });

  it('POST /dms returns DmChannelDto shape for friends', async () => {
    const res = await fetch(`${API}/dms`, {
      method: 'POST',
      headers: aliceHeaders,
      body: JSON.stringify({ userId: bobId }),
    });

    expect(res.status).toBeLessThan(400);

    const dm = await res.json();

    // DmChannelDto shape assertions
    expect(typeof dm.id).toBe('string');
    expect(dm.type === 'DM' || dm.type === 'GROUP_DM').toBe(true);
    expect(Array.isArray(dm.recipients)).toBe(true);
    expect(dm.recipients.length).toBeGreaterThanOrEqual(2);

    // Each recipient is a DmUser
    for (const r of dm.recipients) {
      expect(typeof r.id).toBe('string');
      expect(typeof r.username).toBe('string');
      expect(r.displayName === null || typeof r.displayName === 'string').toBe(true);
      expect(r.avatarUrl === null || typeof r.avatarUrl === 'string').toBe(true);
      expect(typeof r.status).toBe('string');
    }

    // lastMessageAt is ISO string or null
    expect(dm.lastMessageAt === null || typeof dm.lastMessageAt === 'string').toBe(true);
    if (dm.lastMessageAt !== null) {
      expect(new Date(dm.lastMessageAt).getTime()).not.toBeNaN();
    }
  });

  it('POST /dms is idempotent — same userId returns same channel', async () => {
    const res1 = await fetch(`${API}/dms`, {
      method: 'POST',
      headers: aliceHeaders,
      body: JSON.stringify({ userId: bobId }),
    });
    const dm1 = await res1.json();

    const res2 = await fetch(`${API}/dms`, {
      method: 'POST',
      headers: aliceHeaders,
      body: JSON.stringify({ userId: bobId }),
    });
    const dm2 = await res2.json();

    expect(dm1.id).toBe(dm2.id);
    expect(dm1.type).toBe(dm2.type);
    expect(dm1.recipients.length).toBe(dm2.recipients.length);
  });

  it('GET /dms lists the DM channel sorted by activity', async () => {
    const res = await fetch(`${API}/dms`, { headers: aliceHeaders });
    expect(res.status).toBe(200);

    const dms = await res.json();
    expect(Array.isArray(dms)).toBe(true);

    // Find our DM channel
    const ourDm = dms.find((d: { id: string }) => d.id !== undefined && d.recipients?.some((r: { id: string }) => r.id === bobId));
    expect(ourDm).toBeDefined();

    // Verify sort order: if multiple, lastMessageAt should be descending
    if (dms.length >= 2 && dms[0].lastMessageAt && dms[1].lastMessageAt) {
      const t0 = new Date(dms[0].lastMessageAt).getTime();
      const t1 = new Date(dms[1].lastMessageAt).getTime();
      expect(t0).toBeGreaterThanOrEqual(t1);
    }
  });

  it('POST /dms with non-friend returns 403', async () => {
    // Use carol who has no friends
    const carolLogin = await fetch(`${API}/auth/dev-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'carol' }),
    });
    const carolHeaders = withCookie(carolLogin.headers.get('set-cookie'), {
      'content-type': 'application/json',
    });

    const res = await fetch(`${API}/dms`, {
      method: 'POST',
      headers: carolHeaders,
      body: JSON.stringify({ userId: aliceId }),
    });

    expect(res.status).toBe(403);
  });
});
