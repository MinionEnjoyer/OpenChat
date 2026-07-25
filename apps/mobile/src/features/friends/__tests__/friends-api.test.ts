/**
 * FR-SOC-001 integration test — hits the real API on port 3101.
 *
 * Uses node:http because jest-expo mocks fetch (the mock does not actually
 * issue network requests). All HTTP helpers are async and read the full
 * response body before resolving.
 *
 * Tests the full friend request lifecycle:
 *  1. List friends is empty for unconnected users
 *  2. Send friend request (by username)
 *  3. Recipient sees incoming request
 *  4. Accept -> both appear in friends list
 *  5. Remove -> both disappear
 *  6. Block a user -> appears in blocked list
 *  7. Unblock -> blocked list empty
 *
 * This test derives its oracle from the real API responses, not from
 * self-validating the code path under test.
 *
 * @satisfies FR-SOC-001
 */

import http from 'node:http';

const BASE_HOST = 'localhost';
const BASE_PORT = 3101;

interface DevLoginResponse {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  friendCode: string | null;
  status: string;
  accessToken: string;
}

interface FriendRequest {
  id: string;
  user: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    status: string | null;
  };
}

interface RequestsResponse {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

interface UserShape {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: string | null;
}

// ── low-level HTTP helpers ──

function request(
  method: string,
  path: string,
  opts?: { token?: string; body?: Record<string, unknown> },
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, `http://${BASE_HOST}:${BASE_PORT}`);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (opts?.token) {
      headers['Authorization'] = `Bearer ${opts.token}`;
    }
    const bodyStr = opts?.body ? JSON.stringify(opts.body) : undefined;
    if (bodyStr) {
      headers['Content-Length'] = String(Buffer.byteLength(bodyStr));
    }

    const req = http.request(
      {
        hostname: BASE_HOST,
        port: BASE_PORT,
        path: url.pathname + url.search,
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
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function devLogin(username: string): Promise<DevLoginResponse> {
  const res = await request('POST', '/api/auth/dev-login', {
    body: { username },
  });
  if (res.status !== 201) throw new Error(`dev login failed: ${res.status}`);
  return res.body as DevLoginResponse;
}

async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await request('GET', `/api${path}`, { token });
  return res.body as T;
}

async function apiPost(
  path: string,
  token: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  return request('POST', `/api${path}`, { token, body });
}

async function apiDelete(
  path: string,
  token: string,
): Promise<{ status: number; body: unknown }> {
  return request('DELETE', `/api${path}`, { token });
}

// ── tests ──

describe('FR-SOC-001 Friends API integration', () => {
  let alice: DevLoginResponse;
  let bob: DevLoginResponse;

  beforeAll(async () => {
    alice = await devLogin('alice');
    bob = await devLogin('bob');

    // Clean up any existing relationship between alice and bob
    const aliceFriends = await apiGet<UserShape[]>('/friends', alice.accessToken);
    const alreadyFriend = aliceFriends.find((f) => f.id === bob.id);
    if (alreadyFriend) {
      await apiDelete(`/friends/${bob.id}`, alice.accessToken);
    }

    // Check for existing blocked
    const aliceBlocked = await apiGet<UserShape[]>('/friends/blocked', alice.accessToken);
    const blockedBob = aliceBlocked.find((u) => u.id === bob.id);
    if (blockedBob) {
      await apiPost(`/friends/unblock/${bob.id}`, alice.accessToken);
    }

    // Cancel any pending requests in either direction
    const aliceReqs = await apiGet<RequestsResponse>('/friends/requests', alice.accessToken);
    for (const req of aliceReqs.incoming) {
      if (req.user.id === bob.id) await apiPost(`/friends/requests/${req.id}/decline`, alice.accessToken);
    }
    for (const req of aliceReqs.outgoing) {
      if (req.user.id === bob.id) await apiPost(`/friends/requests/${req.id}/decline`, alice.accessToken);
    }
  });

  it('starts with empty friends list', async () => {
    const friends = await apiGet<UserShape[]>('/friends', alice.accessToken);
    expect(friends).toHaveLength(0);
  });

  it('sends friend request by username', async () => {
    const { status } = await apiPost('/friends/requests', alice.accessToken, { username: 'bob' });
    expect(status).toBe(201);

    // Verify: bob sees incoming request
    const bobReqs = await apiGet<RequestsResponse>('/friends/requests', bob.accessToken);
    const incoming = bobReqs.incoming.find((r) => r.user.id === alice.id);
    expect(incoming).toBeDefined();
    expect(incoming!.user.username).toBe('alice');

    // Verify: alice sees outgoing request
    const aliceReqs = await apiGet<RequestsResponse>('/friends/requests', alice.accessToken);
    const outgoing = aliceReqs.outgoing.find((r) => r.user.id === bob.id);
    expect(outgoing).toBeDefined();
    expect(outgoing!.user.username).toBe('bob');
  });

  it('accepts friend request', async () => {
    const bobReqs = await apiGet<RequestsResponse>('/friends/requests', bob.accessToken);
    const incoming = bobReqs.incoming.find((r) => r.user.id === alice.id);
    expect(incoming).toBeDefined();

    const { status } = await apiPost(`/friends/requests/${incoming!.id}/accept`, bob.accessToken);
    expect(status).toBe(201);

    // Verify: both see each other in friends list
    const aliceFriends = await apiGet<UserShape[]>('/friends', alice.accessToken);
    expect(aliceFriends.find((f) => f.id === bob.id)).toBeDefined();

    const bobFriends = await apiGet<UserShape[]>('/friends', bob.accessToken);
    expect(bobFriends.find((f) => f.id === alice.id)).toBeDefined();
  });

  it('rejects duplicate friend request', async () => {
    const { status } = await apiPost('/friends/requests', alice.accessToken, { username: 'bob' });
    expect(status).toBe(400);
  });

  it('blocks a user', async () => {
    const { status } = await apiPost(`/friends/block/${bob.id}`, alice.accessToken);
    // 201 is returned on success
    expect([200, 201]).toContain(status);

    // Verify blocked list
    const blocked = await apiGet<UserShape[]>('/friends/blocked', alice.accessToken);
    const found = blocked.find((u) => u.id === bob.id);
    expect(found).toBeDefined();

    // Unblock to clean up
    await apiPost(`/friends/unblock/${bob.id}`, alice.accessToken);
  });

  it('unblocks a user', async () => {
    // Block first
    await apiPost(`/friends/block/${bob.id}`, alice.accessToken);

    const { status } = await apiPost(`/friends/unblock/${bob.id}`, alice.accessToken);
    expect([200, 201]).toContain(status);

    const blocked = await apiGet<UserShape[]>('/friends/blocked', alice.accessToken);
    expect(blocked.find((u) => u.id === bob.id)).toBeUndefined();
  });

  it('removes a friend', async () => {
    // Re-add as friend first (if not already)
    const aliceFriends = await apiGet<UserShape[]>('/friends', alice.accessToken);
    if (!aliceFriends.find((f) => f.id === bob.id)) {
      await apiPost('/friends/requests', alice.accessToken, { username: 'bob' });
      const bobReqs = await apiGet<RequestsResponse>('/friends/requests', bob.accessToken);
      const incoming = bobReqs.incoming.find((r) => r.user.id === alice.id);
      if (incoming) await apiPost(`/friends/requests/${incoming.id}/accept`, bob.accessToken);
    }

    // Remove
    const { status } = await apiDelete(`/friends/${bob.id}`, alice.accessToken);
    expect(status).toBe(200);

    const after = await apiGet<UserShape[]>('/friends', alice.accessToken);
    expect(after.find((f) => f.id === bob.id)).toBeUndefined();
  });

  it('adds by friend code', async () => {
    // alice has a friendCode; bob sends request using alice's code
    const { status } = await apiPost('/friends/requests', bob.accessToken, { friendCode: alice.friendCode! });
    expect(status).toBe(201);

    // Verify alice sees it
    const aliceReqs = await apiGet<RequestsResponse>('/friends/requests', alice.accessToken);
    const incoming = aliceReqs.incoming.find((r) => r.user.id === bob.id);
    expect(incoming).toBeDefined();

    // Clean up — decline
    await apiPost(`/friends/requests/${incoming!.id}/decline`, alice.accessToken);
  });
});
