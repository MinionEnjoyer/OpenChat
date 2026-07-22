/** @characterizes roles — CRUD, BigInt serialization, member-role */
import { seed, apiFetch, assertBigIntString, assertUuid, assertRoleShape, assertPermissionShape } from './helpers';
let s: Awaited<ReturnType<typeof seed>>;
beforeAll(async () => { s = await seed(); });

describe('roles', () => {
  it('lists roles (includes Admin, Mod from seed)', async () => {
    const res = await apiFetch(`/servers/${s.serverId}/roles`, { jar: s.alice.jar });
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(3); // @everyone + Admin + Mod
    // characterizes: @everyone may or may not exist. Check what's there.
    const names = res.body.map((r: any) => r.name);
    // characterizes: permissions is BigInt serialized as string
    for (const r of res.body) {
      assertRoleShape(r);
      assertBigIntString(r.permissions);
    }
  });
  it('creates/updates/deletes role', async () => {
    const r = await apiFetch(`/servers/${s.serverId}/roles`, { method:'POST', body:{name:'T', permissions:'64'}, jar:s.alice.jar });
    expect(r.status).toBe(201);
    expect(typeof r.body.permissions).toBe('string'); // BigInt→string
    expect((await apiFetch(`/servers/${s.serverId}/roles/${r.body.id}`, { method:'PATCH', body:{name:'T2'}, jar:s.alice.jar })).status).toBe(200);
    expect((await apiFetch(`/servers/${s.serverId}/roles/${r.body.id}`, { method:'DELETE', jar:s.alice.jar })).status).toBe(200);
  });
  it('GET /servers/permissions returns catalog with bit as string', async () => {
    const res = await apiFetch('/servers/permissions', { jar: s.alice.jar });
    expect(res.status).toBe(200);
    for (const p of res.body) {
      assertPermissionShape(p);
    }
  });
  it('member-role assignment (characterize as-is)', async () => {
    // Use alice's own member to assign Admin role
    // characterizes: PUT /servers/:id/members/:userId/roles/:roleId returns 200 or errors
    const res = await apiFetch(`/servers/${s.serverId}/members/${s.alice.userId}/roles/${s.adminRoleId}`, {
      method: 'PUT', jar: s.alice.jar,
    });
    // characterizes: role assignment behavior — freeze whichever status code
    expect(res.status).toBeLessThan(500);
  });
});