// @satisfies FR-SOC-002
/**
 * Integration test: DMs — POST /dms idempotency and shape (FR-SOC-002).
 *
 * Tests against the real running API (localhost:3030).
 * Uses node:http because jest-expo mocks fetch (the mock does not actually
 * issue network requests).
 *
 * - Creates two test users, establishes friendship
 * - POST /dms creates or returns existing DM channel (idempotent)
 * - Verifies response shape matches DmChannelDto contract
 * - Verifies GET /dms lists the DM channel, sorted by activity
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import http from 'node:http';
import type { DmChannelDto } from '../../../api/schema';

const HOST = 'localhost';
const PORT = 3030;
const BASE = '/api';

// ── HTTP helper ──

interface RequestOpts {
  cookie?: string;
  body?: Record<string, unknown>;
}

interface RequestResult {
  status: number;
  body: unknown;
  headers: http.IncomingHttpHeaders;
}

function apiReq(method: string, path: string, opts: RequestOpts = {}): Promise<RequestResult> {
  return new Promise((resolve, reject) => {
    const url = `http://${HOST}:${PORT}${BASE}${path}`;
    const parsed = new URL(url);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (opts.cookie) {
      headers['Cookie'] = opts.cookie;
    }
    const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;
    if (bodyStr) {
      headers['Content-Length'] = String(Buffer.byteLength(bodyStr));
    }

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: Number(parsed.port) || PORT,
        path: parsed.pathname + parsed.search,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed: unknown;
          try {
            parsed = raw.length > 0 ? JSON.parse(raw) : undefined;
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode ?? 0, body: parsed, headers: res.headers });
        });
      },
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function extractCookie(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!raw) return '';
  return raw.split(';')[0] ?? '';
}

// ── Tests ──

describe('FR-SOC-002 integration — POST /dms', () => {
  let aliceCookie: string;
  let bobCookie: string;
  let aliceId: string;
  let bobId: string;

  beforeAll(async () => {
    // Login as alice
    const aliceLogin = await apiReq('POST', '/auth/dev-login', {
      body: { username: 'alice' },
    });
    aliceCookie = extractCookie(aliceLogin.headers['set-cookie']);
    aliceId = (aliceLogin.body as Record<string, unknown>).id as string;

    // Login as eve (fresh user, no pre-existing relationship with alice)
    const bobLogin = await apiReq('POST', '/auth/dev-login', {
      body: { username: 'eve' },
    });
    bobCookie = extractCookie(bobLogin.headers['set-cookie']);
    bobId = (bobLogin.body as Record<string, unknown>).id as string;

    // Ensure alice → eve friendship exists
    // Send friend request
    await apiReq('POST', '/friends/requests', {
      cookie: aliceCookie,
      body: { username: 'eve' },
    });

    // Accept as bob
    const bobIncoming = await apiReq('GET', '/friends/requests', {
      cookie: bobCookie,
    });
    const incoming = (bobIncoming.body as { incoming?: { id: string }[] }).incoming;
    if (incoming && incoming.length > 0) {
      await apiReq('POST', `/friends/requests/${incoming[0]!.id}/accept`, {
        cookie: bobCookie,
      });
    }
  });

  it('POST /dms returns DmChannelDto shape for friends', async () => {
    const res = await apiReq('POST', '/dms', {
      cookie: aliceCookie,
      body: { userId: bobId },
    });

    expect(res.status).toBeLessThan(400);

    const dm = res.body as DmChannelDto;

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
    const res1 = await apiReq('POST', '/dms', {
      cookie: aliceCookie,
      body: { userId: bobId },
    });
    const dm1 = res1.body as DmChannelDto;

    const res2 = await apiReq('POST', '/dms', {
      cookie: aliceCookie,
      body: { userId: bobId },
    });
    const dm2 = res2.body as DmChannelDto;

    expect(dm1.id).toBe(dm2.id);
    expect(dm1.type).toBe(dm2.type);
    expect(dm1.recipients.length).toBe(dm2.recipients.length);
  });

  it('GET /dms lists the DM channel sorted by activity', async () => {
    const res = await apiReq('GET', '/dms', { cookie: aliceCookie });
    expect(res.status).toBe(200);

    const dms = res.body as DmChannelDto[];
    expect(Array.isArray(dms)).toBe(true);

    // Find our DM channel
    const ourDm = dms.find(
      (d) =>
        d.id !== undefined &&
        d.recipients?.some((r: { id: string }) => r.id === bobId),
    );
    expect(ourDm).toBeDefined();

    // Verify sort order: if multiple, lastMessageAt should be descending
    if (dms.length >= 2 && dms[0]!.lastMessageAt && dms[1]!.lastMessageAt) {
      const t0 = new Date(dms[0]!.lastMessageAt).getTime();
      const t1 = new Date(dms[1]!.lastMessageAt).getTime();
      expect(t0).toBeGreaterThanOrEqual(t1);
    }
  });

  it('POST /dms with non-friend returns 403', async () => {
    // Use carol who has no friends
    const carolLogin = await apiReq('POST', '/auth/dev-login', {
      body: { username: 'carol' },
    });
    const carolCookie = extractCookie(carolLogin.headers['set-cookie']);

    const res = await apiReq('POST', '/dms', {
      cookie: carolCookie,
      body: { userId: aliceId },
    });

    expect(res.status).toBe(403);
  });
});
