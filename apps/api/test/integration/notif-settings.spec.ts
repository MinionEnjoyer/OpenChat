/**
 * FR-NOTIF-003 — Notification settings CRUD integration test.
 *
 * Verifies the full lifecycle: PUT (create/update), GET (list), DELETE against
 * the real API, using dev-login and actual database persistence.
 *
 * @satisfies FR-NOTIF-003
 */
import { apiFetch, createJar } from '../characterization/helpers';

const API = { get: 'GET', put: 'PUT', delete: 'DELETE', post: 'POST' } as const;

async function devLogin(username: string) {
  const res = await apiFetch('/auth/dev-login', {
    method: API.post,
    body: { username },
    jar: createJar(),
  });
  expect(res.status).toBe(201);
  return { token: (res.body as any).accessToken as string, userId: (res.body as any).id as string };
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe('FR-NOTIF-003 — notification settings CRUD', () => {
  const TEST_USERNAME = `notif-test-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let user: { token: string; userId: string };
  let serverId: string;
  let channelId: string;

  beforeAll(async () => {
    user = await devLogin(TEST_USERNAME);
    expect(user.token).toBeTruthy();

    // Create a server so we have scopeIds to work with
    const srv = await apiFetch('/servers', {
      method: API.post,
      body: { name: 'Notif Settings Test' },
      headers: auth(user.token),
    });
    expect(srv.status).toBe(201);
    serverId = (srv.body as any).id;
    expect(serverId).toBeTruthy();

    // Create a channel
    const ch = await apiFetch(`/servers/${serverId}/channels`, {
      method: API.post,
      body: { name: 'general', type: 'TEXT' },
      headers: auth(user.token),
    });
    expect(ch.status).toBe(201);
    channelId = (ch.body as any).id;
    expect(channelId).toBeTruthy();
  });

  afterAll(async () => {
    // Clean up: delete channel, server, and leave no trace
    try {
      await apiFetch(`/servers/${serverId}/channels/${channelId}`, {
        method: API.delete,
        headers: auth(user.token),
      });
    } catch { /* best-effort */ }
    await apiFetch(`/servers/${serverId}`, { method: API.delete, headers: auth(user.token) }).catch(() => {});
  });

  it('starts with no settings', async () => {
    const res = await apiFetch('/notifications/settings', {
      headers: auth(user.token),
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as any[]).length).toBe(0);
  });

  it('PUT creates a server-level notification override', async () => {
    const res = await apiFetch('/notifications/settings', {
      method: API.put,
      body: { scope: 'SERVER', scopeId: serverId, level: 'MENTIONS' },
      headers: auth(user.token),
    });
    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body.scope).toBe('SERVER');
    expect(body.scopeId).toBe(serverId);
    expect(body.level).toBe('MENTIONS');
    expect(body.userId).toBe(user.userId);
    expect(body.id).toBeTruthy();
  });

  it('GET returns the created setting (not just a 200)', async () => {
    const res = await apiFetch('/notifications/settings', {
      headers: auth(user.token),
    });
    expect(res.status).toBe(200);
    const settings = res.body as any[];
    expect(settings.length).toBe(1);
    expect(settings[0].scope).toBe('SERVER');
    expect(settings[0].scopeId).toBe(serverId);
    expect(settings[0].level).toBe('MENTIONS');
  });

  it('PUT updates an existing override (same scope+scopeId)', async () => {
    const res = await apiFetch('/notifications/settings', {
      method: API.put,
      body: { scope: 'SERVER', scopeId: serverId, level: 'NONE' },
      headers: auth(user.token),
    });
    expect(res.status).toBe(200);
    expect((res.body as any).level).toBe('NONE');

    // Verify via GET — there should still be exactly 1 setting
    const getRes = await apiFetch('/notifications/settings', {
      headers: auth(user.token),
    });
    expect(getRes.status).toBe(200);
    expect((getRes.body as any[]).length).toBe(1);
    expect((getRes.body as any[])[0].level).toBe('NONE');
  });

  it('PUT creates a channel-level override', async () => {
    const res = await apiFetch('/notifications/settings', {
      method: API.put,
      body: { scope: 'CHANNEL', scopeId: channelId, level: 'ALL', mutedUntil: null },
      headers: auth(user.token),
    });
    expect(res.status).toBe(200);
    expect((res.body as any).scope).toBe('CHANNEL');
    expect((res.body as any).scopeId).toBe(channelId);
    expect((res.body as any).level).toBe('ALL');

    // GET should now return 2 settings
    const getRes = await apiFetch('/notifications/settings', {
      headers: auth(user.token),
    });
    expect(getRes.status).toBe(200);
    expect((getRes.body as any[]).length).toBe(2);
  });

  it('DELETE removes a specific setting', async () => {
    // Find the channel setting ID
    const getRes = await apiFetch('/notifications/settings', {
      headers: auth(user.token),
    });
    const channelSetting = (getRes.body as any[]).find(
      (s: any) => s.scope === 'CHANNEL' && s.scopeId === channelId,
    );
    expect(channelSetting).toBeTruthy();

    const delRes = await apiFetch(`/notifications/settings/${channelSetting.id}`, {
      method: API.delete,
      headers: auth(user.token),
    });
    expect(delRes.status).toBe(200);

    // GET should return 1 setting again
    const after = await apiFetch('/notifications/settings', {
      headers: auth(user.token),
    });
    expect(after.status).toBe(200);
    expect((after.body as any[]).length).toBe(1);
    expect((after.body as any[])[0].scope).toBe('SERVER');
  });

  it('DELETE on non-existent setting returns 404', async () => {
    const res = await apiFetch('/notifications/settings/00000000-0000-0000-0000-000000000000', {
      method: API.delete,
      headers: auth(user.token),
    });
    expect(res.status).toBe(404);
  });

  it('PUT with mutedUntil sets a future mute', async () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const res = await apiFetch('/notifications/settings', {
      method: API.put,
      body: { scope: 'SERVER', scopeId: serverId, level: 'MENTIONS', mutedUntil: future },
      headers: auth(user.token),
    });
    expect(res.status).toBe(200);
    const date = new Date((res.body as any).mutedUntil);
    expect(date.getTime()).toBeGreaterThan(Date.now() - 5000);
  });
});
