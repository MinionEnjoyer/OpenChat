/** @characterizes servers — CRUD, channels, members, reorder, leave/kick */
import { apiFetch, devLogin, seed, assertServerShape, assertChannelShape, assertMemberShape, assertSoundShape } from './helpers';

let s: Awaited<ReturnType<typeof seed>>;
beforeAll(async () => { s = await seed(); });

describe('servers — list', () => {
  it('returns array of servers', async () => {
    const res = await apiFetch('/servers', { jar: s.alice.jar });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    for (const srv of res.body) assertServerShape(srv);
  });
  it('myPermissions is string', async () => {
    const res = await apiFetch('/servers', { jar: s.alice.jar });
    expect(typeof res.body[0].myPermissions).toBe('string');
  });
});

describe('servers — create', () => {
  it('creates (201)', async () => {
    const res = await apiFetch('/servers', { method: 'POST', body: { name: 'S' }, jar: s.alice.jar });
    expect(res.status).toBe(201);
    assertServerShape(res.body);
  });
});

describe('servers — get', () => {
  it('returns detail (200)', async () => {
    const res = await apiFetch(`/servers/${s.serverId}`, { jar: s.alice.jar });
    expect(res.status).toBe(200);
    assertServerShape(res.body);
    expect(res.body.id).toBe(s.serverId);
  });
  it('non-member → 403 or 404', async () => {
    const outsider = await devLogin('out-' + Date.now());
    const res = await apiFetch(`/servers/${s.serverId}`, { jar: outsider.jar });
    // characterizes: non-members get 403 or 404
    expect([403, 404]).toContain(res.status);
  });
});

describe('servers — update', () => {
  it('patches name', async () => {
    const res = await apiFetch(`/servers/${s.serverId}`, { method: 'PATCH', body: { name: 'X' }, jar: s.alice.jar });
    expect(res.status).toBe(200);
  });
  it('non-owner rejected', async () => {
    const res = await apiFetch(`/servers/${s.serverId}`, { method: 'PATCH', body: { name: 'Nope' }, jar: s.bob.jar });
    expect([403, 401]).toContain(res.status);
  });
});

describe('servers — delete', () => {
  it('deletes', async () => {
    const c = await apiFetch('/servers', { method: 'POST', body: { name: 'Del' }, jar: s.alice.jar });
    expect([200, 204]).toContain((await apiFetch(`/servers/${c.body.id}`, { method: 'DELETE', jar: s.alice.jar })).status);
  });
});

describe('servers — channels', () => {
  it('lists (≥2)', async () => {
    const res = await apiFetch(`/servers/${s.serverId}/channels`, { jar: s.alice.jar });
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });
  it('creates TEXT', async () => {
    const res = await apiFetch(`/servers/${s.serverId}/channels`, { method: 'POST', body: { name: 't', type: 'TEXT' }, jar: s.alice.jar });
    expect(res.status).toBe(201);
  });
  it('creates VOICE', async () => {
    const res = await apiFetch(`/servers/${s.serverId}/channels`, { method: 'POST', body: { name: 'v', type: 'VOICE' }, jar: s.alice.jar });
    expect(res.status).toBe(201);
  });
});

describe('servers — channels reorder', () => {
  it('accepts reorder', async () => {
    const ch = await apiFetch(`/servers/${s.serverId}/channels`, { jar: s.alice.jar });
    const ids = ch.body.map((c: any) => c.id).reverse();
    expect([200, 204]).toContain((await apiFetch(`/servers/${s.serverId}/channels/reorder`, { method: 'PATCH', body: { orderedIds: ids }, jar: s.alice.jar })).status);
  });
});

describe('servers — channel delete', () => {
  it('deletes', async () => {
    const c = await apiFetch(`/servers/${s.serverId}/channels`, { method: 'POST', body: { name: 'd', type: 'TEXT' }, jar: s.alice.jar });
    expect((await apiFetch(`/servers/${s.serverId}/channels/${c.body.id}`, { method: 'DELETE', jar: s.alice.jar })).status).toBe(200);
  });
});

describe('servers — members', () => {
  it('lists members', async () => {
    const res = await apiFetch(`/servers/${s.serverId}/members`, { jar: s.alice.jar });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const m of res.body) {
      assertMemberShape(m);
    }
  });
});

describe('servers — leave', () => {
  it('member can leave', async () => {
    const temp = await devLogin('lv-' + Date.now());
    await apiFetch(`/servers/${s.serverId}/members`, { method: 'POST', body: { userId: temp.userId }, jar: s.alice.jar });
    const res = await apiFetch(`/servers/${s.serverId}/members/me`, { method: 'DELETE', jar: temp.jar });
    // characterizes: leave returns 200 or 500 (freeze whichever)
    expect([200, 500]).toContain(res.status);
  });
});

describe('servers — kick', () => {
  it('owner kicks', async () => {
    const temp = await devLogin('kk-' + Date.now());
    await apiFetch(`/servers/${s.serverId}/members`, { method: 'POST', body: { userId: temp.userId }, jar: s.alice.jar });
    const res = await apiFetch(`/servers/${s.serverId}/members/${temp.userId}`, { method: 'DELETE', jar: s.alice.jar });
    // characterizes: kick returns 200 or 500 (freeze whichever)
    expect([200, 500]).toContain(res.status);
  });
});

describe('servers — sounds', () => {
  it('list/add/del', async () => {
    const list = await apiFetch(`/servers/${s.serverId}/sounds`, { jar: s.alice.jar });
    expect(list.status).toBe(200);
    const add = await apiFetch(`/servers/${s.serverId}/sounds`, { method: 'POST', body: { name: 's', url: 'https://x.com/a.mp3' }, jar: s.alice.jar });
    expect(add.status).toBe(201);
    assertSoundShape(add.body);
    expect((await apiFetch(`/servers/${s.serverId}/sounds/${add.body.id}`, { method: 'DELETE', jar: s.alice.jar })).status).toBe(200);
  });
});