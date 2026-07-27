/**
 * Test-world provision — verifies the provisioned world contains TWO server
 * members: the primary (owner) and the friend (plain member, non-elevated).
 *
 * The friend member is needed for two-participant E2E flows (kick, leave,
 * member-list, role assignment) exercised through the API path.
 */
import { apiFetch, createJar } from '../characterization/helpers';

const API = { post: 'POST', get: 'GET' } as const;

describe('Test-world provision — two-participant', () => {
  let tokens: { accessToken: string };
  let serverId: string;
  let friendUserId: string;
  let primaryUserId: string;

  beforeAll(async () => {
    const jar = createJar();
    const res = await apiFetch('/dev/test-world', {
      method: API.post,
      body: { label: 'two-member' },
      jar,
    });
    expect(res.status).toBe(201);
    tokens = res.body.tokens;
    serverId = res.body.fixtures.serverId;
    friendUserId = res.body.fixtures.friend.userId;
    primaryUserId = res.body.userId;

    // Sanity: primary user is not the friend user
    expect(primaryUserId).not.toBe(friendUserId);
  });

  it('provisioned server has exactly two members', async () => {
    const members = await apiFetch(`/servers/${serverId}/members`, {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(members.status).toBe(200);
    expect(members.body).toHaveLength(2);

    const primary = members.body.find((m: any) => m.userId === primaryUserId);
    const friend = members.body.find((m: any) => m.userId === friendUserId);

    expect(primary).toBeDefined();
    expect(primary.isOwner).toBe(true);

    expect(friend).toBeDefined();
    expect(friend.isOwner).toBe(false);
    expect(friend.roleIds).toEqual([]);
  });

  it('friend member has non-elevated permissions (no roles, not owner)', async () => {
    const members = await apiFetch(`/servers/${serverId}/members`, {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(members.status).toBe(200);

    const friend = members.body.find((m: any) => m.userId === friendUserId);
    expect(friend).toBeDefined();
    expect(friend.isOwner).toBe(false);
    expect(friend.roleIds).toHaveLength(0);
  });
});
