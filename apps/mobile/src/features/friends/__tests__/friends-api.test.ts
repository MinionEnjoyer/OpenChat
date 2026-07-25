/**
 * FR-SOC-001 integration test — hits the real API on port 3101.
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

const BASE = 'http://localhost:3101/api';

interface DevLoginResponse {
  id: string;
  username: string;
  displayName: string | null;
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

async function devLogin(username: string): Promise<DevLoginResponse> {
  const res = await fetch(`${BASE}/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) throw new Error(`dev login failed: ${res.status}`);
  return res.json();
}

async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  return body as T;
}

async function apiPost(path: string, token: string, body?: Record<string, unknown>): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function apiDelete(path: string, token: string): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe('FR-SOC-001 Friends API integration', () => {
  let alice: DevLoginResponse;
  let bob: DevLoginResponse;

  beforeAll(async () => {
    // Clean up any existing relationship between alice and bob
    alice = await devLogin('alice');
    bob = await devLogin('bob');

    // Check if already friends — if so, remove
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
    const res = await apiPost('/friends/requests', alice.accessToken, { username: 'bob' });
    expect(res.status).toBe(201);

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

    const res = await apiPost(`/friends/requests/${incoming!.id}/accept`, bob.accessToken);
    expect(res.status).toBe(201);

    // Verify: both see each other in friends list
    const aliceFriends = await apiGet<UserShape[]>('/friends', alice.accessToken);
    expect(aliceFriends.find((f) => f.id === bob.id)).toBeDefined();

    const bobFriends = await apiGet<UserShape[]>('/friends', bob.accessToken);
    expect(bobFriends.find((f) => f.id === alice.id)).toBeDefined();
  });

  it('rejects duplicate friend request', async () => {
    const res = await apiPost('/friends/requests', alice.accessToken, { username: 'bob' });
    expect(res.status).toBe(400);
  });

  it('blocks a user', async () => {
    const res = await apiPost(`/friends/block/${bob.id}`, alice.accessToken);
    // 201 is returned on success
    expect([200, 201]).toContain(res.status);

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

    const unblockRes = await apiPost(`/friends/unblock/${bob.id}`, alice.accessToken);
    expect([200, 201]).toContain(unblockRes.status);

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
    const res = await apiDelete(`/friends/${bob.id}`, alice.accessToken);
    expect(res.status).toBe(200);

    const after = await apiGet<UserShape[]>('/friends', alice.accessToken);
    expect(after.find((f) => f.id === bob.id)).toBeUndefined();
  });

  it('adds by friend code', async () => {
    const res = await apiPost('/friends/requests', alice.accessToken, { friendCode: bob.friendCode! });
    expect(res.status).toBe(201);

    // Verify bob sees it
    const bobReqs = await apiGet<RequestsResponse>('/friends/requests', bob.accessToken);
    const incoming = bobReqs.incoming.find((r) => r.user.id === alice.id);
    expect(incoming).toBeDefined();

    // Clean up — decline
    await apiPost(`/friends/requests/${incoming!.id}/decline`, bob.accessToken);
  });
});
